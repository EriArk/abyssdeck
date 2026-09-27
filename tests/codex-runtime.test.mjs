import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { codexRuntimeBinding, confirmCodexRuntime } from "../apps/hub/dist/codex-runtime.js";
import { deploymentBlockers } from "../apps/hub/dist/deployment-status.js";
import { Store } from "../apps/hub/dist/store.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const machine = {
  id: "pc",
  type: "ssh-windows",
  ssh: { target: "private" },
  codex: { launcher: "C:/Bridge.exe", persistent: true },
  allowedProjectRoots: ["C:/Projects"],
};
const account = { type: "chatgpt", email: "fixture@example.test" };
test("private runtime capability survives Hub recreation and never adopts another instance/account/epoch", () => {
  const store = new Store(":memory:");
  try {
    const b = codexRuntimeBinding(store, machine, "C:/Projects", "owner:1"),
      instanceId = randomUUID();
    assert.equal(b.create, true);
    assert.match(b.capability, /^[a-f0-9]{64}$/);
    confirmCodexRuntime(store, "pc", b, { protocol: 2, runtimeId: b.binding, instanceId }, account);
    confirmCodexRuntime(
      store,
      "pc",
      b,
      { protocol: 2, runtimeId: b.binding, instanceId },
      { ...account, planType: "pro" },
    );
    const resumed = codexRuntimeBinding(store, machine, "C:/Projects", "owner:1");
    assert.equal(resumed.create, false);
    assert.equal(resumed.capability, b.capability);
    assert.throws(() =>
      confirmCodexRuntime(
        store,
        "pc",
        b,
        { protocol: 2, runtimeId: b.binding, instanceId: randomUUID() },
        account,
      ),
    );
    assert.throws(() =>
      confirmCodexRuntime(
        store,
        "pc",
        b,
        { protocol: 2, runtimeId: b.binding, instanceId },
        { type: "chatgpt", email: "other@example.test" },
      ),
    );
    assert.throws(() => codexRuntimeBinding(store, machine, "C:/Projects", "owner:2"));
    assert.throws(() =>
      codexRuntimeBinding(
        store,
        { ...machine, ssh: { target: "other" } },
        "C:/Projects",
        "owner:1",
      ),
    );
    assert.equal(
      codexRuntimeBinding(
        store,
        { ...machine, codex: { ...machine.codex, persistent: false } },
        "C:/Projects",
      ),
      undefined,
    );
  } finally {
    store.close();
  }
});
test("maintenance exemption is exact; unrelated unknown turns and receipts still block", () => {
  const store = new Store(":memory:");
  try {
    const a = store.createThread("p", randomUUID(), "A"),
      b = store.createThread("p", randomUUID(), "B");
    store.setStatus(a.id, "running", "turn-a");
    store.setStatus(b.id, "unknown", "turn-b");
    assert.equal(
      deploymentBlockers(store, { busy: 0, unknown: 0 }, new Set([a.id])).find(
        (b) => b.kind === "codex",
      ).count,
      1,
    );
    assert.equal(
      deploymentBlockers(store, { busy: 0, unknown: 0 }).find((b) => b.kind === "codex").count,
      2,
    );
  } finally {
    store.close();
  }
});
async function recoveryFixture(t) {
  const f = await handoffFixture();
  t.after(() => f.close());
  await f.release();
  f.sessions.config.machines[0].codex.persistent = true;
  f.store.db
    .prepare(
      "INSERT INTO codex_runtime_bindings(machineId,binding,capability,instanceId) VALUES(?,?,?,?)",
    )
    .run("pc", "binding", "capability", randomUUID());
  const runtime = {
    rpc: f.rpc,
    loaded: new Set(),
    active: new Set(),
    touched: Date.now(),
    binding: { binding: "binding" },
  };
  // Use an isolated RPC and existing fixture project; no SSH or native writer is acquired.
  f.sessions.runtime = async () => runtime;
  f.sessions.verifyThreadRoot = async () => {};
  f.sessions.catalog.history = async () => ({ messages: [], nextBefore: null });
  f.store.setStatus(f.thread.id, "unknown", "offline-turn");
  return { ...f, runtime };
}
test("canonical completed output and results recover once without starting or resuming a turn", async (t) => {
  const f = await recoveryFixture(t);
  let reads = 0;
  f.rpc.request = async (method) => {
    assert.equal(method, "thread/turns/list");
    reads++;
    return {
      data: [
        {
          id: "offline-turn",
          status: "completed",
          items: [
            { id: "answer", type: "agentMessage", phase: "final_answer", text: "Finished offline" },
            {
              id: "check",
              type: "commandExecution",
              command: "npm test",
              status: "completed",
              exitCode: 0,
              aggregatedOutput: "pass",
            },
          ],
        },
      ],
    };
  };
  await f.sessions.recoverPersistent();
  await f.sessions.recoverPersistent();
  assert.equal(reads, 1);
  assert.equal(f.store.thread(f.thread.id).activeTurnId, null);
  assert(f.store.history(f.thread.id).messages.some((m) => m.text === "Finished offline"));
  assert.equal(
    f.store.db
      .prepare("SELECT count(*) n FROM results WHERE threadId=? AND type='check'")
      .get(f.thread.id).n,
    1,
  );
});
test("unavailable exact turn stops after three read checks and retains uncertain state", async (t) => {
  const f = await recoveryFixture(t);
  let reads = 0;
  f.rpc.request = async () => {
    reads++;
    return { data: [{ id: "another-turn", status: "completed", items: [] }] };
  };
  for (let i = 0; i < 5; i++) await f.sessions.recoverPersistent();
  assert.equal(reads, 3);
  assert.equal(f.store.thread(f.thread.id).activeTurnId, "offline-turn");
  assert.equal(f.store.thread(f.thread.id).status, "unknown");
});
test("pending question marks recovered live turn waiting; maintenance requires live instance and exact turn", async (t) => {
  const f = await recoveryFixture(t);
  f.sessions.pending = () => [{ id: "approval" }];
  f.rpc.request = async () => ({ data: [{ id: "offline-turn", status: "inProgress", items: [] }] });
  f.runtime.instanceId = randomUUID();
  f.rpc.inspectCompanion = async () => ({
    protocol: 2,
    runtimeId: "binding",
    instanceId: f.runtime.instanceId,
    turns: { [f.thread.codexThreadId]: "offline-turn" },
  });
  await f.sessions.recoverPersistent();
  assert.equal(f.store.thread(f.thread.id).status, "waiting_approval");
  f.sessions.runtimes.set("pc", Promise.resolve(f.runtime));
  let turns = { [f.thread.codexThreadId]: "offline-turn" };
  f.rpc.inspectCompanion = async (authorize) => {
    authorize();
    return { protocol: 2, runtimeId: "binding", instanceId: f.runtime.instanceId, turns };
  };
  assert((await f.sessions.persistentThreadIds()).has(f.thread.id));
  turns = { [f.thread.codexThreadId]: "another-turn" };
  assert.equal((await f.sessions.persistentThreadIds()).size, 0);
  f.sessions.authorizeInspection = () => {
    throw Error("revoked");
  };
  assert.equal((await f.sessions.persistentThreadIds()).size, 0);
});

test("stale native inProgress history without live Companion proof stays uncertain", async (t) => {
  const f = await recoveryFixture(t);
  let reads = 0;
  f.rpc.request = async () => {
    reads++;
    return { data: [{ id: "offline-turn", status: "inProgress", items: [] }] };
  };
  f.rpc.inspectCompanion = async () => ({
    protocol: 2,
    runtimeId: "binding",
    instanceId: "wrong",
    turns: {},
  });
  for (let i = 0; i < 4; i++) await f.sessions.recoverPersistent();
  assert.equal(reads, 1);
  assert.equal(f.store.thread(f.thread.id).status, "unknown");
  assert.equal(f.runtime.loaded.size, 0);
});
