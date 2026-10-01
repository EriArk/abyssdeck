import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "gpt-loading-"));
try {
  await build({
    configFile: false,
    root: resolve("apps/web"),
    plugins: [react()],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "error",
    build: {
      outDir: dir,
      emptyOutDir: true,
      lib: {
        entry: resolve("apps/web/tests/fixtures/pinned-navigation.tsx"),
        name: "LoadingFixture",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  const js = await readFile(join(dir, "fixture.js"), "utf8");
  const css = (
    await Promise.all(
      (
        await readdir(dir)
      )
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFile(join(dir, f), "utf8")),
    )
  ).join("\n");
  await mkdir(".local/qa-history-loading", { recursive: true });
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      page.on("pageerror", (error) => console.error(error));
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.addInitScript(() => localStorage.setItem("gpt-conversation", "history-chat"));
      let release,
        reads = 0,
        writes = 0,
        fail = false;
      let modelReads = 0,
        modelFailure = true;
      const modelGate = Promise.withResolvers();
      let hold = new Promise((resolve) => {
        release = resolve;
      });
      const messages = (start) =>
        Array.from({ length: 20 }, (_, i) => ({
          id: `m${start + i}`,
          role: i % 2 ? "assistant" : "user",
          complete: true,
          files: [],
          createdAt: start + i,
          text:
            `Message ${start + i}\n\n**Bookhaus — bookstore.**\n\n` +
            "A readable response. ".repeat(20),
        }));
      await page.route("https://loading.test/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (path === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
          });
        if (path === "/fixture.js")
          return route.fulfill({ contentType: "text/javascript", body: js });
        if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
        if (path.startsWith("/fonts/"))
          return route.fulfill({
            contentType: "font/woff2",
            body: await readFile(resolve("apps/web/public" + path)),
          });
        if (request.method() !== "GET") writes++;
        let data = { items: [], conversations: [], nextOffset: null };
        if (path === "/api/gpt/status")
          data = { configured: true, canSend: true, state: "healthy" };
        if (path === "/api/gpt/models") {
          modelReads++;
          await modelGate.promise;
          if (modelFailure)
            return route.fulfill({
              status: 503,
              json: { error: { code: "GPT_BUSY", message: "Busy" } },
            });
          data = { models: [{ id: "latest", label: "Latest" }], efforts: [] };
        }
        if (path === "/api/gpt/conversations")
          data = {
            items: [{ id: "history-chat", title: "Сбор резюме и поиск работы", updatedAt: 1 }],
            nextOffset: null,
          };
        if (path.endsWith("/messages")) {
          reads++;
          if (url.searchParams.has("cached"))
            data = {
              items: [
                {
                  id: "old-progress",
                  role: "assistant",
                  phase: "commentary",
                  text: "Public progress",
                  files: [],
                  createdAt: 1,
                },
              ],
              revision: "canonical",
              nextBefore: "m20",
            };
          else {
            if (hold) await hold;
            if (fail)
              return route.fulfill({
                status: 503,
                json: { error: { code: "GPT_HISTORY_UNAVAILABLE", message: "offline" } },
              });
            data = {
              items: messages(url.searchParams.has("before") ? 0 : 20),
              revision: "canonical",
              nextBefore: url.searchParams.has("before") ? null : "m20",
              prefix: "p",
            };
            if (!url.searchParams.has("before") && url.searchParams.get("known") === "canonical")
              data = {
                items: [],
                revision: "canonical",
                nextBefore: null,
                notModified: true,
                retainOlder: true,
              };
          }
        }
        return route.fulfill({ json: data });
      });
      await page.goto("https://loading.test/?gpt");
      await expect
        .poll(() => reads)
        .toBeGreaterThanOrEqual(2)
        .catch(async (error) => {
          console.error(await page.locator("body").innerText());
          throw error;
        });
      const indicator = page.getByRole("status", { name: "Загрузка истории GPT", exact: true });
      await expect(indicator).toBeVisible();
      await expect.poll(() => modelReads).toBe(1);
      const modelResponse = page.waitForResponse((r) => r.url().endsWith("/api/gpt/models"));
      modelGate.resolve();
      await modelResponse;
      await page.waitForTimeout(100);
      await page.clock.fastForward(5100);
      await expect.poll(() => modelReads).toBe(2);
      await page.clock.fastForward(5100);
      assert.equal(modelReads, 2, "failed model reads back off beyond five seconds");
      await page.clock.fastForward(5100);
      await expect.poll(() => modelReads).toBe(3);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.clock.fastForward(120000);
      assert.equal(modelReads, 3, "hidden viewers do not retry model reads");
      modelFailure = false;
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("online"));
      });
      await expect.poll(() => modelReads).toBe(4);
      await page.clock.fastForward(12000);
      await expect(indicator).toBeVisible();
      const textarea = page.locator(".gpt-input-row textarea");
      await textarea.fill("Keep my draft");
      for (const [theme, width, height] of [
        ["classic-dark", 390, 844],
        ["crt-green", 390, 600],
        ["organizer", 768, 1024],
        ["hitech-2000s", 1366, 1024],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await expect(indicator).toBeInViewport();
        await page.screenshot({ path: `.local/qa-history-loading/${name}-${theme}.png` });
      }
      hold = undefined;
      release();
      await expect(page.locator(".gpt-message-scroll article.message")).toHaveCount(20);
      await expect(indicator).toHaveCount(0);
      await expect(page.locator(".gpt-message-scroll strong").last()).toHaveText(
        "Bookhaus — bookstore.",
      );
      hold = new Promise((resolve) => {
        release = resolve;
      });
      await page.getByRole("button", { name: "Загрузить ещё 20", exact: true }).click();
      await expect(indicator).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Загружаем сообщения…", exact: true }),
      ).toBeDisabled();
      await page.clock.fastForward(12000);
      await expect(indicator).toBeInViewport();
      hold = undefined;
      release();
      await expect(page.locator(".gpt-message-scroll article.message")).toHaveCount(40);
      await expect(indicator).toHaveCount(0);
      fail = true;
      const beforeFailure = reads;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => reads).toBeGreaterThan(beforeFailure);
      await expect(indicator).toHaveCount(0);
      await expect(textarea).toHaveValue("Keep my draft");
      assert.equal(writes, 0);
      console.log(
        `${name}: persistent cache/canonical and pagination indicator, message rendering, failure completion, draft and no writes`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
