import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { BridgeDoctor, doctorState } from "../apps/hub/dist/bridge-doctor.js";
import { NativeGptProvider } from "../apps/hub/dist/gpt-native-provider.js";
import { ProjectContext } from "../apps/hub/dist/project-context.js";
import { GPT_BRIDGE_REVISION, HubError, NotSubmittedError } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const report = (state = "healthy", extra = {}) => ({
  contract: 1,
  bridgeRevision: GPT_BRIDGE_REVISION,
  bridgeVersion: "6.3.14",
  extensionProtocol: 5,
  state,
  login: "authenticated",
  capabilities: {
    composer: true,
    attachments: true,
    models: true,
    effort: true,
    settingsReadback: true,
  },
  privateState: { permissions: true, locked: true },
  doctorObstruction: "clear",
  ...extra,
});
async function fixture(t) {
  const f = await handoffFixture();
  t.after(() => f.close());
  let now = 100000;
  const gpt = {
      json: async () => ({ kind: "omitted" }),
      available: () => true,
      doctorReport: async () => report(),
    },
    doctor = new BridgeDoctor(f.sessions, gpt, () => now, "abcdef123");
  doctor.configure(true, "project", 0);
  const fault = () => {
    now += 60001;
    doctor.observe(report("degraded"));
    now += 25000;
    doctor.observe(report("degraded"));
    now += 25000;
    return doctor.observe(report("degraded"));
  };
  return { f, doctor, gpt, fault, advance: (n) => (now += n), now: () => now };
}
test("Doctor debounces faults, deduplicates safe fingerprints, resolves after sustained health and preserves history", async (t) => {
  const { doctor, fault, advance } = await fixture(t);
  for (const state of ["busy", "starting", "login_required", "healthy"])
    doctor.observe(report(state));
  assert.equal(doctor.list().length, 0);
  const first = fault();
  assert(first);
  assert.equal(doctor.list().length, 1);
  advance(15000);
  doctor.observe(report("degraded"));
  assert.equal(doctor.list()[0].occurrences, 4);
  doctor.observe(report("healthy"));
  advance(30001);
  doctor.observe(report("healthy"));
  assert.equal(doctor.list()[0].state, "recovered");
  assert.equal(doctor.list()[0].delivery, "skipped");
  const again = fault();
  assert(again);
  assert.notEqual(again.id, first.id);
  assert.equal(again.previousId, first.id);
  const safe = doctorState(
    report("incompatible", {
      accessToken: "private-token",
      cookie: "owner-cookie",
      rawDom: "private conversation",
      bridgeVersion: "secret@example.com",
      doctorStage: "url-with-token",
      doctorObstruction: "unknown",
    }),
    "bad-secret",
  );
  assert(!JSON.stringify(safe).includes("private"));
  assert(!JSON.stringify(safe).includes("secret"));
  assert.equal(safe.bridgeVersion, "unknown");
});
test("Doctor ignores owner-controlled dialogs, login and recovered one-off failures", async (t) => {
  const { doctor, advance } = await fixture(t);
  advance(70000);
  for (const raw of [
    report("attention", { doctorObstruction: "owner" }),
    report("attention"),
    report("incompatible", { login: "required", bridgeVersion: "9.0.0" }),
    report("busy"),
    report("starting"),
  ]) {
    for (let n = 0; n < 6; n++) {
      advance(15000);
      doctor.observe(raw);
    }
  }
  assert.equal(doctor.list().length, 0);
  doctor.observe(null);
  advance(10000);
  doctor.observe(report());
  advance(60000);
  doctor.observe(report());
  assert.equal(doctor.list().length, 0);
});
test("Doctor creates one dedicated read-only native chat and send without changing Current or preferences", async (t) => {
  const { f, doctor, gpt, fault } = await fixture(t);
  const base = f.rpc.request.bind(f.rpc);
  f.rpc.request = async (method, params) => {
    if (method === "thread/start") {
      f.calls.push({ method, params });
      return { thread: { id: randomUUID(), historyMode: "paginated" } };
    }
    return base(method, params);
  };
  const context = new ProjectContext(f.sessions, gpt),
    scope = { client: "codex", projectId: "project", name: "Project" },
    before = context.current(scope),
    preferences = { ...f.store.preferences() };
  const incident = fault();
  await doctor.dispatch();
  assert.equal(f.calls.filter((c) => c.method === "thread/start").length, 0); // desktop choice is respected
  await f.release();
  const clients = { ...f.store.preferences() };
  await doctor.dispatch();
  assert.equal(doctor.list()[0].delivery, "sent");
  const association = doctor.association();
  assert(association.threadId);
  assert.notEqual(association.threadId, before.threadId);
  assert.equal(context.current(scope).threadId, before.threadId);
  assert.deepEqual(f.store.preferences(), clients);
  const create = f.calls.filter((c) => c.method === "thread/start"),
    send = f.calls.filter((c) => c.method === "turn/start");
  assert.equal(create.length, 1);
  assert.equal(send.length, 1);
  assert.equal(create[0].params.sandbox, "read-only");
  assert.deepEqual(send[0].params.sandboxPolicy, { type: "readOnly" });
  assert.equal(send[0].params.approvalPolicy, "never");
  assert.equal(send[0].params.clientUserMessageId, incident.id);
  assert.match(send[0].params.input[0].text, /диагностики без изменений/);
  await doctor.dispatch();
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 1);
});
test("lost Doctor creation/send acknowledgements cannot create or submit a second native operation", async (t) => {
  const { f, doctor, gpt, fault, now, advance } = await fixture(t);
  await f.release();
  fault();
  let creates = 0;
  f.sessions.create = async () => {
    creates++;
    throw Error("lost creation ack");
  };
  await doctor.dispatch();
  assert.equal(doctor.association().state, "unknown");
  await doctor.dispatch();
  assert.equal(creates, 1);
  const afterRestart = new BridgeDoctor(f.sessions, gpt, now, "abcdef123");
  await afterRestart.dispatch();
  assert.equal(creates, 1);
  // Bind only an explicit separate idle thread; never the Current chat.
  assert.throws(() => afterRestart.bind(f.thread.id), /отдельный/);
  const recovered = f.store.createThread("project", randomUUID(), "Bridge Doctor");
  afterRestart.bind(recovered.id);
  advance(60001);
  afterRestart.observe(report("degraded"));
  f.loseAck();
  await afterRestart.dispatch();
  assert.equal(afterRestart.list()[0].delivery, "unknown");
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 1);
  await afterRestart.dispatch();
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 1);
});

