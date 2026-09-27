import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const engine = process.env.BROWSER ?? "webkit",
  origin = "http://127.0.0.1:18947";
const f = await handoffFixture(origin),
  browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
const text =
  "### Master research knowledge base + mandatory Codex workflow\n\n```md\n" +
  "LongFileNameWithoutSpaces".repeat(16) +
  "\n```\n\n" +
  "[Very long reference](https://example.org/" +
  "a".repeat(250) +
  ")";
f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
f.store.append(
  f.thread.id,
  "assistant.completed",
  { id: "wrap", text, phase: "final_answer" },
  "turn",
);
f.store.setStatus(f.thread.id, "completed");
f.store.setPreferences({
  projectId: "project",
  threadId: f.thread.id,
  view: "chat",
  theme: "crt-green",
});
let checks = 0,
  active = 0,
  maxActive = 0,
  writes = 0;
try {
  await f.app.listen({ host: "127.0.0.1", port: 18947 });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
  await context.addInitScript(() => {
    localStorage.setItem("codex-client", "gpt");
    localStorage.setItem("gpt-conversation", "chat");
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/gpt/**", async (route) => {
    const p = new URL(route.request().url()).pathname,
      j = (json) => route.fulfill({ json });
    if (p === "/api/gpt/status") {
      const n = ++checks;
      maxActive = Math.max(maxActive, ++active);
      try {
        if (n === 2) await new Promise((r) => setTimeout(r, 11000));
        return await j({
          configured: true,
          canRead: n > 1,
          canSend: n > 1,
          state: n === 1 ? "unavailable" : "healthy",
          message: n === 1 ? "Нет связи с подключением GPT." : "GPT на связи.",
        });
      } finally {
        active--;
      }
    }
    if (p === "/api/gpt/reconnect")
      return route.fulfill({
        status: 503,
        json: { error: { code: "TRANSPORT_UNAVAILABLE", message: "Временная ошибка подключения" } },
      });
    if (route.request().method() !== "GET") writes++;
    if (p === "/api/gpt/models")
      return j({
        models: [{ id: "Latest", label: "Latest" }],
        efforts: [{ id: "2", label: "High" }],
        currentModel: "Latest",
        currentEffort: "2",
      });
    if (p === "/api/gpt/conversations")
      return j({
        items: [{ id: "chat", title: "Обзор развития проекта", updatedAt: 1 }],
        nextOffset: null,
      });
    if (p.endsWith("/messages"))
      return j({
        items: [
          {
            id: "wrap",
            role: "assistant",
            phase: "final",
            complete: true,
            text,
            createdAt: 1,
            files: [],
          },
        ],
        nextBefore: null,
        revision: "a".repeat(64),
      });
    return j({ items: [], projects: [], conversations: [], nextOffset: null, blocked: false });
  });
  await page.goto(origin);
  const compose = page.getByRole("textbox", { name: "Сообщение GPT" });
  await expect(compose).toBeVisible();
  await compose.fill("Сохранённый черновик");
  const banner = page.locator(".gpt-connection-banner");
  await expect(page.getByText("Нет связи с подключением GPT.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Проверить подключение GPT", exact: true }).click();
  await expect(page.getByText("Временная ошибка подключения", { exact: true })).toBeVisible();
  await expect(page.getByText("Нет связи с подключением GPT.", { exact: true })).toHaveCount(0, {
    timeout: 27000,
  });
  await expect(page.getByText("Временная ошибка подключения", { exact: true })).toHaveCount(0);
  assert.equal(
    maxActive,
    1,
    "slow health reads are not overlapped or discarded each polling interval",
  );
  await expect(compose).toHaveValue("Сохранённый черновик");
  // A network wake automatically refreshes state; it never sends the preserved draft.
  const before = checks;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => checks).toBeGreaterThan(before);
  await mkdir(".local/qa-gpt-recovery", { recursive: true });
  for (const client of ["gpt", "codex"]) {
    if (client === "codex")
      await page.evaluate(() =>
        document.activeElement.dispatchEvent(
          new KeyboardEvent("keydown", {
            code: "KeyG",
            key: "g",
            ctrlKey: true,
            altKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
    const pane = page.locator(client === "gpt" ? ".gpt-message-scroll" : ".chat-scroll");
    await expect(pane.locator(".message-short-block")).toBeVisible();
    for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"])
      for (const [width, height] of [
        [390, 844],
        [820, 1180],
        [1366, 1024],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        await expect
          .poll(() => pane.evaluate((el) => el.scrollWidth - el.clientWidth))
          .toBeLessThanOrEqual(1);
        const pre = pane.locator(".message-short-block pre");
        await expect(pre).toHaveCSS("white-space", "pre-wrap");
        await expect
          .poll(() => pre.evaluate((el) => el.scrollWidth - el.clientWidth))
          .toBeLessThanOrEqual(1);
        if (width === 390)
          await page.screenshot({
            path: `.local/qa-gpt-recovery/${engine}-${client}-${theme}.png`,
          });
      }
  }
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  console.log(
    engine +
      ": delayed health auto-recovery, single flight, wake recovery, no sends; GPT/Codex wrapping across 24 layouts passed",
  );
} finally {
  await context.close();
  await browser.close();
  await f.close();
}
