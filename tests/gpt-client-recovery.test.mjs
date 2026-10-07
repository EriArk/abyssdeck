import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NativeGptReadClient } from "../apps/hub/dist/gpt-native.js";
import { NativeClientRecovery } from "../ops/gpt-native/client-recovery.mjs";
import { listenNative } from "../ops/gpt-native/service.mjs";
import { nativeWorkspaceFixture } from "./fixtures/native-workspace.mjs";
import { handoffFixture } from "./handoff-fixture.mjs";

test("Hub recovery requires authenticated explicit POST and receipt reads never restart", async (t) => {
  const native = nativeWorkspaceFixture(),
    calls = [];
  native.client.clientRecovery = async (key, checkOnly) => {
    calls.push({ key, checkOnly });
    return {
      available: true,
      operation: key ? { key, state: "restarting", requestedAt: Date.now() } : null,
    };
  };
  const f = await handoffFixture(undefined, undefined, { nativeGpt: native.workspace });
  t.after(() => f.close());
  const url = "/api/gpt/client-restart",
    key = randomUUID();
  assert.equal((await f.app.inject({ url })).statusCode, 401);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        headers: { cookie: f.headers.cookie },
        payload: { confirm: true },
      })
    ).statusCode,
    403,
  );
  const headers = { ...f.headers, "idempotency-key": key };
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url,
        headers,
        payload: { confirm: true, machineId: "someone-else" },
      })
    ).statusCode,
    400,
  );
  assert.equal(calls.length, 0);
  assert.equal((await f.app.inject({ url, headers })).statusCode, 200);
  assert.deepEqual(calls.at(-1), { key: undefined, checkOnly: true });
  assert.equal(
    (await f.app.inject({ method: "POST", url, headers, payload: { confirm: true } })).statusCode,
    202,
  );
  assert.deepEqual(calls.at(-1), { key, checkOnly: false });
  assert.equal((await f.app.inject({ url: url + "?key=" + key, headers })).statusCode, 200);
  assert.deepEqual(calls.at(-1), { key, checkOnly: true });
  assert.equal(native.state.sends, 0);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gpt-restart-"));
  chmodSync(root, 0o700);
  const userId = randomUUID();
  let restarts = 0;
  const controllers = [];
  const make = () => {
    const value = new NativeClientRecovery({
      root,
      userId,
      service: {
        request: async () => {
          throw Error("NATIVE_BUSY");
        },
      },
      restart: () => {
        restarts++;
      },
    });
    controllers.push(value);
    return value;
  };
  t.after(() => {
    for (const c of controllers) c.db.close();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, userId, make, restarts: () => restarts };
}

test("manual recovery bypasses a stuck renderer but rejects another actor and arbitrary fields", async (t) => {
  const f = fixture(t),
    c = f.make(),
    key = randomUUID();
  assert.equal((await c.request({ userId: f.userId, operation: "restartStatus" })).operation, null);
  assert.equal(f.restarts(), 0);
  await assert.rejects(
    c.request({ userId: randomUUID(), operation: "restartClient", key }),
    /WRONG_OWNER/,
  );
  await assert.rejects(
    c.request({ userId: f.userId, operation: "restartClient", key, command: "anything" }),
    /INVALID_REQUEST/,
  );
  const input = { userId: f.userId, operation: "restartClient", key };
  assert.equal((await c.request(input)).operation.state, "restarting");
  assert.equal(
    f.restarts(),
    0,
    "receipt must be persisted before response/close triggers recovery",
  );
  c.afterResponse(input);
  c.afterResponse(input);
  assert.equal(f.restarts(), 1);
});

test("duplicate keys and simultaneous tabs survive restart without replay or changed receipts", async (t) => {
  const f = fixture(t),
    c = f.make(),
    keys = [randomUUID(), randomUUID()];
  for (const key of keys) {
    const input = { userId: f.userId, operation: "restartClient", key };
    await c.request(input);
    c.afterResponse(input);
  }
  assert.equal(f.restarts(), 1);
  const restored = f.make();
  for (const key of keys) {
    const input = { userId: f.userId, operation: "restartClient", key };
    assert.equal((await restored.request(input)).operation.state, "restarted");
    restored.afterResponse(input);
    assert.equal(
      (await restored.request({ ...input, operation: "restartStatus" })).operation.key,
      key,
    );
  }
  assert.equal(f.restarts(), 1);
  assert.equal(
    (await restored.request({ userId: f.userId, operation: "restartStatus", key: randomUUID() }))
      .operation,
    null,
  );
});

test("typed HTTP client reads receipts and sends recovery once independently of renderer health", async (t) => {
  const f = fixture(t),
    c = f.make();
  const socketPath = join(f.root, "adapter.sock");
  const server = await listenNative(c, socketPath);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  let allowed = true;
  const client = new NativeGptReadClient({ socketPath, userId: f.userId }, () => {
    if (!allowed) throw Error("REVOKED");
  });
  assert.equal((await client.clientRecovery()).available, true);
  const key = randomUUID();
  assert.equal((await client.clientRecovery(key)).operation.state, "restarting");
  assert.equal(f.restarts(), 1);
  assert.equal((await client.clientRecovery(key, true)).operation.key, key);
  assert.equal(f.restarts(), 1);
  allowed = false;
  await assert.rejects(client.clientRecovery(randomUUID()), /REVOKED/);
  assert.equal(f.restarts(), 1);
});
