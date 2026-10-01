import { createHash, randomUUID } from "node:crypto";
import {
  gptConnectionStateSchema,
  HubError,
  NotSubmittedError,
  normalizeGptConnection,
  type TurnSettings,
} from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { doctorRepairInstructions } from "./bridge-doctor-policy.js";
import type { GptService } from "./gpt.js";
import { ProjectContext } from "./project-context.js";
import type { Sessions } from "./sessions.js";

type SafeState = {
  provider: "native" | "browser";
  state: string;
  code: string;
  revision: string;
  bridgeRevision: string;
  bridgeVersion: string;
  protocol: number | null;
  capabilities: Record<string, boolean>;
  obstruction: string;
  stage: string;
};
type Incident = {
  projectId: string;
  id: string;
  fingerprint: string;
  previousId?: string;
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  state: "open" | "recovered" | "dismissed";
  diagnostics: SafeState;
  evidence?: { kind: string; reason?: string; base64?: string };
  delivery: "pending" | "dispatching" | "sent" | "unknown" | "skipped";
  threadId?: string;
  turnId?: string;
  attachmentId?: string;
  message?: string;
};
type Association = {
  mode?: "diagnose" | "repair";
  projectId: string;
  threadId: string | null;
  operationId: string;
  state: "empty" | "creating" | "ready" | "unknown";
  enabled: boolean;
  revision: number;
};
const busyStates = ["running", "starting", "waiting_approval", "unknown"];
export function doctorState(raw: unknown, revision: string): SafeState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>,
    v =
      r.provider === "native"
        ? { state: gptConnectionStateSchema.safeParse(r.state).success ? r.state : "unavailable" }
        : normalizeGptConnection(raw);
  const token = (value: unknown, pattern: RegExp) =>
    typeof value === "string" && pattern.test(value) ? value : "unknown";
  return {
    provider: r.provider === "native" ? "native" : "browser",
    state: r.login === "required" ? "login_required" : v.state,
    code:
      r.provider === "native" &&
      typeof r.doctorCode === "string" &&
      /^NATIVE_[A-Z_]{1,60}$/.test(r.doctorCode)
        ? r.doctorCode
        : v.state === "incompatible"
          ? "GPT_CONTRACT_MISMATCH"
          : v.state === "attention"
            ? "GPT_UI_ATTENTION"
            : v.state === "degraded"
              ? "GPT_CAPABILITY_MISSING"
              : v.state === "unavailable"
                ? "GPT_BRIDGE_UNAVAILABLE"
                : "GPT_" + v.state.toUpperCase(),
    revision: token(revision, /^[a-f0-9]{7,40}$/),
    bridgeRevision: token(r.bridgeRevision, /^[a-f0-9]{40}$/),
    bridgeVersion: token(r.bridgeVersion, /^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
    protocol:
      Number.isInteger(r.extensionProtocol) &&
      r.extensionProtocol >= 0 &&
      r.extensionProtocol < 1000
        ? r.extensionProtocol
        : null,
    capabilities:
      r.provider === "native"
        ? { read: r.canRead === true, send: r.canSend === true }
        : Object.fromEntries(
            ["composer", "attachments", "models", "effort", "settingsReadback"].map((key) => [
              key,
              r.capabilities?.[key] === true,
            ]),
          ),
    obstruction: ["clear", "unknown", "owner", "promotion"].includes(r.doctorObstruction)
      ? r.doctorObstruction
      : "unclassified",
    stage: r.doctorStage === "preparation" ? "preparation" : "health",
  };
}
export class BridgeDoctor {
  private pending: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private started: number;
  private candidate: { fingerprint: string; since: number; count: number } | null = null;
  private healthySince = 0;
  constructor(
    readonly sessions: Sessions,
    readonly gpt: GptService,
    readonly now = () => Date.now(),
    readonly revision = process.env.HUB_REVISION ?? "unknown",
  ) {
    this.started = now();
    this.db
      .prepare(
        "UPDATE bridge_doctor_incidents SET value=json_set(value,'$.delivery','unknown','$.message','Отправка прервалась. Автоматического повтора не будет.') WHERE json_extract(value,'$.delivery')='dispatching'",
      )
      .run();
    const a = this.association();
    if (a.state === "creating") this.transition(a, { state: "unknown" });
  }
  private get db() {
    return this.sessions.store.db;
  }
  association(): Association {
    const row = this.db.prepare("SELECT value FROM bridge_doctor_config WHERE id=1").get();
    if (row) return { mode: "diagnose", ...JSON.parse(String(row.value)) };
    const projects = this.sessions.catalog
      .publicProjects()
      .filter(
        (p) =>
          !p.unassigned &&
          !p.archived &&
          !p.deleted &&
          (/^codexweb$/i.test(p.name) || /[\\/]codexweb[\\/]?$/i.test(p.workingDirectory ?? "")),
      );
    return {
      projectId: projects.length === 1 ? projects[0]!.id : "",
      mode: "diagnose",
      threadId: null,
      operationId: randomUUID(),
      state: "empty",
      enabled: true,
      revision: 0,
    };
  }
  private saveAssociation(a: Association) {
    this.db
      .prepare(
        "INSERT INTO bridge_doctor_config VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(a));
    return a;
  }
  private transition(a: Association, patch: Partial<Association>) {
    const current = this.association();
    if (current.operationId !== a.operationId) return current;
    return this.saveAssociation({ ...current, ...patch, revision: current.revision + 1 });
  }
  configure(enabled: boolean, projectId: string, revision: number, mode?: "diagnose" | "repair") {
    const old = this.association();
    if (old.revision !== revision)
      throw new HubError(409, "DOCTOR_CONFLICT", "Настройки изменились. Обнови панель.");
    if (projectId) this.sessions.project(projectId);
    if (old.projectId !== projectId && old.state !== "empty")
      throw new HubError(
        409,
        "DOCTOR_ASSOCIATED",
        "Чат диагностики уже связан с этим проектом. Привязка сохранена.",
      );
    return this.saveAssociation({
      ...old,
      enabled,
      projectId,
      mode: mode ?? old.mode ?? "diagnose",
      revision: revision + 1,
      ...(old.projectId !== projectId
        ? { threadId: null, state: "empty" as const, operationId: randomUUID() }
        : {}),
    });
  }
  bind(threadId: string) {
    const a = this.association(),
      t = this.sessions.thread(threadId),
      context = new ProjectContext(this.sessions, this.gpt),
      scope = {
        client: "codex" as const,
        projectId: a.projectId,
        name: this.sessions.project(a.projectId).name,
      };
    if (
      a.state === "creating" ||
      this.db
        .prepare(
          "SELECT 1 FROM bridge_doctor_incidents WHERE json_extract(value,'$.delivery')='dispatching' LIMIT 1",
        )
        .get() ||
      t.projectId !== a.projectId ||
      (this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='ai_conversation_claims'").get() &&
        this.db
          .prepare("SELECT 1 FROM ai_conversation_claims WHERE provider='codex' AND nativeId=?")
          .get(t.codexThreadId)) ||
      t.archived ||
      busyStates.includes(t.status) ||
      context.current(scope).threadId === threadId
    )
      throw new HubError(
        409,
        "DOCTOR_THREAD_INVALID",
        "Выбери отдельный свободный чат этого проекта.",
      );
    this.db.prepare("UPDATE threads SET diagnostic=1 WHERE id=?").run(threadId);
    return this.saveAssociation({ ...a, threadId, state: "ready", revision: a.revision + 1 });
  }
  list() {
    return this.db
      .prepare("SELECT value FROM bridge_doctor_incidents ORDER BY lastSeen DESC LIMIT 30")
      .all()
      .map((row) => {
        const v = JSON.parse(String(row.value)) as Incident;
        return {
          ...v,
          evidence: v.evidence ? { kind: v.evidence.kind, reason: v.evidence.reason } : undefined,
        };
      });
  }
  get(id: string): Incident {
    const row = this.db.prepare("SELECT value FROM bridge_doctor_incidents WHERE id=?").get(id);
    if (!row) throw new HubError(404, "INCIDENT_MISSING", "Инцидент не найден.");
    return JSON.parse(String(row.value));
  }
  private save(i: Incident) {
    this.db
      .prepare(
        "INSERT INTO bridge_doctor_incidents(id,fingerprint,state,lastSeen,value) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,lastSeen=excluded.lastSeen,value=excluded.value",
      )
      .run(i.id, i.fingerprint, i.state, i.lastSeen, JSON.stringify(i));
    return i;
  }
  dismiss(id: string) {
    const i = this.get(id);
    return this.save({
      ...i,
      state: "dismissed",
      ...(i.delivery === "pending" ? { delivery: "skipped" as const } : {}),
    });
  }
  observe(raw: unknown) {
    const now = this.now(),
      s = doctorState(raw, this.revision),
      a = this.association();
    if (s.state === "healthy") {
      this.candidate = null;
      if (!this.healthySince) this.healthySince = now;
      if (now - this.healthySince >= 30000)
        for (const row of this.db
          .prepare("SELECT value FROM bridge_doctor_incidents WHERE state='open'")
          .all()) {
          const i = JSON.parse(String(row.value));
          this.save({
            ...i,
            state: "recovered",
            lastSeen: now,
            ...(i.delivery === "pending"
              ? { delivery: "skipped", message: "Связь восстановилась до диагностики." }
              : {}),
          });
        }
      return null;
    }
    this.healthySince = 0;
    if (
      !a.enabled ||
      !a.projectId ||
      now - this.started < 60000 ||
      !["incompatible", "degraded", "unavailable", "attention"].includes(s.state) ||
      s.obstruction === "owner" ||
      (s.state === "attention" && s.obstruction !== "unknown")
    ) {
      this.candidate = null;
      return null;
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(s)).digest("hex");
    if (this.candidate?.fingerprint !== fingerprint)
      this.candidate = { fingerprint, since: now, count: 0 };
    this.candidate.count++;
    const old = this.db
        .prepare(
          "SELECT value FROM bridge_doctor_incidents WHERE fingerprint=? ORDER BY lastSeen DESC LIMIT 1",
        )
        .get(fingerprint),
      previous = old ? (JSON.parse(String(old.value)) as Incident) : null;
    if (previous && previous.state !== "recovered") {
      if (now - previous.lastSeen < 10000) return previous;
      return this.save({ ...previous, lastSeen: now, occurrences: previous.occurrences + 1 });
    }
    if (this.candidate.count < 3 || now - this.candidate.since < 45000) return null;
    // Bound pathological contract churn without deleting earlier evidence or spending repeated model turns.
    if (
      Number(
        this.db
          .prepare("SELECT count(*) n FROM bridge_doctor_incidents WHERE lastSeen>?")
          .get(now - 3600000)?.n,
      ) >= 5
    )
      return null;
    if (Number(this.db.prepare("SELECT count(*) n FROM bridge_doctor_incidents").get()?.n) >= 512)
      return null;
    const incident: Incident = {
      projectId: a.projectId,
      id: randomUUID(),
      fingerprint,
      ...(previous ? { previousId: previous.id } : {}),
      firstSeen: this.candidate.since,
      lastSeen: now,
      occurrences: this.candidate.count,
      state: "open",
      diagnostics: s,
      delivery: "pending",
    };
    return this.save(incident);
  }
  async collect(i: Incident) {
    if (i.evidence) return i;
    let evidence: Incident["evidence"] = { kind: "omitted", reason: "CAPTURE_UNAVAILABLE" };
    try {
      const raw = await this.gpt.json("/doctor-evidence");
      if (
        raw.kind === "redacted-layout" &&
        raw.mime === "image/png" &&
        typeof raw.base64 === "string" &&
        raw.base64.length <= 1400000 &&
        /^[A-Za-z0-9+/]+=*$/.test(raw.base64) &&
        Buffer.from(raw.base64, "base64")
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        evidence = { kind: "redacted-layout", base64: raw.base64 };
    } catch {}
    return this.save({ ...this.get(i.id), evidence });
  }
  private reconcile() {
    const a = this.association();
    if (a.state === "unknown") {
      const command = this.db
        .prepare("SELECT state,response FROM commands WHERE scope=? AND key=?")
        .get("bridge-doctor-create:" + a.projectId, a.operationId);
      const id =
        a.threadId ??
        (command?.state === "complete" ? JSON.parse(String(command.response)).id : null);
      const t = id
        ? this.db
            .prepare(
              "SELECT * FROM threads WHERE id=? AND projectId=? AND diagnostic=1 AND archived=0",
            )
            .get(id, a.projectId)
        : null;
      // Exact durable creation evidence repairs only the association, never resends a turn.
      if (t && command?.state === "complete" && JSON.parse(String(command.response)).id === id)
        this.transition(a, { state: "ready", threadId: id });
    }
    for (const row of this.db
      .prepare(
        "SELECT value FROM bridge_doctor_incidents WHERE json_extract(value,'$.delivery')='unknown'",
      )
      .all()) {
      const i = JSON.parse(String(row.value)) as Incident;
      if (!i.threadId) continue;
      const m = this.db
        .prepare("SELECT turnId FROM messages WHERE threadId=? AND id=? AND turnId IS NOT NULL")
        .get(i.threadId, i.id);
      if (m) this.save({ ...i, delivery: "sent", turnId: String(m.turnId), message: undefined });
    }
  }
  async dispatch() {
    this.reconcile();
    let a = this.association();
    if (!a.enabled || !a.projectId || !this.candidate || ["creating", "unknown"].includes(a.state))
      return;
    const next = this.db
      .prepare(
        "SELECT value FROM bridge_doctor_incidents WHERE state='open' AND json_extract(value,'$.delivery')='pending' AND json_extract(value,'$.projectId')=? AND fingerprint=? ORDER BY lastSeen LIMIT 1",
      )
      .get(a.projectId, this.candidate.fingerprint);
    if (!next) return;
    let i = JSON.parse(String(next.value)) as Incident;
    this.saveAssociation(a);
    await this.sessions.externalActivity.refresh();
    a = this.association();
    if (!a.enabled || a.projectId !== i.projectId || ["creating", "unknown"].includes(a.state))
      return;
    const project = this.sessions.project(a.projectId),
      context = new ProjectContext(this.sessions, this.gpt),
      scope = { client: "codex" as const, projectId: a.projectId, name: project.name };
    // Observe desktop choice and all owner work; never release, resume, interrupt or steal it.
    try {
      this.sessions.assertWritable(a.projectId);
      context.assertProject(scope);
    } catch {
      return;
    }
    if (!a.threadId) {
      const current = context.current(scope);
      if (current.threadId) context.adopt(scope, current.threadId);
      a = this.transition(a, { state: "creating" });
      try {
        const t = (await this.sessions.store.once(
          "bridge-doctor-create:" + a.projectId,
          a.operationId,
          { projectId: a.projectId },
          () =>
            this.sessions.create(a.projectId, "Bridge Doctor", true, undefined, (created) => {
              a = this.transition(a, { threadId: created.id });
            }),
        )) as { id: string };
        if (this.sessions.thread(t.id).projectId !== a.projectId)
          throw Error("INVALID_DOCTOR_THREAD");
        a = this.transition(a, { threadId: t.id, state: "ready" });
      } catch {
        this.transition(a, { state: "unknown" });
        return;
      }
    }
    let t: ReturnType<Sessions["thread"]>;
    try {
      t = this.sessions.thread(a.threadId!);
    } catch {
      this.transition(a, { state: "unknown" });
      return;
    }
    if (t.archived) {
      this.transition(a, { state: "unknown" });
      return;
    }
    if (busyStates.includes(t.status)) {
      try {
        t = await this.sessions.inspect(t.id, true);
      } catch {
        return;
      }
    }
    if (t.archived || busyStates.includes(t.status) || context.current(scope).threadId === t.id)
      return;
    i = await this.collect(i);
    if (this.stopped || !this.association().enabled || i.state !== "open") return;
    const repair = a.mode === "repair";
    const caps = await this.sessions.capabilities(a.projectId),
      settings: TurnSettings = {
        ...caps.defaults,
        access: repair ? "full" : "workspace",
        mode: "default",
      };
    if (
      i.evidence?.base64 &&
      caps.models.find((m) => m.id === settings.model)?.supportsImages &&
      !i.attachmentId
    ) {
      try {
        const file = await this.sessions.attachments.put(
          t.id,
          "bridge-layout.png",
          Buffer.from(i.evidence.base64, "base64"),
        );
        i = this.save({ ...i, attachmentId: file.id });
      } catch {}
    }
    const prompt = [
      repair
        ? "GPT Bridge Doctor: восстанови работу интеграции по инциденту ниже."
        : "GPT Bridge Doctor: диагностируй сбой интеграции по сводке ниже.",
      repair
        ? doctorRepairInstructions
        : "Выбран режим диагностики без изменений: изучи код и доступные сведения, дай краткий отчёт о причине и исправлении. Для внесения изменений владелец может включить автоматический ремонт в настройках Bridge Doctor.",
      "Incident " + i.id,
      "Диагностика: " +
        JSON.stringify({
          id: i.id,
          fingerprint: i.fingerprint,
          firstSeen: i.firstSeen,
          lastSeen: i.lastSeen,
          occurrences: i.occurrences,
          ...i.diagnostics,
        }),
      i.evidence?.kind === "redacted-layout"
        ? "Снимок показывает только геометрию UI: весь текст, сообщения, ввод и личные области скрыты."
        : "Снимок безопасно получить не удалось.",
    ].join("\n\n");
    const latest = this.association();
    if (
      this.stopped ||
      !latest.enabled ||
      latest.threadId !== t.id ||
      this.get(i.id).state !== "open"
    )
      return;
    i = this.save({ ...this.get(i.id), threadId: t.id, delivery: "dispatching" });
    try {
      const response = (await this.sessions.store.once(
        "turn:" + t.id,
        i.id,
        { text: prompt, settings, attachments: i.attachmentId ? [i.attachmentId] : [] },
        () =>
          this.sessions.startTurn(
            t.id,
            prompt,
            settings,
            i.attachmentId ? [i.attachmentId] : [],
            i.id,
            true,
            {
              maintenance: repair ? "bridge-repair" : "bridge-diagnosis",
              ...(repair ? { instructions: doctorRepairInstructions } : {}),
              beforeCommit: () => {
                const current = this.association();
                if (
                  !current.enabled ||
                  current.threadId !== t.id ||
                  current.mode !== a.mode ||
                  this.get(i.id).state !== "open"
                )
                  throw new HubError(
                    409,
                    "DOCTOR_CHANGED",
                    "Настройки Doctor изменились до отправки.",
                  );
              },
            },
          ),
      )) as { turnId: string };
      this.save({
        ...this.get(i.id),
        delivery: "sent",
        turnId: response.turnId,
        message: undefined,
      });
    } catch (e) {
      if (
        e instanceof NotSubmittedError &&
        ["THREAD_NOT_PERSISTED", "THREAD_NOT_FOUND", "THREAD_ARCHIVED"].includes(e.code)
      ) {
        // A definite pre-send refusal may rotate the maintenance destination.
        // Historical threads, incidents and receipts remain; no uncertain send is retried.
        this.transition(a, { state: "empty", threadId: null, operationId: randomUUID() });
      }
      this.save({
        ...this.get(i.id),
        delivery: e instanceof NotSubmittedError ? "pending" : "unknown",
        message:
          e instanceof NotSubmittedError
            ? e.message
            : "Codex не подтвердил отправку. Автоматического повтора не будет.",
      });
    }
  }
  async pulse() {
    if (this.pending || this.stopped || !this.gpt.available()) return;
    const work = (async () => {
      let raw: unknown = null;
      try {
        raw = await this.gpt.doctorReport();
      } catch {}
      if (this.stopped) return;
      const incident = this.observe(raw);
      if (incident && incident.state === "open" && !incident.evidence) await this.collect(incident);
      await this.dispatch();
    })();
    this.pending = work;
    try {
      await work;
    } catch {
    } finally {
      this.pending = null;
    }
  }
  start() {
    this.timer = setInterval(() => void this.pulse(), 15000).unref();
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.pending;
  }
}
export function registerBridgeDoctor(app: FastifyInstance, sessions: Sessions, gpt: GptService) {
  const doctor = new BridgeDoctor(sessions, gpt);
  doctor.start();
  app.get("/api/gpt/doctor", async () => ({
    association: doctor.association(),
    incidents: doctor.list(),
    projects: sessions.catalog
      .publicProjects()
      .filter((p) => !p.unassigned && !p.archived && !p.deleted)
      .map((p) => ({ id: p.id, name: p.name })),
    threads: sessions.store.db
      .prepare(
        "SELECT id,title FROM threads WHERE projectId=? AND archived=0 ORDER BY updatedAt DESC LIMIT 50",
      )
      .all(doctor.association().projectId),
  }));
  app.post("/api/gpt/doctor/settings", async (req) => {
    const v = z
      .object({
        enabled: z.boolean(),
        projectId: z.string().max(100),
        revision: z.number().int().nonnegative(),
        mode: z.enum(["diagnose", "repair"]).optional(),
      })
      .strict()
      .parse(req.body);
    return doctor.configure(v.enabled, v.projectId, v.revision, v.mode);
  });
  app.post("/api/gpt/doctor/bind", async (req) =>
    doctor.bind(z.object({ threadId: z.string().uuid() }).strict().parse(req.body).threadId),
  );
  app.post("/api/gpt/doctor/:id/dismiss", async (req) =>
    doctor.dismiss(z.object({ id: z.string().uuid() }).parse(req.params).id),
  );
  app.get("/api/gpt/doctor/:id/evidence", async (req, reply) => {
    const i = doctor.get(z.object({ id: z.string().uuid() }).parse(req.params).id);
    if (!i.evidence?.base64) throw new HubError(404, "EVIDENCE_MISSING", "Снимок недоступен.");
    return reply
      .header("Cache-Control", "no-store")
      .type("image/png")
      .send(Buffer.from(i.evidence.base64, "base64"));
  });
  return doctor;
}