test("native health is not validated as the retired browser extension contract", async (t) => {
  const { doctor, gpt, advance } = await fixture(t);
  gpt.doctorReport = async () => ({
    provider: "native",
    state: "healthy",
    canRead: true,
    canSend: true,
  });
  for (let i = 0; i < 8; i++) {
    advance(20000);
    await doctor.pulse();
  }
  assert.equal(doctor.list().length, 0);
  const state = doctorState(await gpt.doctorReport(), "abcdef123");
  assert.equal(state.state, "healthy");
  assert.equal(state.provider, "native");
  assert.deepEqual(state.capabilities, { read: true, send: true });
  assert.equal(
    doctorState(
      { provider: "native", state: "incompatible", doctorCode: "NATIVE_UNSUPPORTED_BUILD" },
      "abcdef123",
    ).code,
    "NATIVE_UNSUPPORTED_BUILD",
  );
});

test("native Doctor distinguishes compatibility from cooldown and authentication without exporting raw errors", async () => {
  for (const [code, state] of [
    ["NATIVE_UNSUPPORTED_BUILD", "incompatible"],
    ["NATIVE_RATE_LIMITED", "busy"],
    ["NATIVE_ACCOUNT_MISMATCH", "login_required"],
    ["NATIVE_TIMEOUT", "busy"],
    ["NATIVE_READ_UNAVAILABLE", "busy"],
    ["private token https://secret", "busy"],
  ]) {
    const provider = new NativeGptProvider({
      client: {
        status: async () => ({ instanceId: "one", manual: false }),
        doctorObservation: () => ({ code }),
        models: async () => {
          assert.fail("Doctor must not request models");
        },
      },
    });
    const raw = await provider.doctorReport();
    assert.equal(doctorState(raw, "abcdef123").state, state);
    assert(!JSON.stringify(raw).includes("secret"));
  }
});

test("Doctor is passive during slow ordinary reads and disabled means no heartbeat", async (t) => {
  const { doctor, gpt, advance } = await fixture(t);
  let reads = 0;
  const provider = new NativeGptProvider({
    client: {
      status: async () => ({ instanceId: "one", manual: false }),
      models: async () => {
        reads++;
        throw Error("NATIVE_TIMEOUT");
      },
    },
  });
  gpt.doctorReport = () => provider.doctorReport();
  for (let n = 0; n < 30; n++) {
    advance(60000);
    await doctor.pulse();
  }
  assert.equal(reads, 0);
  assert.equal(doctor.list().length, 0);
  const a = doctor.association();
  doctor.configure(false, a.projectId, a.revision);
  gpt.doctorReport = async () => assert.fail("disabled Doctor must not probe");
  await doctor.pulse();
});

