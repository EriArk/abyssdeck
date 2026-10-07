import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { NativeGptReadClient } from "../apps/hub/dist/gpt-native.js";
import { NativeGptProvider } from "../apps/hub/dist/gpt-native-provider.js";
import { nativeWorkspace } from "../ops/gpt-native/renderer-workspace.mjs";
import { nativeRequestGate } from "../ops/gpt-native/request-gate.mjs";

function fixture(t) {
  let now = 1000,
    revoked = false,
    changed = false,
    manual = false;
  let instanceId = randomUUID();
  const calls = [];
  const client = new NativeGptReadClient(
    { socketPath: resolve("adapter.sock"), userId: randomUUID() },
    () => {
      if (revoked) throw Error("REVOKED");
    },
  );
  const actual = Date.now;
  Date.now = () => now;
  // The cache clock is injected independently of the module's Date.now capture.
  client.metadata.now = () => now;
  t.after(() => {
    Date.now = actual;
  });
  client.request = async (input) => {
    if (input.operation === "status")
      return { instanceId, manual, busy: false, writesEnabled: true, independentReads: true };
    calls.push(input.operation);
    if (input.operation === "readCatalog")
      return { items: [{ changed, offset: input.offset }], nextOffset: null };
    if (input.operation === "readModels")
      return { versions: [{ id: "latest", label: "Latest", enabled: true, presets: [] }] };
    return { items: [] };
  };
  return {
    client,
    calls,
    advance: (ms) => {
      now += ms;
    },
    change: () => {
      changed = true;
    },
    manual: () => {
      manual = true;
    },
    restart: () => {
      instanceId = randomUUID();
    },
    revoke: () => {
      revoked = true;
    },
  };
}

test("receipt polling and read-only preparation preserve shared navigation metadata", async (t) => {
  const f = fixture(t);
  await f.client.call({ operation: "readCatalog", offset: 0 });
  for (const operation of ["prepareDispatch", "reconcileDispatch", "reconcileDispatch"]) {
    await f.client.call({ operation });
    await f.client.call({ operation: "readCatalog", offset: 0 });
  }
  assert.equal(f.calls.filter((x) => x === "readCatalog").length, 1);
  await f.client.call({ operation: "dispatchText" });
  await f.client.call({ operation: "readCatalog", offset: 0 });
  assert.equal(f.calls.filter((x) => x === "readCatalog").length, 2);
});

test("viewers share pins and catalog reads; unchanged older pages do not refill every refresh", async (t) => {
  const f = fixture(t);
  const read = (operation, offset) =>
    f.client.call({ operation, ...(offset === undefined ? {} : { offset }) });
  const refresh = async () => {
    await Promise.all([
      read("readCatalog", 0),
      read("readPins"),
      read("readProjects"),
      read("readPins"),
    ]);
    for (let offset = 20; offset < 200; offset += 20)
      await Promise.all([read("readCatalog", offset), read("readPins")]);
  };
  await refresh();
  assert.equal(f.calls.length, 12);
  await refresh();
  assert.equal(f.calls.length, 12, "second viewer reuses the same metadata");
  f.advance(30001);
  await refresh();
  assert.equal(f.calls.length, 15, "only first page, pins and projects revalidate");
  f.change();
  f.advance(30001);
  await refresh();
  assert.equal(
    f.calls.filter((x) => x === "readCatalog").length,
    21,
    "changed first page rebases all offset pages",
  );
  f.advance(120001);
  await refresh();
  assert.equal(
    f.calls.filter((x) => x === "readCatalog").length,
    31,
    "unchanged deep deletions also get bounded refresh",
  );
});

test("writes, restarts, manual transitions and revocation invalidate presentation reuse", async (t) => {
  const f = fixture(t);
  const pins = () => f.client.pins();
  await pins();
  await pins();
  assert.equal(f.calls.length, 1);
  await f.client.call({ operation: "dispatchText" });
  await pins();
  assert.equal(f.calls.length, 3);
  f.restart();
  await f.client.status();
  await pins();
  assert.equal(f.calls.length, 4);
  f.manual();
  await f.client.status();
  await pins();
  assert.equal(f.calls.length, 5);
  f.revoke();
  await assert.rejects(pins(), /REVOKED/);
});

test("a metadata read finishing after a write cannot seed the next viewer", async (t) => {
  const f = fixture(t),
    entered = Promise.withResolvers(),
    result = Promise.withResolvers();
  const request = f.client.request;
  f.client.request = async (input) => {
    if (input.operation === "readPins") {
      entered.resolve();
      return result.promise;
    }
    return request(input);
  };
  const old = f.client.pins();
  await entered.promise;
  await f.client.call({ operation: "dispatchText" });
  result.resolve({ items: [] });
  await old;
  f.client.request = request;
  await f.client.pins();
  assert.equal(f.calls.filter((x) => x === "readPins").length, 1);
});

test("connection heartbeats do not fetch models every minute; restart verifies immediately", async (t) => {
  const f = fixture(t),
    provider = new NativeGptProvider({ client: f.client });
  for (let n = 0; n < 90; n++) {
    await provider.connection();
    f.advance(10000);
  }
  assert.equal(f.calls.filter((x) => x === "readModels").length, 1);
  await provider.connection();
  assert.equal(f.calls.filter((x) => x === "readModels").length, 2);
  f.restart();
  await provider.connection();
  assert.equal(f.calls.filter((x) => x === "readModels").length, 3);
});

test("unrelated successes cannot reset repeated history throttling or shorten Retry-After", () => {
  let now = 0;
  const runtime = { Date: { now: () => now } },
    gate = nativeRequestGate("owner", runtime);
  for (const delay of [60000, 120000, 240000, 300000]) {
    assert.throws(() => gate.limited(undefined, "history"), /RATE_LIMITED/);
    now += delay - 1;
    gate.success("/models");
    assert.throws(() => gate.check(), /RATE_LIMITED/);
    now++;
    gate.check();
    gate.success("/models");
  }
  gate.success("history");
  assert.throws(() => gate.limited("900", "history"), /RATE_LIMITED/);
  now += 300000;
  gate.success("history");
  assert.throws(() => gate.check(), /RATE_LIMITED/);
  now += 600000;
  gate.check();
});

test("scheduled reads honor the account cooldown; native thrown errors retain Retry-After", async () => {
  let now = 0,
    calls = 0;
  const runtime = { Date: { now: () => now } },
    gate = nativeRequestGate("owner", runtime);
  const module = {
    M9: {
      accessInputs: {
        readAccountInfo: async () => ({ status: "ready", data: { accountId: "a", userId: "u" } }),
      },
    },
    kWt: { getRequestTarget: () => ({ url: "/automations", headers: {} }) },
    $rn: {
      getInstance: () => ({
        fetch: async (_url, options) => {
          calls++;
          options.onResponseHeaders(new Headers({ "Retry-After": "600" }));
          throw { status: 429, responseStatus: 429 };
        },
      }),
    },
  };
  const read = () =>
    nativeWorkspace(
      { operation: "scheduledList", accountFingerprint: "owner" },
      async () => ({ accountFingerprint: "owner" }),
      async () => module,
      runtime,
    );
  assert.throws(() => gate.limited("180", "history"), /RATE_LIMITED/);
  await assert.rejects(read(), /RATE_LIMITED/);
  assert.equal(calls, 0);
  now = 180000;
  await assert.rejects(read(), /RATE_LIMITED/);
  assert.equal(calls, 1);
  now += 599999;
  await assert.rejects(read(), /RATE_LIMITED/);
  assert.equal(calls, 1);
});
