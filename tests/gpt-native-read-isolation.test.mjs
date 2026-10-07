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

test("Hub waits for slow native preparation beyond the former 25-second deadline", async (t) => {
  const f = await fixture(t);
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (ms) => timeout(ms / 100));
  let calls = 0;
  f.service.canary.prepare = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return {
      parentId: randomUUID(),
      model: "model",
      effort: null,
      versionId: "latest",
      presetId: 1,
    };
  };
  const value = await f.client.call({ operation: "prepareDispatch" });
  assert.equal(value.model, "model");
  assert.equal(calls, 1);
});
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
          : operation === "workspace" && input.operation === "activity"
            ? { ready: true, generating: false }
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

test("long canonical history crosses the installed service transport without losing its tail", async (t) => {
  const f = await fixture(t),
    conversationId = "20000000-0000-4000-8000-000000000002";
  const mapping = {};
  for (let i = 0; i < 100; i++)
    mapping["n" + i] = {
      id: "n" + i,
      parent: i ? "n" + (i - 1) : null,
      children: [],
      message: {
        id: "n" + i,
        author: { role: "assistant" },
        content: { content_type: "text", parts: ["Chapter ".repeat(8000)] },
      },
    };
  f.reader.readHistoryUpdate = async () => ({
    kind: "full",
    conversationId,
    revision: "a".repeat(64),
    graph: {
      conversation_id: conversationId,
      title: "Story",
      gizmo_id: null,
      current_node: "n99",
      mapping,
    },
  });
  const graph = await f.client.historyGraph(conversationId);
  assert.ok(Buffer.byteLength(JSON.stringify(graph)) > 4 * 1024 ** 2);
  assert.equal(graph.current_node, "n99");
  assert.equal(Object.keys(graph.mapping).length, 100);
});

test("new Hub serializes a legacy installed adapter; old Hub status remains compatible", async (t) => {
  const f = await fixture(t);
  const request = f.service.request.bind(f.service);
  const plain = await request({ userId, operation: "status" });
  assert.deepEqual(Object.keys(plain).sort(), ["busy", "instanceId", "manual", "writesEnabled"]);
  assert.equal(
    (await request({ userId, operation: "status", capabilities: true })).independentReads,
    true,
  );
  let active = 0,
    busy = 0;
  f.service.request = async (input) => {
    if (input.operation === "status") {
      if (input.capabilities) throw Error("NATIVE_INVALID_REQUEST");
      return plain;
    }
    if (active) {
      busy++;
      throw Error("NATIVE_BUSY");
    }
    active++;
    try {
      await new Promise((r) => setTimeout(r, 30));
      return await request(input);
    } finally {
      active--;
    }
  };
  await Promise.all(
    ["readCatalog", "readPins", "readProjects", "readModels", "openMedia", "closeMedia"].map(
      (operation) => f.client.call({ operation }),
    ),
  );
  assert.equal(busy, 0, "capability negotiation prevents the production catalog/pins race");
  assert.equal(f.calls.length, 6);
});

