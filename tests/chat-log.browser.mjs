import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit, expect } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

await mkdir(".local/qa-chat-log", { recursive: true });
for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18859",
    f = await handoffFixture(origin);
  // Keep the UI fixture's project stable; native discovery/backfill is tested separately.
  f.sessions.catalog.refresh = async () => {};
  f.sessions.catalog.syncThreads = async () => {};
  f.sessions.catalog.history = async (thread) => ({
    ...f.store.history(thread.id),
    nextBefore: null,
    hasMore: false,
  });
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
  });
  f.store.db
    .prepare("UPDATE threads SET origin='web',status='running' WHERE id=?")
    .run(f.thread.id);
  f.store.append(f.thread.id, "user.message", {
    id: "request",
    text: "Continue the project from this saved conversation.",
  });
  f.store.append(
    f.thread.id,
    "assistant.completed",
    { id: "answer", text: "The implementation is ready. The remaining step is installation." },
    "turn",
  );
  const browser = await engine.launch();
  try {
    await f.app.listen({ port: 18859, host: "127.0.0.1" });
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const [cookieName, value] = f.headers.cookie.split("=");
    await context.addCookies([
      { name: cookieName, value, url: origin, httpOnly: true, sameSite: "Strict" },
    ]);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
    await composer.fill("Keep this draft");
    await page.getByRole("button", { name: "Обзор текущего проекта" }).click();
    const logs = page.getByRole("region", { name: "Журнал чатов" });
    await expect(logs.getByLabel("Диалог")).toHaveValue(f.thread.id);
    await logs.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/qa-chat-log/${name}-phone.png` });
    await logs.getByRole("button", { name: "Скачать архив чата" }).click();
    await expect(page.getByText("Сохранить файл", { exact: true })).toBeVisible();
    assert.equal(context.pages().length, 1);
    assert.equal(page.url(), origin + "/");
    await page.getByRole("button", { name: "Закрыть сохранение" }).click();
    await expect(composer).toHaveValue("Keep this draft");
    await page.setViewportSize({ width: 1366, height: 1024 });
    await logs.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/qa-chat-log/${name}-desktop.png` });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      `${name}: project log, saved chat selection, one closeable save overlay, draft and responsive layout passed`,
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
