import { createHash } from "node:crypto";
import { HubError } from "@codex-web/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { createApp } from "./app.js";
import type { Communication } from "./communication.js";

type Runtime = Awaited<ReturnType<typeof createApp>>;
const destination = z
  .object({ kind: z.enum(["work", "intake"]), projectId: z.string().min(1).max(200) })
  .strict();
type Destination = z.infer<typeof destination>;
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
const changed = () =>
  new HubError(
    409,
    "HANDOFF_BINDING_CHANGED",
    "Получатель изменился. Выбери рабочий чат или разбор заново.",
  );

function target(runtime: Runtime, d: Destination) {
  runtime.sessions.authorizeExecution();
  const p = runtime.sessions.project(d.projectId);
  runtime.projectWork.context.assertProject({ client: "codex", projectId: p.id, name: p.name });
  if (d.kind === "intake")
    return { ...d, title: p.name, threadId: null, binding: runtime.intake.resultBinding(p.id) };
  const current = runtime.projectWork.context.current({
    client: "codex",
    projectId: p.id,
    name: p.name,
  });
  if (!current.threadId) throw changed();
  const thread = runtime.sessions.thread(current.threadId);
  // Include the exact own checkout and native conversation, not just a display title.
  return {
    ...d,
    title: p.name,
    threadId: thread.id,
    binding: JSON.stringify([
      runtime.sessions.executionBinding,
      thread.workingDirectory,
      p.id,
      p.machineId,
      p.workingDirectory,
      thread.id,
      thread.codexThreadId,
      current.revision,
    ]),
  };
}

/** Private, durable draft references. These routes never dispatch a model turn. */
export function registerResultWorkHandoffs(
  app: FastifyInstance,
  communication: Communication,
  actor: (req: FastifyRequest) => string,
  personal: (id: string) => Promise<{ runtime: Runtime }>,
) {
  const write = { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } };
  app.get("/api/team/result-work-targets", async (req) => {
    const user = actor(req),
      { runtime } = await personal(user);
    actor(req);
    const items = [];
    for (const p of runtime.sessions.catalog.projects()) {
      for (const kind of ["work", "intake"] as const) {
        try {
          items.push(target(runtime, { kind, projectId: p.id }));
        } catch (error) {
          if (!(error instanceof HubError)) throw error;
        }
      }
    }
    return {
      items: items.map(({ binding, ...item }) => ({ ...item, binding: fingerprint(binding) })),
    };
  });
  app.post("/api/team/result-work-handoffs", write, async (req) => {
    const user = actor(req),
      key = z.string().uuid().parse(req.headers["idempotency-key"]),
      input = z
        .object({
          snapshotId: z.string().uuid(),
          destination,
          binding: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(req.body);
    communication.ownerSnapshot(user, input.snapshotId);
    const { runtime } = await personal(user);
    actor(req);
    const selected = target(runtime, input.destination),
      scope = `${selected.kind}:${selected.projectId}`;
    if (fingerprint(selected.binding) !== input.binding) throw changed();
    return communication.team.once(user, "result.work.handoff", key, input, () => {
      if (
        Number(
          communication.db
            .prepare("SELECT count(*) n FROM result_ai_handoffs WHERE ownerId=?")
            .get(user)?.n,
        ) >= 2000
      )
        throw new HubError(413, "HANDOFF_LIMIT", "Хранилище передач заполнено.");
      communication.db
        .prepare("INSERT INTO result_ai_handoffs VALUES(?,?,?,?,?,0,?)")
        .run(
          key,
          user,
          input.snapshotId,
          scope,
          JSON.stringify({ destination: input.destination, binding: selected.binding }),
          Date.now(),
        );
      return { id: key, threadId: selected.threadId };
    });
  });
  app.get("/api/team/result-work-handoffs", async (req) => {
    const user = actor(req),
      query = z
        .object({
          projectId: z.string().max(200).optional(),
          threadId: z.string().max(200).optional(),
        })
        .strict()
        .parse(req.query);
    const { runtime } = await personal(user);
    actor(req);
    let d: Destination;
    if (query.threadId) {
      const t = runtime.sessions.thread(query.threadId);
      d = { kind: "work", projectId: t.projectId };
    } else d = { kind: "intake", projectId: z.string().min(1).parse(query.projectId) };
    const selected = target(runtime, d);
    if (query.threadId && selected.threadId !== query.threadId) return { items: [] };
    return {
      items: communication.db
        .prepare(
          "SELECT h.id,f.name title,f.bytes,f.sha256 FROM result_ai_handoffs h JOIN shared_result_files f ON f.id=h.snapshotId WHERE h.ownerId=? AND h.threadId=? AND h.binding=? AND h.dismissed=0 ORDER BY h.createdAt DESC LIMIT 100",
        )
        .all(
          user,
          `${d.kind}:${d.projectId}`,
          JSON.stringify({ destination: d, binding: selected.binding }),
        )
        .filter(
          (row) =>
            !runtime.store.db
              .prepare("SELECT 1 FROM attachments WHERE id=? AND messageId IS NOT NULL")
              .get(String(row.id)),
        ),
    };
  });
  app.post("/api/team/result-work-handoffs/:id/attachment", write, async (req) => {
    const user = actor(req),
      id = z.object({ id: z.string().uuid() }).parse(req.params).id;
    const row = communication.db
      .prepare("SELECT * FROM result_ai_handoffs WHERE id=? AND ownerId=? AND dismissed<>1")
      .get(id, user);
    if (!row || !/^(work|intake):/.test(String(row.threadId)))
      throw new HubError(404, "HANDOFF_UNAVAILABLE", "Материал недоступен.");
    const saved = JSON.parse(String(row.binding)),
      d = destination.parse(saved.destination);
    const { runtime } = await personal(user);
    const check = () => {
      actor(req);
      if (target(runtime, d).binding !== saved.binding) throw changed();
    };
    check();
    const selected = target(runtime, d),
      snapshot = communication.ownerSnapshot(user, String(row.snapshotId));
    const threadId =
      selected.threadId ?? (await runtime.intake.resultThread(d.projectId, saved.binding)).id;
    check();
    const file = await runtime.sessions.attachments.putFile(
      threadId,
      snapshot.title,
      snapshot.data,
      id,
    );
    check();
    if (file.messageId)
      throw new HubError(
        409,
        "HANDOFF_ALREADY_SENT",
        "Этот экземпляр уже отправлен. Передай результат заново для нового сообщения.",
      );
    const captured = createHash("sha256");
    for await (const chunk of runtime.sessions.attachments.stream(id).stream)
      captured.update(chunk);
    check();
    if (captured.digest("hex") !== snapshot.sha256)
      throw new HubError(
        409,
        "HANDOFF_BYTES_CHANGED",
        "Копия файла не совпала с результатом. Передай материал заново.",
      );
    communication.db
      .prepare("UPDATE result_ai_handoffs SET dismissed=2 WHERE id=? AND ownerId=?")
      .run(id, user);
    return { file, sha256: snapshot.sha256 };
  });
}
