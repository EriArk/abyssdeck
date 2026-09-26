import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NativeGptReadClient } from "../apps/hub/dist/gpt-native.js";
import { NativeGptProvider } from "../apps/hub/dist/gpt-native-provider.js";
import { listenNative, NativeReadService } from "../ops/gpt-native/service.mjs";

const userId = "10000000-0000-4000-8000-000000000001";
const accountFingerprint = "a".repeat(64);
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "native-isolation-"));
  await chmod(root, 0o700);
  const writer = Promise.withResolvers(),
    entered = Promise.withResolvers();
  const calls = [];
  const reader = Object.fromEntries(
    [
      "readConversationGraph",
      "readConversation",
      "readCatalog",
      "readPins",
      "readProjects",
      "readProject",
      "readProjectConversations",
      "inspectProject",
      "listArtifacts",
      "readArtifact",
      "openMedia",
      "readMedia",
      "closeMedia",
      "readModels",
      "workspace",
    ].map((operation) => [
      operation,
      async (input) => {
        assert.equal(input.accountFingerprint, accountFingerprint);
        calls.push(operation);
        return operation === "readModels"
          ? { versions: [{ id: "latest", label: "Latest", enabled: true, presets: [] }] }
          : { operation };
      },
    ]),
  );
  const canary = {
    ownerMode: true,
    dispatch: async () => {
      calls.push("dispatchText");
      entered.resolve();
      return writer.promise;
    },
    live: async () => ({ items: [] }),
  };
  const service = new NativeReadService({
    reader,
    canary,
    userId,
    accountFingerprint,
    statePath: join(root, "manual.json"),
  });
  const socketPath = join(root, "adapter.sock");
  const server = await listenNative(service, socketPath);
  let revoked = false;
  const client = new NativeGptReadClient({ socketPath, userId }, () => {
    if (revoked) throw Error("REVOKED");
  });
  t.after(async () => {
    writer.resolve({ state: "unknown" });
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  return {
    writer,
    entered,
    service,
    reader,
    client,
    calls,
    revoke: () => {
      revoked = true;
    },
  };
}

test("held 20-second dispatch leaves history, navigation, media and readiness readable without another send", {
  timeout: 30000,
}, async (t) => {
  const f = await fixture(t),
    started = Date.now();
  const sending = f.client.call({ operation: "dispatchText" });
  await f.entered.promise;
  const reads = [
    "readConversationGraph",
    "readCatalog",
    "readProjects",
    "readPins",
    "readProject",
    "readProjectConversations",
    "inspectProject",
    "readArtifact",
  ];
  try {
    await Promise.all(reads.map((operation) => f.client.call({ operation })));
    for (const action of ["scheduledList", "scheduledRead", "activity"]) {
      assert.deepEqual(await f.client.call({ operation: "workspace", action }), {
        operation: "workspace",
      });
    }
    const status = await new NativeGptProvider({ client: f.client }).connection();
    assert.equal(status.canRead, true);
    assert.equal(status.state, "healthy");
    assert.equal(f.service.busy, true);
    assert.ok(Date.now() - started < 2500, "reads must finish while the writer is still held");
    assert.equal(f.calls.filter((x) => x === "dispatchText").length, 1);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 20000 - (Date.now() - started))),
    );
  } finally {
    f.writer.resolve({ state: "unknown" });
  }
  assert.deepEqual(await sending, { state: "unknown" });
  await f.client.call({ operation: "readCatalog" });
  assert.equal(
    f.calls.filter((x) => x === "dispatchText").length,
    1,
    "unknown writer was never replayed",
  );
});

test("two blocked reads leave the writer, live status and media lanes available; queued reads reauthorize", async (t) => {
  const f = await fixture(t),
    gate = Promise.withResolvers();
  let active = 0,
    peak = 0,
    entered = 0;
  f.reader.readCatalog = async () => {
    entered++;
    peak = Math.max(peak, ++active);
    await gate.promise;
    active--;
    return {};
  };
  const reads = Array.from({ length: 6 }, (_, offset) =>
    f.client.call({ operation: "readCatalog", offset }),
  );
  const settled = Promise.allSettled(reads);
  while (entered < 2) await tick();
  const sending = f.client.call({ operation: "dispatchText" });
  await f.entered.promise;
  assert.equal(entered, 2);
  assert.equal((await f.client.status()).busy, true);
  assert.deepEqual(await f.client.liveDispatch(randomUUID(), null), { items: [] });
  await f.client.call({ operation: "readArtifact" });
  f.revoke();
  gate.resolve();
  f.writer.resolve({ state: "unknown" });
  await assert.rejects(sending, /REVOKED/);
  assert.ok(
    (await settled).every((x) => x.status === "rejected" && /REVOKED/.test(x.reason.message)),
  );
  assert.equal(entered, 2);
  assert.equal(peak, 2);
});

test("service bounds independent clients, shares identical reads and keeps manual account boundary", async (t) => {
  const f = await fixture(t),
    gate = Promise.withResolvers();
  let calls = 0;
  f.reader.readCatalog = async () => {
    calls++;
    await gate.promise;
    return {};
  };
  const request = (offset) => f.service.request({ userId, operation: "readCatalog", offset });
  const a = request(0),
    b = request(0),
    c = request(20);
  await tick();
  assert.equal(calls, 2);
  await assert.rejects(request(40), /BUSY/);
  await assert.rejects(
    f.service.request({ userId: randomUUID(), operation: "readCatalog", offset: 0 }),
    /WRONG_OWNER/,
  );
  await assert.rejects(f.client.manual("beginManual", randomUUID()), /BUSY/);
  gate.resolve();
  await Promise.all([a, b, c]);
  await f.client.manual("beginManual", randomUUID());
  await assert.rejects(request(0), /MANUAL_RECOVERY/);
  await f.client.manual("resumeManual");
  await request(0);
  assert.equal(calls, 3);
});

test("read failure releases its lane without changing or replaying the in-flight writer", async (t) => {
  const f = await fixture(t);
  const sending = f.client.call({ operation: "dispatchText" });
  await f.entered.promise;
  f.reader.readCatalog = async () => {
    throw Error("NATIVE_RATE_LIMITED");
  };
  await assert.rejects(f.client.call({ operation: "readCatalog" }), /RATE_LIMITED/);
  f.reader.readCatalog = async () => ({ items: [], nextOffset: null });
  assert.equal((await f.client.catalog()).items.length, 0);
  assert.equal(f.service.busy, true);
  assert.equal(f.service.readActive, 0);
  f.writer.resolve({ state: "unknown" });
  await sending;
  assert.equal(f.calls.filter((x) => x === "dispatchText").length, 1);
});

test("saturated read admission does not consume writer admission; read responses do not populate a cache", async () => {
  const client = new NativeGptReadClient({ socketPath: "/private/a.sock", userId }, () => {}),
    gate = Promise.withResolvers();
  let reads = 0,
    writes = 0;
  client.request = async (input) => {
    if (input.operation === "readCatalog") {
      reads++;
      await gate.promise;
    } else writes++;
    return {};
  };
  const tasks = Array.from({ length: 64 }, (_, offset) =>
    client.call({ operation: "readCatalog", offset }),
  );
  await assert.rejects(client.call({ operation: "readCatalog", offset: 65 }), /BUSY/);
  await client.call({ operation: "dispatchText" });
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  gate.resolve();
  await Promise.all(tasks);
  await client.call({ operation: "readCatalog", offset: 0 });
  assert.equal(reads, 65);
});
