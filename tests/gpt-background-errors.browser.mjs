import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const engine = process.env.BROWSER ?? "webkit",
  origin = "http://127.0.0.1:18948";
const f = await handoffFixture(origin),
  browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
let catalogReads = 0,
  failedCatalog = true,
  historyReads = 0,
  writes = 0;
const imageReads = new Map(),
  errors = [];
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
  "base64",
);
try {
  await f.app.listen({ host: "127.0.0.1", port: 18948 });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
  await context.addInitScript(() => {
    localStorage.setItem("codex-client", "gpt");
    localStorage.setItem("gpt-conversation", "chat");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/gpt/**", async (route) => {
    const p = new URL(route.request().url()).pathname,
      j = (json) => route.fulfill({ json });
    if (route.request().method() !== "GET") writes++;
    if (p === "/api/gpt/status")
      return j({
        configured: true,
        canRead: true,
        canSend: true,
        state: "healthy",
        message: "GPT на связи.",
      });
    if (p === "/api/gpt/models")
      return j({
        models: [{ id: "Latest", label: "Latest" }],
        efforts: [{ id: "2", label: "High" }],
        currentModel: "Latest",
        currentEffort: "2",
      });
    if (p === "/api/gpt/conversations") {
      catalogReads++;
      if (failedCatalog)
        return route.fulfill({
          status: 500,
          json: { error: { code: "REQUEST_FAILED", message: "Не удалось выполнить запрос" } },
        });
      return j({
        items: [{ id: "chat", title: "Работающий чат", updatedAt: 1 }],
        nextOffset: null,
      });
    }
    if (p.endsWith("/messages")) {
      historyReads++;
      return j({
        items: [
          {
            id: "user",
            role: "user",
            text: "Фото",
            createdAt: 1,
            complete: true,
            files: [
              {
                id: "photo",
                name: "Фото платы",
                image: true,
                mime: "image/png",
                bytes: image.length,
                url: "/api/gpt/native-assets/chat/user/photo",
              },
              {
                id: "missing",
                name: "Удалённое фото",
                image: true,
                mime: "image/png",
                bytes: 1,
                url: "/api/gpt/native-assets/chat/user/missing",
              },
            ],
          },
          {
            id: "answer",
            role: "assistant",
            phase: "final",
            complete: true,
            text: "Ответ успешно получен.",
            createdAt: 2,
            files: [],
          },
        ],
        nextBefore: null,
        revision: "a".repeat(64),
      });
    }
    if (p.includes("/native-assets/")) {
      const n = (imageReads.get(p) ?? 0) + 1;
      imageReads.set(p, n);
      if (p.endsWith("missing") || n < 3)
        return route.fulfill({ status: p.endsWith("missing") ? 404 : 503, body: "" });
      return route.fulfill({ status: 200, contentType: "image/png", body: image });
    }
    return j({ items: [], projects: [], conversations: [], nextOffset: null, blocked: false });
  });
  await page.goto(origin);
  const composer = page.getByRole("textbox", { name: "Сообщение GPT" });
  await expect(composer).toBeVisible();
  await composer.fill("Черновик не отправлять");
  await expect(page.getByText("Ответ успешно получен.", { exact: true })).toBeVisible();
  const photo = page.getByRole("img", { name: "Фото платы", exact: true });
  await expect
    .poll(() => photo.evaluate((el) => el.complete && el.naturalWidth > 0), { timeout: 12000 })
    .toBe(true);
  await expect.poll(() => catalogReads, { timeout: 12000 }).toBeGreaterThanOrEqual(3);
  await expect(page.locator(".global-notice")).toHaveCount(0);
  await expect(page.locator(".gpt-connection-banner")).toHaveCount(0);
  await expect(composer).toHaveValue("Черновик не отправлять");
  assert.equal(imageReads.get("/api/gpt/native-assets/chat/user/photo"), 3);
  assert.equal(imageReads.get("/api/gpt/native-assets/chat/user/missing"), 3);
  await photo.evaluate((el) => (window.retainedGptPhoto = el));
  await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
  await expect(
    page
      .getByText("Не удалось обновить список диалогов.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  failedCatalog = false;
  const previousHistory = historyReads;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Не удалось обновить список диалогов.", { exact: true })).toHaveCount(
    0,
  );
  await expect.poll(() => historyReads, { timeout: 35000 }).toBeGreaterThan(previousHistory);
  assert.equal(await photo.evaluate((el) => el === window.retainedGptPhoto), true);
  assert.equal(
    imageReads.get("/api/gpt/native-assets/chat/user/photo"),
    3,
    "healthy image never reloads with history",
  );
  assert.equal(
    imageReads.get("/api/gpt/native-assets/chat/user/missing"),
    3,
    "permanent failure stops after bounded retries",
  );
  await expect(composer).toHaveValue("Черновик не отправлять");
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  await mkdir(".local/qa-gpt-background", { recursive: true });
  await page.screenshot({ path: `.local/qa-gpt-background/${engine}.png` });
  console.log(
    engine +
      ": scoped catalog failure/recovery, transient image recovery, bounded missing image, stable history DOM, retained draft, zero sends passed",
  );
} finally {
  await context.close();
  await browser.close();
  await f.close();
}