test("same incident survives Hub revision change including legacy fingerprints", async (t) => {
  const { f, doctor, fault, now, advance, gpt } = await fixture(t);
  const first = fault();
  f.store.db
    .prepare("UPDATE bridge_doctor_incidents SET fingerprint=?,value=? WHERE id=?")
    .run(
      "legacy-hash",
      JSON.stringify({ ...first, fingerprint: "legacy-hash", delivery: "sent" }),
      first.id,
    );
  const next = new BridgeDoctor(f.sessions, gpt, now, "1234567");
  advance(60001);
  const same = next.observe(report("degraded"));
  assert.equal(same.id, first.id);
  assert.equal(same.delivery, "sent");
  assert.equal(next.list().length, 1);
});

test("owner can write to the associated Doctor alongside project work; other utility chats stay protected", async (t) => {
  const { f, doctor } = await fixture(t);
  const request = f.rpc.request.bind(f.rpc);
  f.rpc.request = (method, params) =>
    method === "thread/start"
      ? Promise.resolve({ thread: { id: randomUUID(), historyMode: "paginated" } })
      : request(method, params);
  await f.release();
  new ProjectContext(f.sessions, {}).adopt(
    { client: "codex", projectId: "project", name: "Project" },
    f.thread.id,
  );
  const thread = f.store.createThread("project", randomUUID(), "Bridge Doctor");
  doctor.bind(thread.id);
  const selection = { model: "qa-model", effort: "high", mode: "default", access: "workspace" };
  await f.sessions.startTurn(f.thread.id, "project work", selection);
  const sent = await f.app.inject({
    method: "POST",
    url: `/api/threads/${thread.id}/turns`,
    headers: { ...f.headers, "idempotency-key": randomUUID() },
    payload: { text: "Additional symptom from owner", settings: selection },
  });
  assert.equal(sent.statusCode, 200, sent.body);
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 2);
  const nav = f.store.navigation(["project"]);
  assert.equal(nav.threads.find((t) => t.id === thread.id).bridgeDoctor, true);
  assert.equal(nav.projects[0].active, 1, "Doctor does not inflate project work counts");
  const other = f.store.createThread("project", randomUUID(), "Utility");
  f.store.db.prepare("UPDATE threads SET diagnostic=1 WHERE id=?").run(other.id);
  assert.throws(() => f.sessions.assertWorkThread(other.id), /технический/);
});

test("healthy observation suppresses stale queued incidents immediately and exact creation receipt restores association", async (t) => {
  const { f, doctor, fault, advance } = await fixture(t);
  await f.release();
  const a = doctor.association();
  const thread = f.store.createThread("project", randomUUID(), "Bridge Doctor");
  f.store.db.prepare("UPDATE threads SET diagnostic=1 WHERE id=?").run(thread.id);
  await f.store.once(
    "bridge-doctor-create:project",
    a.operationId,
    { projectId: "project" },
    async () => thread,
  );
  f.store.db
    .prepare("UPDATE bridge_doctor_config SET value=? WHERE id=1")
    .run(JSON.stringify({ ...a, threadId: thread.id, state: "unknown" }));
  fault();
  doctor.observe({ provider: "native", state: "healthy", canRead: true, canSend: true });
  await doctor.dispatch();
  assert.equal(doctor.association().state, "ready");
  assert.equal(doctor.association().threadId, thread.id);
  assert.equal(
    f.calls.filter((x) => x.method === "turn/start" || x.method === "thread/start").length,
    0,
  );
  advance(30001);
  doctor.observe({ provider: "native", state: "healthy", canRead: true, canSend: true });
  assert.equal(doctor.list()[0].state, "recovered");
  assert.equal(doctor.list()[0].delivery, "skipped");
});

