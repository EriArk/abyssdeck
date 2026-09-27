import { createHash } from "node:crypto";
import { HubError, type WorkspaceNotice } from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notificationText } from "./push-content.js";
import type { Sessions } from "./sessions.js";

/** A bounded current-state inbox in the actor's private store, independent of Web Push. */
export function registerWorkspaceNotices(app: FastifyInstance, sessions: Sessions) {
  const store = sessions.store,
    db = store.db;
  const hash = (key: string) => createHash("sha256").update(key).digest("hex");
  const list = () => {
    const items: WorkspaceNotice[] = [];
    const projects = new Set(
      sessions.catalog
        .projects()
        .filter((p) => {
          const meta = sessions.catalog.library.get("project", p.id);
          return !meta?.deleted && !meta?.archived;
        })
        .map((p) => p.id),
    );
    const meta = (client: string, kind: string, id: string) =>
      JSON.parse(
        String(
          db
            .prepare("SELECT value FROM library_entities WHERE client=? AND kind=? AND id=?")
            .get(client, kind, id)?.value ?? "{}",
        ),
      );
    const available = (client: string, kind: string, id: string) => {
      const value = meta(client, kind, id);
      return !value.deleted && !value.archived;
    };
    const since = Date.now() - 30 * 86400000;
    for (const t of db
      .prepare(
        "SELECT * FROM threads WHERE archived=0 AND (completedSeq>seenSeq OR status IN ('waiting_approval','unknown')) ORDER BY updatedAt DESC LIMIT 100",
      )
      .all()) {
      if (
        !projects.has(String(t.projectId)) ||
        !available("codex", "thread", String(t.codexThreadId)) ||
        !available("codex", "thread", String(t.id))
      )
        continue;
      const attention = t.status === "waiting_approval" || t.status === "unknown";
      const at = Date.parse(String(t.updatedAt));
      if (!attention && at < since) continue;
      const title =
        notificationText(meta("codex", "thread", String(t.codexThreadId)).name || t.title, 100) ||
        "Чат Codex";
      items.push({
        id: hash(
          `codex:${t.id}:${attention ? t.status + ":" + (t.activeTurnId || t.updatedAt) : t.completedSeq}`,
        ),
        title,
        detail:
          t.status === "waiting_approval"
            ? "Codex ждёт ответа или разрешения"
            : t.status === "unknown"
              ? "Проверь состояние работы Codex"
              : t.completedStatus === "failed"
                ? "Работа Codex остановилась с ошибкой"
                : "Работа Codex завершена",
        at,
        target: {
          client: "codex",
          kind: "thread",
          id: String(t.id),
          threadId: String(t.id),
          projectId: String(t.projectId),
          title,
          ...(!attention && t.completedTurnId ? { turnId: String(t.completedTurnId) } : {}),
          availability: "available",
        },
      });
    }
    for (const j of db
      .prepare(
        "SELECT id,nativeId,status,updatedAt FROM gpt_jobs WHERE status IN ('completed','failed','unknown') AND nativeId IS NOT NULL AND nativeId<>'' AND updatedAt>=? ORDER BY updatedAt DESC LIMIT 100",
      )
      .all(since)) {
      const nativeId = String(j.nativeId),
        thread = meta("gpt", "thread", nativeId);
      if (
        !available("gpt", "thread", nativeId) ||
        (thread.projectId && !available("gpt", "project", thread.projectId))
      )
        continue;
      const title = notificationText(thread.name, 100) || "Чат GPT";
      items.push({
        id: hash(`gpt:${j.id}:${j.status}`),
        title,
        detail:
          j.status === "completed"
            ? "Ответ GPT готов"
            : j.status === "failed"
              ? "Работа GPT остановилась с ошибкой"
              : "Проверь отправку в GPT",
        at: Number(j.updatedAt),
        target: {
          client: "gpt",
          kind: "thread",
          id: nativeId,
          threadId: nativeId,
          title,
          ...(thread.projectId ? { projectId: thread.projectId } : {}),
          availability: "available",
        },
      });
    }
    for (const p of db
      .prepare(
        "SELECT id,scope,revision,updatedAt,json_extract(value,'$.title') title FROM project_plans WHERE json_extract(value,'$.status')='done' AND updatedAt>=? ORDER BY updatedAt DESC LIMIT 100",
      )
      .all(since)) {
      const scope = JSON.parse(String(p.scope));
      if (
        scope.client === "codex"
          ? !projects.has(scope.projectId)
          : !available("gpt", "project", scope.projectId)
      )
        continue;
      const title = notificationText(p.title, 100) || "План";
      items.push({
        id: hash(`plan:${p.id}:${p.revision}`),
        title,
        detail: "План отмечен завершённым",
        at: Number(p.updatedAt),
        target: {
          client: scope.client,
          kind: "plan",
          id: String(p.id),
          projectId: scope.projectId,
          title,
          availability: "available",
        },
      });
    }
    return items.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  };
  const read = () => z.array(z.string()).catch([]).parse(store.preferences().workspaceNoticeReads);
  app.get("/api/workspace/notices", () => {
    const seen = new Set(read());
    return { items: list().filter((n) => !seen.has(n.id)) };
  });
  app.post("/api/workspace/notices/read", (req) => {
    const { ids } = z
      .object({ ids: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(300) })
      .strict()
      .parse(req.body);
    const current = new Set(list().map((n) => n.id));
    store.setPreferences({
      workspaceNoticeReads: [...new Set([...read(), ...ids])].filter((id) => current.has(id)),
    });
    return { ok: true };
  });
  app.post("/api/workspace/notices/open", (req) => {
    const { id } = z
      .object({ id: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(req.body);
    const notice = list().find((n) => n.id === id);
    if (!notice) throw new HubError(404, "NOTICE_MISSING", "Событие больше недоступно.");
    return notice.target;
  });
}
