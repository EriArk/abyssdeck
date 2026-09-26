import assert from "node:assert/strict";
import test from "node:test";
import { NativeGptReadClient } from "../apps/hub/dist/gpt-native.js";
import { NativeGptProvider } from "../apps/hub/dist/gpt-native-provider.js";

test("reads coalesce independently of ordered writes and invalidate sharing on write completion", async () => {
  const client = new NativeGptReadClient(
    { socketPath: "/private/adapter.sock", userId: "10000000-0000-4000-8000-000000000001" },
    () => {},
  );
  const write = Promise.withResolvers(),
    read = Promise.withResolvers();
  const calls = [];
  client.request = async (input) => {
    calls.push(input.operation);
    if (input.operation === "dispatchText") await write.promise;
    if (input.operation === "readCatalog") await read.promise;
    return {};
  };
  const sending = client.call({ operation: "dispatchText" });
  const a = client.call({ operation: "readCatalog" });
  const b = client.call({ operation: "readCatalog" });
  const following = client.call({ operation: "libraryMutation" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["dispatchText", "readCatalog"]);
  write.resolve();
  await Promise.all([sending, following]);
  const c = client.call({ operation: "readCatalog" });
  read.resolve();
  await Promise.all([a, b, c]);
  assert.deepEqual(calls, ["dispatchText", "readCatalog", "libraryMutation", "readCatalog"]);
});

test("readiness shares model verification and invalidates it on native restart or manual mode", async () => {
  let instanceId = "one",
    manual = false,
    models = 0;
  const provider = new NativeGptProvider({
    client: {
      status: async () => ({ instanceId, manual }),
      models: async () => {
        models++;
        return { versions: [] };
      },
    },
  });
  await Promise.all([provider.connection(), provider.connection()]);
  await provider.connection();
  assert.equal(models, 1);
  instanceId = "two";
  await provider.connection();
  assert.equal(models, 2);
  manual = true;
  assert.equal((await provider.connection()).canSend, false);
  manual = false;
  await provider.connection();
  assert.equal(models, 3);
});

test("native status bypasses a pending renderer read; mutations remain serialized", async () => {
  const client = new NativeGptReadClient(
    { socketPath: "/private/adapter.sock", userId: "10000000-0000-4000-8000-000000000001" },
    () => {},
  );
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  client.request = async (input) => {
    calls.push(input.operation);
    if (input.operation === "readConversationGraph") return blocked;
    if (input.operation === "status")
      return {
        instanceId: "10000000-0000-4000-8000-000000000002",
        manual: false,
        busy: true,
        writesEnabled: true,
      };
    return {};
  };
  const history = client.call({ operation: "readConversationGraph" });
  const send = client.call({ operation: "dispatchText" });
  let status;
  const heartbeat = client.status().then((value) => {
    status = value;
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(status?.busy, true, "heartbeat must finish before history is released");
    assert.equal(calls.includes("dispatchText"), true, "writer is independent of a safe read");
  } finally {
    release({});
    await Promise.all([history, send, heartbeat]);
  }
  assert.equal(calls.filter((operation) => operation === "dispatchText").length, 1);
});
