import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const origin = "http://127.0.0.1:18967";
await mkdir(".local/qa-multi-chat", { recursive: true });
for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const f = await handoffFixture(origin);
  const browser = await engine.launch();
  try {
    f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
    f.sessions.catalog.syncThreads = async () => {};
    const request = f.rpc.request.bind(f.rpc);
    f.rpc.request = async (method, params) =>
      method === "thread/start" ? { thread: { id: randomUUID() } } : request(method, params);
    f.store.setPreferences({
      projectId: "project",
      threadId: f.thread.id,
      view: "chat",
      theme: "crt-green",
      machineClients: { pc: "web" },
    });
    const empty = await f.sessions.create("project", "Новый диалог");
    for (let i = 0; i < 4; i++) await f.sessions.create("project", "Новый диалог");
    await f.sessions.startTurn(f.thread.id, "Keep working in the first chat");
    const firstTurn = f.store.thread(f.thread.id).activeTurnId;
    await f.app.listen({ host: "127.0.0.1", port: 18967 });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: "block",
    });
    const [cookieName, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name: cookieName, value, url: origin, httpOnly: true }]);
    const page = await context.newPage();
    const posts = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/projects\/[^/]+\/threads$/.test(new URL(r.url()).pathname))
        posts.push(r.url());
    });
    await page.goto(origin);
    const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
    await expect(composer).toBeVisible();
    const select = async (id) => {
      await page.getByRole("button", { name: "Открыть проекты", exact: true }).tap();
      const drawer = page.locator(".project-sheet[open]");
      await drawer.locator(`[data-thread-id="${id}"]`).tap();
      await expect(drawer).toHaveCount(0);
      await expect.poll(() => f.store.preferences().threadId).toBe(id);
    };
    for (let i = 0; i < 3; i++) {
      await select(empty.id);
      await expect(composer).toHaveValue(i ? "Empty chat draft" : "");
      await composer.fill("Empty chat draft");
      await select(f.thread.id);
      await expect(composer).toHaveValue(i ? "First chat draft" : "");
      await composer.fill("First chat draft");
    }
    assert.equal(posts.length, 0, "opening an existing empty chat never creates another");
    assert.equal(f.store.threads("project").length, 6);

    // A catalog read started after creation must not undo a later explicit selection.
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let requested;
    const pending = new Promise((resolve) => {
      requested = resolve;
    });
    const catalogUrl = `${origin}/api/projects/project/threads`;
    await page.route(catalogUrl, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      requested();
      await held;
      await route.fulfill({ json: { threads: f.store.threads("project") } });
    });
    await page.getByRole("button", { name: "Создать диалог", exact: true }).tap();
    await pending;
    await expect(composer).toHaveValue("");
    await select(empty.id);
    await expect(composer).toHaveValue("Empty chat draft");
    const response = page.waitForResponse(
      (r) => r.url() === catalogUrl && r.request().method() === "GET",
    );
    release();
    await (await response).finished();
    // Let the response's React commit and serialized preference write both settle.
    await page.waitForTimeout(300);
    await expect(composer).toHaveValue("Empty chat draft");
    assert.equal(f.store.preferences().threadId, empty.id);
    assert.equal(posts.length, 1, "only the explicit creation sends a POST");
    assert.equal(f.store.threads("project").length, 7);
    await page.unroute(catalogUrl);

    await composer.fill("Second independent request");
    await page.getByRole("button", { name: "Отправить сообщение", exact: true }).tap();
    await expect.poll(() => f.store.thread(empty.id).status).toBe("running");
    assert.equal(f.store.thread(f.thread.id).activeTurnId, firstTurn);
    assert.equal(f.store.thread(f.thread.id).status, "running");
    assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 2);
    assert.equal(f.calls.filter((c) => c.method === "turn/interrupt").length, 0);
    await select(f.thread.id);
    await expect(composer).toHaveValue("First chat draft");
    await page.screenshot({ path: `.local/qa-multi-chat/${name}.png`, fullPage: true });
    console.log(name, "multi-chat PASS");
  } finally {
    await browser.close();
    await f.close();
  }
}
