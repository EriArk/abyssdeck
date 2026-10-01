import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "queue-attention-"));
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
        entry: resolve("apps/web/tests/fixtures/queue-attention.tsx"),
        name: "Fixture",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  const js = await readFile(join(dir, "fixture.js"), "utf8"),
    css = (
      await Promise.all(
        (
          await readdir(dir)
        )
          .filter((f) => f.endsWith(".css"))
          .map((f) => readFile(join(dir, f), "utf8")),
      )
    ).join("\n");
  await mkdir(".local/qa-queue-attention", { recursive: true });
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      let seen = false,
        items = [],
        adds = 0;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://continuity.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname,
          method = route.request().method();
        if (path === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><html data-theme="classic-dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
          });
        if (path === "/fixture.js")
          return route.fulfill({ contentType: "text/javascript", body: js });
        if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
        if (path.startsWith("/fonts/"))
          return route.fulfill({
            body: await readFile(resolve("apps/web/public" + path)),
            contentType: "font/woff2",
          });
        if (path === "/api/gpt/attention")
          return route.fulfill({
            json: { items: seen ? [] : [{ conversationId: "chat", completedId: "final" }] },
          });
        if (path === "/api/gpt/conversations/chat/seen") {
          assert.equal(route.request().postDataJSON().completedId, "final");
          seen = true;
          return route.fulfill({ json: { ok: true } });
        }
        if (path === "/api/threads/thread/queue") {
          if (method === "POST") {
            adds++;
            items = [
              {
                id: "item",
                text: route.request().postDataJSON().text,
                revision: "r",
                state: "queued",
                attachments: [],
                otherInputs: 0,
              },
            ];
            return route.fulfill({ json: items[0] });
          }
          return route.fulfill({ json: { available: true, canSteer: false, items } });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto("https://continuity.test/");
      await expect(page.locator(".activity-badge.is-unread")).toHaveCount(1);
      assert.equal(seen, false, "navigation alone does not mark a hidden answer read");
      await page.getByRole("button", { name: "Отправить в очередь", exact: true }).click();
      await expect(page.locator(".queue-text")).toHaveText("Второе сообщение");
      items = [{ ...items[0], state: "accepted" }];
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent("codex-queue-changed", { detail: "thread" })),
      );
      await expect(page.locator(".message-queue")).toContainText("Принято Codex");
      await page.reload();
      await expect(page.locator(".queue-text")).toHaveText("Второе сообщение");
      assert.equal(adds, 1, "reopening never posts again");
      await page.screenshot({
        path: `.local/qa-queue-attention/${name}-phone.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1366, height: 1024 });
      await page.screenshot({
        path: `.local/qa-queue-attention/${name}-tablet.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Чат с готовым ответом" }).click();
      await expect.poll(() => seen).toBe(true);
      await expect(page.locator(".activity-badge.is-unread")).toHaveCount(0);
      items = [];
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent("codex-queue-changed", { detail: "thread" })),
      );
      await expect(page.locator(".queue-text")).toHaveCount(0);
      assert.deepEqual(errors, []);
      console.log(
        name + ": queued acceptance survives reopen, completion lamp clears only after reading",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
