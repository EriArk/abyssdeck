import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { usageFixture } from "./usage-resets-fixture.mjs";

const engine = process.env.SETTINGS_ENGINE || "chromium";
const origin = "http://127.0.0.1:18946";
const f = await usageFixture(origin);
f.store.setPreferences({
  projectId: "project",
  threadId: f.thread.id,
  theme: "crt-green",
  machineClients: { pc: "web" },
});
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  serviceWorkers: "block",
  reducedMotion: "reduce",
});
const [name, value] = f.headers.cookie.split("=");
await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
const page = await context.newPage();
page.setDefaultTimeout(10000);
const requests = [],
  errors = [];
let operation = null,
  loseAck = false,
  restarting = false;
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/**", async (route) => {
  const req = route.request(),
    url = new URL(req.url()),
    path = url.pathname;
  requests.push({ path, method: req.method() });
  if (path === "/api/gpt/client-restart") {
    if (req.method() === "POST") {
      operation = {
        key: req.headers()["idempotency-key"],
        state: "restarting",
        requestedAt: Date.now(),
      };
      restarting = true;
      if (loseAck) return route.abort();
    }
    return route.fulfill({
      json: {
        available: true,
        operation: operation && { ...operation, state: restarting ? "restarting" : "restarted" },
      },
    });
  }
  if (path.startsWith("/api/gpt/")) {
    let json = { items: [], conversations: [], nextOffset: null, blocked: false };
    if (path.endsWith("/status") || path.endsWith("/reconnect"))
      json = {
        configured: true,
        canSend: true,
        canRead: true,
        state: "healthy",
        message: "ChatGPT подключён",
        connectUrl: "/gpt-connect?runtime=native",
        activeJobs: 0,
        unknownJobs: 0,
      };
    if (path.endsWith("/models"))
      json = {
        models: [{ id: "latest", label: "Latest" }],
        efforts: [{ id: "6", label: "Extra High" }],
        currentModel: "latest",
        currentEffort: "6",
      };
    return route.fulfill({ json });
  }
  return route.continue();
});
const button = (name) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
const posts = () =>
  requests.filter((r) => r.path === "/api/gpt/client-restart" && r.method === "POST").length;
const reads = () =>
  requests.filter((r) => r.path === "/api/gpt/client-restart" && r.method === "GET").length;
async function settingsOpen() {
  await button("Настройки").click();
}
try {
  await f.app.listen({ host: "127.0.0.1", port: 18946 });
  await page.goto(origin);
  console.log("Loaded fixture", engine);
  const draft = page.getByRole("textbox", { name: "Сообщение Codex" });
  await draft.fill("Keep this draft");
  await draft.blur();
  await settingsOpen();
  console.log("Codex settings opened");
  await expect(settings.getByRole("heading", { name: "Быстрые настройки · Codex" })).toBeVisible();
  await expect(button("Перезапустить Codex")).toBeEnabled();
  assert.equal(reads(), 0);
  await button("Перезапустить Codex").click();
  await expect.poll(() => f.desktopCalls.length).toBeGreaterThan(0);
  assert.equal(await button("Да, перезапустить").count(), 0, "ordinary quick restart uses one tap");
  await button("Закрыть настройки").click();
  await expect(draft).toHaveValue("Keep this draft");
  await button("Переключиться на GPT").click();
  await settingsOpen();
  await expect(settings.getByRole("heading", { name: "Быстрые настройки · GPT" })).toBeVisible();
  await expect(button("Перезапустить GPT-клиент")).toBeEnabled();
  assert.equal(posts(), 0, "opening settings never restarts");
  const initialReads = reads();
  await page.waitForTimeout(2200);
  assert.equal(reads(), initialReads, "idle quick settings do not poll recovery");
  await button("Перезапустить GPT-клиент").dblclick();
  await expect(button("Перезапускаю GPT…")).toBeDisabled();
  assert.equal(posts(), 1);
  restarting = false;
  await expect(settings.getByText("Клиент перезапущен. GPT загрузит свои данные.")).toBeVisible();
  loseAck = true;
  await button("Перезапустить GPT-клиент").click();
  restarting = false;
  await expect(settings.getByText("Клиент перезапущен. GPT загрузит свои данные.")).toBeVisible();
  assert.equal(posts(), 2, "lost acknowledgement never repeats a POST");
  await mkdir(".codex/quick-settings", { recursive: true });
  for (const width of [1366, 820, 390]) {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 1024 });
    await expect(settings.getByRole("heading", { name: "Быстрые настройки · GPT" })).toBeVisible();
    const overflow = await settings.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.equal(overflow, false);
    await settings.screenshot({ path: `.codex/quick-settings/${engine}-${width}.png` });
  }
  await button("Тема").click();
  const hiddenReads = reads();
  await page.waitForTimeout(2200);
  assert.equal(reads(), hiddenReads, "hidden home stops recovery reads");
  await button("Закрыть настройки").click();
  assert.deepEqual(
    errors.filter((e) => !e.includes("Load failed") && !e.includes("Failed to fetch")),
    [],
  );
  console.log(
    JSON.stringify({
      engine,
      restartPosts: posts(),
      desktopCalls: f.desktopCalls.length,
      passed: true,
    }),
  );
} finally {
  await browser.close();
  await f.close();
}
