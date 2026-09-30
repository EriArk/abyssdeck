import assert from "node:assert/strict";
import test from "node:test";
import { createPushState } from "../apps/web/src/pushState.ts";

const categories = { completed: false, attention: true, errors: false };
const intent = { enabled: true, categories, preview: false };
const sub = {
  endpoint: "https://web.push.apple.com/fixture",
  toJSON() {
    return { endpoint: this.endpoint, keys: {} };
  },
};
const device = "a".repeat(64);
function fixture({
  stored = true,
  subscription = sub,
  enabled = true,
  permission = "granted",
  post,
} = {}) {
  const items = new Map(
    stored
      ? [
          ["codex-push-device", device],
          ["codex-push-intent", JSON.stringify(intent)],
        ]
      : [],
  );
  const calls = [];
  const api = async (path, opts = {}) => {
    calls.push({ path, ...opts });
    if (opts.method === "POST") return post ? post() : { id: device };
    return {
      available: true,
      publicKey: "A".repeat(87),
      enabled: enabled && path.includes(device),
      categories,
      preview: false,
    };
  };
  const registration = {
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => {
        throw Object.assign(new Error("tap required"), { name: "NotAllowedError" });
      },
    },
  };
  const state = createPushState({
    storage: {
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => items.set(k, v),
      removeItem: (k) => items.delete(k),
    },
    api,
    ready: async () => registration,
    permission: () => permission,
    hash: async () => device,
    changed: () => {},
  });
  return { state, calls, items };
}
test("empty subscription/denied permission never silently delete enabled push preferences", async () => {
  for (const permission of ["granted", "denied"]) {
    const f = fixture({ subscription: null, permission });
    assert.equal((await f.state.restore()).status.enabled, true);
    assert(f.items.has("codex-push-intent"));
    assert.equal(f.calls.filter((x) => x.method).length, 0);
  }
});
test("lost browser device key recovers exact endpoint and server preferences without opting in a new device", async () => {
  const f = fixture({ stored: false });
  const r = await f.state.restore();
  assert.equal(r.status.enabled, true);
  assert.deepEqual(r.status.categories, categories);
  assert.equal(r.status.preview, false);
  assert.equal(f.state.id(), device);
  const noConsent = fixture({ stored: false, enabled: false });
  await noConsent.state.restore();
  assert.equal(noConsent.calls.filter((x) => x.method === "POST").length, 0);
});
test("returning opted-in device restores an expired registration, coalesces slow probes and preserves choices", async () => {
  const f = fixture({ enabled: false });
  const a = f.state.restore(),
    b = f.state.restore();
  assert.equal(a, b);
  assert.equal((await a).status.enabled, true);
  const saved = f.calls.filter((x) => x.method === "POST");
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].body.categories, categories);
  assert.equal(saved[0].body.preview, false);
});
test("explicit disable wins over in-flight accepted recovery and removes retained consent", async () => {
  let accept, started;
  const barrier = new Promise((r) => {
    started = r;
  });
  const f = fixture({
    enabled: false,
    post: () => {
      started();
      return new Promise((r) => {
        accept = r;
      });
    },
  });
  const restoring = f.state.restore();
  await barrier;
  const disabled = f.state.disable();
  accept({ id: device });
  await Promise.all([restoring, disabled]);
  assert.equal(f.state.id(), "");
  assert.equal(f.items.has("codex-push-intent"), false);
  assert.equal(f.calls.at(-1).method, "DELETE");
});
test("existing device opt-in from before this fix repairs a vanished server row after login", async () => {
  const f = fixture({ enabled: false });
  f.items.delete("codex-push-intent");
  assert.equal((await f.state.restore()).status.enabled, true);
  assert.equal(f.calls.filter((x) => x.method === "POST").length, 1);
  const disabled = fixture({ stored: false, enabled: false });
  await disabled.state.restore();
  assert.equal(disabled.calls.filter((x) => x.method === "POST").length, 0);
});

test("rotated browser endpoint retains existing opt-in and exact category preferences", async () => {
  // The server still knows the previous endpoint; the new endpoint is not yet registered.
  const items = new Map([["codex-push-device", "b".repeat(64)]]),
    calls = [];
  const api = async (path, opts = {}) => {
    calls.push({ path, ...opts });
    return opts.method === "POST"
      ? { id: device }
      : {
          available: true,
          publicKey: "A".repeat(87),
          enabled: path.includes("b".repeat(64)),
          categories,
          preview: false,
        };
  };
  const state = createPushState({
    storage: {
      getItem: (k) => items.get(k) ?? null,
      setItem: (k, v) => items.set(k, v),
      removeItem: (k) => items.delete(k),
    },
    api,
    ready: async () => ({ pushManager: { getSubscription: async () => sub } }),
    permission: () => "granted",
    hash: async () => device,
    changed: () => {},
  });
  assert.equal((await state.restore()).status.enabled, true);
  const saved = calls.find((x) => x.method === "POST");
  assert.deepEqual(saved.body.categories, categories);
  assert.equal(saved.body.preview, false);
  assert.equal(state.id(), device);
});
