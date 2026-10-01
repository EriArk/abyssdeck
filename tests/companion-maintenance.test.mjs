import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deploymentBlockers } from "../apps/hub/dist/deployment-status.js";
import { HubError } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

async function fixture(t) {
  const f = await handoffFixture();
  t.after(() => f.close());
  f.sessions.config.machines[0].codex.persistent = true;
  f.store.setPreferences({ machineClients: { pc: "web" } });
  f.store.setStatus(f.thread.id, "idle");
  const instanceId = randomUUID(),
    operationId = randomUUID();
  f.store.db
    .prepare(
      "INSERT INTO codex_runtime_bindings(machineId,binding,capability,instanceId,accountHash) VALUES(?,?,?,?,?)",
    )
    .run("pc", "binding", "capability", instanceId, "preserved-account");
  const effects = [];
  const r = {
    machineId: "pc",
    binding: { binding: "binding" },
    instanceId,
    active: new Set(),
    loaded: new Set(),
    touched: Date.now(),
    rpc: {
      inspectCompanion: async () => ({
        protocol: 2,
        runtimeId: "binding",
        instanceId,
        active: 0,
        pending: 0,
      }),
      closeIdleCompanion: async () => {
        effects.push("close-idle");
        return { closed: true };
      },
      close: () => effects.push("detach"),
    },
  };
  f.sessions.runtimes.set("pc", Promise.resolve(r));
  return { ...f, r, effects, operationId };
}
test("machine migration waits for active/uncertain turns and never clears their receipt", async (t) => {
  const f = await fixture(t);
  f.store.setStatus(f.thread.id, "unknown", "exact-uncertain-turn");
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "acquire")).state,
    "waitingIdle",
  );
  assert.equal(f.store.thread(f.thread.id).activeTurnId, "exact-uncertain-turn");
  assert.deepEqual(f.effects, []);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) n FROM companion_worker_leases").get().n, 0);
  f.store.setStatus(f.thread.id, "unknown", null);
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "acquire")).state,
    "waitingIdle",
  );
  assert.deepEqual(f.effects, []);
});

test("handoff admission cannot race a worker drain, including a handoff begun during inspection", async (t) => {
  const f = await fixture(t);
  f.sessions.handingOff.add("pc");
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "acquire")).state,
    "waitingIdle",
  );
  f.sessions.handingOff.clear();
  f.store.setPreferences({
    machineClients: { pc: "web" },
    desktopReturns: { pc: { state: "pending" } },
  });
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "acquire")).state,
    "waitingIdle",
  );
  f.store.setPreferences({ machineClients: { pc: "web" }, desktopReturns: {} });
  const inspect = f.r.rpc.inspectCompanion;
  f.r.rpc.inspectCompanion = async () => {
    f.sessions.handingOff.add("pc");
    return inspect();
  };
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "acquire")).state,
    "waitingIdle",
  );
  assert.deepEqual(f.effects, []);
  f.sessions.handingOff.clear();
  f.r.rpc.inspectCompanion = inspect;
  await f.sessions.workerMaintenance("pc", f.operationId, "acquire");
  await assert.rejects(
    f.sessions.setMachineClient("pc", "desktop"),
    (error) => error.code === "COMPANION_UPDATING",
  );
  await assert.rejects(
    f.sessions.handoffToDesktop("pc", true),
    (error) => error.code === "COMPANION_UPDATING",
  );
});
test("drain fences only native work, persists across engine restart, preserves account and reconciles lost release acknowledgement", async (t) => {
  const f = await fixture(t);
  const first = await f.sessions.workerMaintenance("pc", f.operationId, "acquire");
  assert.equal(first.state, "drained");
  assert.deepEqual(f.effects, ["close-idle", "detach"]);
  await f.sessions.workerMaintenance("pc", f.operationId, "acquire");
  assert.deepEqual(f.effects, ["close-idle", "detach"]);
  assert.throws(
    () => f.sessions.assertWritable("project"),
    (error) => error.code === "COMPANION_UPDATING",
  );
  assert.equal(
    deploymentBlockers(f.store, { busy: 0, unknown: 0 }).find((b) => b.kind === "companion").count,
    1,
    "host update cannot race the worker switch",
  );
  const end = f.sessions.beginManualFileOperation("project");
  end(); // User's manual file workflow remains admitted.
  const binding = f.store.db
    .prepare("SELECT * FROM codex_runtime_bindings WHERE machineId=?")
    .get("pc");
  assert.equal(binding.instanceId, null);
  assert.equal(binding.accountHash, "preserved-account");
  assert.equal(binding.capability, "capability");
  await assert.rejects(
    f.sessions.workerMaintenance("pc", randomUUID(), "release"),
    (error) => error.code === "COMPANION_UPDATING",
  );
  let validation = 0;
  f.sessions.machineRuntime = async (_machine, _cwd, inspection) => {
    assert.equal(inspection, true);
    validation++;
    return f.r;
  };
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "release")).state,
    "released",
  );
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "release")).state,
    "released",
  );
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "acquire")).state,
    "released",
  );
  assert.equal(validation, 1);
  f.sessions.assertWritable("project");
  assert.deepEqual(f.effects, ["close-idle", "detach"]);
  assert(!deploymentBlockers(f.store, { busy: 0, unknown: 0 }).some((b) => b.kind === "companion"));
});
test("failed new account validation keeps admission closed and does not resume queued work", async (t) => {
  const f = await fixture(t);
  await f.sessions.workerMaintenance("pc", f.operationId, "acquire");
  f.sessions.machineRuntime = async () => {
    throw new HubError(409, "RUNTIME_IDENTITY_CHANGED", "different account");
  };
  await assert.rejects(
    f.sessions.workerMaintenance("pc", f.operationId, "release"),
    (error) => error.code === "RUNTIME_IDENTITY_CHANGED",
  );
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "status")).state,
    "drained",
  );
  assert.throws(() => f.sessions.assertWritable("project"));
  assert.deepEqual(f.effects, ["close-idle", "detach"]);
});
test("lost idle-close acknowledgement is reconciled against the original missing runtime without creating another writer", async (t) => {
  const f = await fixture(t);
  f.r.rpc.closeIdleCompanion = async () => {
    f.effects.push("accepted-close-lost-ack");
    throw new HubError(503, "CODEX_DISCONNECTED", "lost ack");
  };
  await assert.rejects(f.sessions.workerMaintenance("pc", f.operationId, "acquire"));
  f.sessions.machineRuntime = async (_machine, _cwd, inspection) => {
    assert.equal(inspection, true);
    assert(
      f.store.db
        .prepare("SELECT instanceId FROM codex_runtime_bindings WHERE machineId=?")
        .get("pc").instanceId,
    );
    throw new HubError(503, "CODEX_RUNTIME_MISSING", "exact old capability is gone");
  };
  assert.equal(
    (await f.sessions.workerMaintenance("pc", f.operationId, "acquire")).state,
    "drained",
  );
  assert.deepEqual(f.effects, ["accepted-close-lost-ack"]);
});
