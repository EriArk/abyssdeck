import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const sharp = createRequire(new URL("../apps/hub/package.json", import.meta.url))("sharp");
const picture = await sharp({
  create: { width: 320, height: 240, channels: 3, background: "#88aac8" },
})
  .png()
  .toBuffer();
await mkdir(".local/qa-codex-images", { recursive: true });
for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18947";
  const f = await handoffFixture(origin);
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  try {
    f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
    f.store.append(
      f.thread.id,
      "user.message",
      { id: "request", text: "Проверить снимки" },
      "image-turn",
    );
    await f.app.listen({ port: 18947, host: "127.0.0.1" });
    const [cookieName, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name: cookieName, value, url: origin, httpOnly: true }]);
    await context.addInitScript((thread) => {
      localStorage.setItem("codex-client", "codex");
      localStorage.setItem("codex-project", "project");
      localStorage.setItem("codex-thread", thread);
    }, f.thread.id);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await expect(page.getByText("Проверить снимки", { exact: true }).first()).toBeVisible();
    const editor = page.getByRole("textbox", { name: "Сообщение Codex" });
    await editor.fill("Сохранить черновик");
    const runtime = {
      rpc: f.rpc,
      loaded: new Set([f.thread.id]),
      active: new Set(),
      machineId: "pc",
      touched: 0,
    };
    const emit = (method, params) =>
      f.sessions.notification(runtime, method, {
        threadId: f.thread.codexThreadId,
        turnId: "image-turn",
        ...params,
      });
    emit("turn/started", { turn: { id: "image-turn" } });
    emit("item/completed", {
      item: {
        id: "screenshot-output",
        type: "functionCallOutput",
        name: "exec",
        output: [
          { type: "input_image", image_url: "data:image/png;base64," + picture.toString("base64") },
        ],
      },
    });
    const screenshot = page.getByRole("button", { name: "Посмотреть Изображение", exact: true });
    await expect(screenshot).toBeVisible();
    await expect(screenshot.locator("img")).toHaveJSProperty("naturalWidth", 320);
    emit("turn/completed", { turn: { id: "image-turn", status: "completed" } });
    await expect(screenshot).toBeVisible();
    await page.reload();
    await expect(screenshot).toBeVisible();
    await expect(screenshot.locator("img")).toHaveJSProperty("naturalWidth", 320);
    await expect(page.locator(".commentary-message .typing")).toHaveCount(0);
    await expect(editor).toHaveValue("Сохранить черновик");
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await screenshot.scrollIntoViewIfNeeded();
      await screenshot.click();
      await expect(page.locator(".attachment-preview[open]")).toBeVisible();
      await page.getByRole("button", { name: "Закрыть изображение", exact: true }).click();
      await expect(screenshot).toBeVisible();
      await page.screenshot({ path: `.local/qa-codex-images/${name}-${width}-retained.png` });
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        browser: name,
        live: true,
        completed: true,
        reload: true,
        viewer: true,
        draft: true,
        widths: [390, 1024],
      }),
    );
  } finally {
    await context.close();
    await browser.close();
    await f.close();
  }
}
