import assert from "node:assert/strict";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

for (const type of [chromium, webkit]) {
  const origin = "http://127.0.0.1:18938";
  const f = await handoffFixture(origin);
  const browser = await type.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  try {
    await f.app.listen({ port: 18938, host: "127.0.0.1" });
    assert.equal((await f.release()).statusCode, 200);
    f.store.setPreferences({ projectId: "project", threadId: f.thread.id, view: "chat" });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
    const page = await context.newPage();
    let locked = true;
    let sends = 0;
    const refusal = {
      error: {
        code: "THREAD_IN_USE",
        message: "Выйди из ChatGPT/Codex на Windows. Оставь AbyssDeck Companion включённым.",
      },
    };
    await page.route("**/api/threads/*/turns", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      sends++;
      return locked ? route.fulfill({ status: 409, json: refusal }) : route.continue();
    });
    await page.goto(origin);
    const editor = page.getByRole("textbox", { name: "Сообщение Codex" });
    const send = page.getByRole("button", { name: "Отправить сообщение", exact: true });
    await expect(editor).toBeVisible();
    await editor.fill("Мой сохранённый черновик");
    await send.click();
    const error = page.locator(".send-error");
    await expect(error).toContainText("другом клиенте Codex");
    await expect(error).not.toContainText("Windows");
    await expect(error).not.toContainText("Companion");
    await expect(editor).toHaveValue("Мой сохранённый черновик");
    assert.equal(f.calls.filter((call) => call.method === "turn/start").length, 0);
    locked = false;
    await page.getByRole("button", { name: "Проверить доступ", exact: true }).click();
    await expect(error).toHaveCount(0);
    await expect(editor).toHaveValue("Мой сохранённый черновик");
    assert.equal(sends, 1);
    assert.equal(f.calls.filter((call) => call.method === "turn/start").length, 0);
    await send.click();
    await expect(editor).toHaveValue("");
    assert.equal(sends, 2);
    assert.equal(f.calls.filter((call) => call.method === "turn/start").length, 1);
    assert.equal(f.desktopCalls.filter((action) => action === "ForceRelease").length, 1);
    console.log(`${type.name()}: writer conflict keeps draft; access recovery never sends it`);
  } finally {
    await context.close();
    await browser.close();
    await f.close();
  }
}
