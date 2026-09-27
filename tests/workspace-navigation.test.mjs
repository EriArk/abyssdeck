import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveShortcuts,
  normalizeShortcut,
  shortcutOverridesSchema,
} from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

test("shortcut policy normalizes physical keys, protects browser/editor and rejects duplicates", () => {
  assert.equal(normalizeShortcut("Shift+Primary+KeyG"), "Primary+Shift+KeyG");
  for (const value of [
    "KeyK",
    "Alt+KeyK",
    "Primary+KeyS",
    "Primary+Shift+KeyR",
    "Primary+Digit1",
    "Primary+KeyW",
    "Primary+KeyF",
    "Primary+KeyZ",
    "Primary+F5",
    "Primary+Primary+KeyK",
  ])
    assert.throws(() => normalizeShortcut(value), value);
  assert(shortcutOverridesSchema.safeParse({}).success);
  assert(!shortcutOverridesSchema.safeParse({ "switch-client": "Primary+KeyK" }).success);
  assert(!shortcutOverridesSchema.safeParse({ shell: "Primary+KeyG" }).success);
  assert(
    shortcutOverridesSchema.safeParse({ palette: null, "switch-client": "Primary+KeyK" }).success,
  );
  assert.equal(effectiveShortcuts({ palette: null }).palette, null);
});

test("navigation is authenticated, title-free, bounded, deduplicated and actor-local", async (t) => {
  const a = await handoffFixture(),
    b = await handoffFixture();
  t.after(async () => {
    await a.close();
    await b.close();
  });
  const url = "/api/workspace/navigation";
  assert.equal((await a.app.inject({ url })).statusCode, 401);
  const patch = (body) => a.app.inject({ method: "PATCH", url, headers: a.headers, payload: body });
  const ref = { client: "codex", kind: "thread", id: a.thread.id };
  assert.equal(
    (await patch({ action: "visit", ref: { ...ref, title: "private label" } })).statusCode,
    400,
  );
  for (let i = 0; i < 40; i++)
    assert.equal(
      (await patch({ action: "visit", ref: { ...ref, id: "id-" + i } })).statusCode,
      200,
    );
  await patch({ action: "visit", ref });
  await patch({ action: "visit", ref });
  await patch({ action: "pin", ref, value: true });
  const state = (await a.app.inject({ url, headers: a.headers })).json();
  assert.equal(state.recent.length, 32);
  assert.equal(state.recent.filter((r) => r.id === ref.id).length, 1);
  assert.equal(state.pinned.length, 1);
  assert.deepEqual((await b.app.inject({ url, headers: b.headers })).json().recent, []);
  assert.equal(
    (await patch({ action: "shortcuts", value: { palette: "Primary+KeyR" } })).statusCode,
    400,
  );
  assert.equal(
    (await patch({ action: "shortcuts", value: { palette: "Primary+Shift+KeyK" } })).statusCode,
    200,
  );
  assert.equal(
    (await a.app.inject({ url, headers: a.headers })).json().shortcuts.palette,
    "Primary+Shift+KeyK",
  );
  assert.deepEqual((await b.app.inject({ url, headers: b.headers })).json().shortcuts, {});
  await patch({ action: "clear" });
  const cleared = (await a.app.inject({ url, headers: a.headers })).json();
  assert.equal(cleared.recent.length, 0);
  assert.equal(cleared.pinned.length, 1);
});

test("destination metadata rejects removed/archived sources, resolves saved old chats and never probes native writers", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  f.store.db.prepare("UPDATE threads SET title=? WHERE id=?").run("ПРОЕКТ Кириллица", f.thread.id);
  const get = async (suffix) =>
    (
      await f.app.inject({ url: "/api/workspace/destinations" + suffix, headers: f.headers })
    ).json();
  assert(
    (await get("?q=" + encodeURIComponent("кириллица"))).items.some(
      (i) => i.ref.id === f.thread.id,
    ),
  );
  assert(!(await get("?q=%25")).items.length);
  for (let i = 0; i < 310; i++) f.store.createThread("project", "native-" + i, "Other " + i);
  assert((await get("?id=" + f.thread.id)).items.some((i) => i.ref.id === f.thread.id));
  f.sessions.catalog.library.save("thread", f.thread.codexThreadId, { archived: true });
  assert(!(await get("?id=" + f.thread.id)).items.length);
  f.sessions.catalog.library.save("thread", f.thread.codexThreadId, {
    archived: false,
    deleted: true,
  });
  assert(!(await get("?id=" + f.thread.id)).items.length);
  f.sessions.catalog.library.save("project", "project", { archived: true });
  assert(!(await get("")).items.length);
  assert.equal(f.calls.length, 0);
  assert.equal(f.desktopCalls.length, 0);
});

test("obsolete or reserved stored overrides fail closed until explicitly reset", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  f.store.setPreferences({ shortcuts: { palette: "Primary+KeyR" } });
  const state = (
    await f.app.inject({ url: "/api/workspace/navigation", headers: f.headers })
  ).json();
  assert(state.shortcutWarning);
  assert(Object.values(state.shortcuts).every((value) => value === null));
});