test("authorized repair has normal full tools and runs beside owner work without changing Current or replaying", async (t) => {
  const { f, doctor, fault } = await fixture(t);
  await f.release();
  const base = f.rpc.request.bind(f.rpc);
  f.rpc.request = async (method, params) => {
    if (method === "permissionProfile/list")
      return { data: [{ id: ":danger-full-access", allowed: true }] };
    if (method === "configRequirements/read") return { requirements: null };
    return base(method, params);
  };
  const a = doctor.association();
  doctor.configure(true, a.projectId, a.revision, "repair");
  new ProjectContext(f.sessions, {}).adopt(
    { client: "codex", projectId: "project", name: "Project" },
    f.thread.id,
  );
  const thread = f.store.createThread("project", randomUUID(), "Bridge Doctor");
  doctor.bind(thread.id);
  const ownerSettings = { model: "qa-model", effort: "high", mode: "default", access: "workspace" };
  await f.sessions.startTurn(f.thread.id, "owner work", ownerSettings);
  const preferences = f.store.preferences();
  fault();
  await doctor.dispatch();
  assert.equal(doctor.list()[0].delivery, "sent");
  const send = f.calls.filter((x) => x.method === "turn/start").at(-1).params;
  assert.equal(send.threadId, thread.codexThreadId);
  assert.equal(send.permissions, ":danger-full-access");
  assert.equal(send.approvalPolicy, "never");
  assert.equal(send.sandboxPolicy, undefined);
  assert.match(send.collaborationMode.settings.developer_instructions, /isolated Git worktree/);
  assert.match(send.input[0].text, /восстанови работу/);
  assert.deepEqual(f.store.preferences(), preferences);
  f.finishTurn();
  await f.sessions.startTurn(f.thread.id, "owner continues", ownerSettings);
  assert.equal(f.calls.filter((x) => x.method === "turn/start").length, 3);
  await doctor.dispatch();
  assert.equal(f.calls.filter((x) => x.method === "turn/start").length, 3);
  const unrelated = f.store.createThread("project", randomUUID(), "Other utility");
  f.store.db.prepare("UPDATE threads SET diagnostic=1 WHERE id=?").run(unrelated.id);
  await assert.rejects(
    f.sessions.startTurn(unrelated.id, "not authorized", ownerSettings, [], randomUUID(), true, {
      maintenance: "bridge-repair",
    }),
    /Doctor/,
  );
});

test("disabling Doctor during native creation is durable and blocks its pending diagnostic send", async (t) => {
  const { f, doctor, fault } = await fixture(t);
  await f.release();
  fault();
  let reached;
  const started = new Promise((resolve) => {
    reached = resolve;
  });
  let finish;
  const waiting = new Promise((resolve) => {
    finish = resolve;
  });
  f.sessions.create = async () => {
    reached();
    await waiting;
    return f.store.createThread("project", randomUUID(), "Bridge Doctor");
  };
  const running = doctor.dispatch();
  await started;
  const before = doctor.association();
  doctor.configure(false, before.projectId, before.revision);
  finish();
  await running;
  assert.equal(doctor.association().enabled, false);
  assert.equal(doctor.association().state, "ready");
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
  assert.equal(doctor.list()[0].delivery, "pending");
  const old = doctor.association();
  assert.throws(() => doctor.configure(true, "", old.revision), /Привязка сохранена/);
  assert.equal(doctor.association().threadId, old.threadId);
});

test("only definite missing destinations rotate Doctor identity; uncertain sends retain exact destination", async (t) => {
  for (const definite of [true, false]) {
    await t.test(String(definite), async (t) => {
      const { f, doctor, fault } = await fixture(t);
      await f.release();
      new ProjectContext(f.sessions, {}).adopt(
        { client: "codex", projectId: "project", name: "Project" },
        f.thread.id,
      );
      const thread = f.store.createThread("project", randomUUID(), "Bridge Doctor");
      doctor.bind(thread.id);
      const before = doctor.association();
      fault();
      let attempts = 0;
      f.sessions.startTurn = async () => {
        attempts++;
        const error = new HubError(404, "THREAD_NOT_FOUND", "Missing native thread");
        throw definite ? new NotSubmittedError(error) : error;
      };
      await doctor.dispatch();
      assert.equal(attempts, 1);
      assert.equal(doctor.list()[0].delivery, definite ? "pending" : "unknown");
      assert.equal(doctor.association().threadId, definite ? null : thread.id);
      assert.equal(doctor.association().operationId === before.operationId, !definite);
      assert(f.store.thread(thread.id));
      if (!definite) {
        await doctor.dispatch();
        assert.equal(attempts, 1);
      }
    });
  }
});

test("repair changed to diagnosis while preparing cannot submit a full-access turn", async (t) => {
  const { f, doctor, fault } = await fixture(t);
  await f.release();
  const a = doctor.association();
  doctor.configure(true, a.projectId, a.revision, "repair");
  new ProjectContext(f.sessions, {}).adopt(
    { client: "codex", projectId: "project", name: "Project" },
    f.thread.id,
  );
  const thread = f.store.createThread("project", randomUUID(), "Bridge Doctor");
  doctor.bind(thread.id);
  const base = f.rpc.request.bind(f.rpc);
  f.rpc.request = async (method, params) => {
    if (method === "permissionProfile/list")
      return { data: [{ id: ":danger-full-access", allowed: true }] };
    if (method === "configRequirements/read") return { requirements: null };
    if (method === "thread/resume") {
      const current = doctor.association();
      doctor.configure(true, current.projectId, current.revision, "diagnose");
    }
    return base(method, params);
  };
  fault();
  await doctor.dispatch();
  assert.equal(doctor.list()[0].delivery, "pending");
  assert.equal(f.calls.filter((x) => x.method === "turn/start").length, 0);
});