test("only explicitly unadmitted reads retry BUSY, finitely; mutations and ambiguous errors never replay", async (t) => {
  const f = await fixture(t);
  const request = f.service.request.bind(f.service);
  let calls = 0,
    failure = "NATIVE_BUSY";
  f.service.request = async (input) => {
    if (input.operation === "status") return request(input);
    calls++;
    if (failure) throw Error(failure);
    return request(input);
  };
  await assert.rejects(f.client.call({ operation: "readCatalog" }), /NATIVE_BUSY/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(f.client.call({ operation: "dispatchText" }), /NATIVE_BUSY/);
  assert.equal(calls, 1);
  calls = 0;
  failure = "NATIVE_TIMEOUT";
  await assert.rejects(f.client.call({ operation: "readMedia" }), /NATIVE_TIMEOUT/);
  assert.equal(calls, 1, "uncertain chunk acknowledgement must not advance the stream twice");
  failure = "";
  await f.client.call({ operation: "readCatalog" });
  assert.equal(calls, 2);
});

test("a busy readiness read does not claim disconnection or grant unverified send readiness", async (t) => {
  const f = await fixture(t);
  const provider = new NativeGptProvider({ client: f.client });
  f.reader.workspace = async () => {
    throw Error("NATIVE_BUSY");
  };
  const waiting = await provider.connection();
  assert.equal(waiting.state, "starting");
  assert.equal(waiting.canSend, false);
  f.reader.workspace = async () => ({
    ready: true,
    generating: false,
  });
  assert.equal((await provider.connection()).state, "starting", "wait for readiness backoff");
  provider.retry.until = 0;
  assert.equal((await provider.connection()).state, "healthy");
  // Expiry followed by authentication failure must remain a real failure.
  provider.verified.until = 0;
  f.reader.workspace = async () => {
    throw Error("NATIVE_ACCOUNT_CHANGED");
  };
  await assert.rejects(provider.connection(), /ACCOUNT_CHANGED/);
});

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
      assert.deepEqual(
        await f.client.call({ operation: "workspace", action }),
        action === "activity" ? { ready: true, generating: false } : { operation: "workspace" },
      );
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
    if (input.operation === "status")
      return {
        instanceId: userId,
        busy: false,
        manual: false,
        writesEnabled: true,
        independentReads: true,
      };
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

test("history delta negotiation reconstructs exact display graph; canonical reads stay separate", async (t) => {
  const f = await fixture(t),
    id = "20000000-0000-4000-8000-000000000001";
  const graph = {
    conversation_id: id,
    current_node: "a",
    title: "Title",
    gizmo_id: null,
    mapping: {
      a: {
        id: "a",
        parent: null,
        children: [],
        message: { id: "a", author: { role: "assistant" }, content: { parts: ["same"] } },
      },
    },
  };
  let revision = "a".repeat(64),
    phase = 0;
  f.reader.readHistoryUpdate = async (input) => {
    assert.equal(input.accountFingerprint, accountFingerprint);
    if (phase === 0) {
      assert.equal(input.revision, undefined);
      phase++;
      return { kind: "full", conversationId: id, revision, graph };
    }
    if (phase === 1) {
      assert.equal(input.revision, revision);
      phase++;
      return { kind: "unchanged", conversationId: id, revision };
    }
    assert.equal(input.revision, revision);
    const base = revision;
    revision = "b".repeat(64);
    return {
      kind: "delta",
      conversationId: id,
      base,
      revision,
      removed: [],
      graph: {
        ...graph,
        current_node: "b",
        mapping: {
          b: {
            id: "b",
            parent: "a",
            children: [],
            message: { id: "b", author: { role: "assistant" }, content: { parts: ["same"] } },
          },
        },
      },
    };
  };
  const legacyStatus = await f.service.request({ operation: "status", userId, capabilities: true });
  assert.equal(
    legacyStatus.historyUpdates,
    undefined,
    "old Hub strict schema remains compatible after adapter update",
  );
  const first = await f.client.historyGraph(id),
    again = await f.client.historyGraph(id);
  assert.equal(first, again);
  assert.ok(Object.isFrozen(first.mapping.a.message.content.parts));
  const added = await f.client.historyGraph(id);
  assert.equal(added.mapping.a, first.mapping.a);
  assert.equal(added.current_node, "b");
  assert.deepEqual(Object.keys(added.mapping), ["a", "b"]);
  let repairs = 0;
  f.reader.readHistoryUpdate = async (input) => {
    repairs++;
    if (input.revision)
      return {
        kind: "delta",
        conversationId: id,
        base: "f".repeat(64),
        revision: "c".repeat(64),
        graph,
        removed: [],
      };
    return { kind: "full", conversationId: id, revision: "c".repeat(64), graph };
  };
  assert.equal((await f.client.historyGraph(id)).current_node, "a");
  assert.equal(repairs, 2, "invalid delta triggers only one full read");
  let canonical = 0;
  f.reader.readConversationGraph = async () => {
    canonical++;
    return graph;
  };
  assert.deepEqual(await f.client.conversationGraph(id), graph);
  assert.equal(canonical, 1);
  f.revoke();
  await assert.rejects(f.client.historyGraph(id), /REVOKED/);
});

test("native failure envelope survives the private socket and cached Retry-After", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const retryAt = Date.now() + 120000;
  f.service.reader.readModels = async () => {
    calls++;
    throw Object.assign(Error("NATIVE_RATE_LIMITED"), {
      retryAt,
      httpStatus: 429,
      publicMessage: "Please wait.",
      diagnostics: "PRIVATE",
    });
  };
  for (let n = 0; n < 2; n++)
    await assert.rejects(
      f.client.call({ operation: "readModels" }),
      (e) =>
        e.retryAt === retryAt &&
        e.httpStatus === 429 &&
        e.publicMessage === "Please wait." &&
        !JSON.stringify(e).includes("PRIVATE"),
    );
  assert.equal(calls, 1, "other refreshes share the actual native cooldown");
});
