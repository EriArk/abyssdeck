import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "abyssdeck-stream-download-"));
const path = "/api/artifacts/12345678-1234-1234-1234-123456789abc";
const bytes = Buffer.alloc(38 * 1024 * 1024, 71);
let gets = 0,
  heads = 0,
  signedIn = true,
  denied = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture");
  const json = (value) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(value));
  };
  if (["/", "/download"].includes(url.pathname)) {
    res.setHeader("content-type", "text/html");
    return res.end(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>',
    );
  }
  if (url.pathname === "/fixture.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(await readFile(join(dir, "fixture.js")));
  }
  if (url.pathname === "/api/auth/status") return json({ team: false });
  if (url.pathname === "/api/auth/login") signedIn = true;
  if (["/api/auth/login", "/api/auth/session"].includes(url.pathname)) {
    if (!signedIn) {
      res.statusCode = 401;
      return json({ error: { code: "LOGIN_REQUIRED", message: "Sign in" } });
    }
    return json({ authenticated: true, csrf: "fixture", expires: Date.now() + 60000 });
  }
  if (url.pathname === path) {
    if (denied) {
      res.statusCode = 403;
      return res.end();
    }
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("content-length", bytes.length);
    res.setHeader("content-disposition", 'attachment; filename="archive.zip"');
    if (req.method === "HEAD") {
      heads++;
      return res.end();
    }
    gets++;
    return res.end(bytes);
  }
  res.statusCode = 404;
  res.end();
});
try {
  await build({
    configFile: false,
    root: resolve("apps/web"),
    plugins: [react()],
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: dir,
      emptyOutDir: true,
      lib: {
        entry: resolve("apps/web/tests/fixtures/browser-download.tsx"),
        name: "Fixture",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        hasTouch: true,
        acceptDownloads: true,
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "standalone", { value: true });
        Object.defineProperty(navigator, "share", { value: async () => {} });
        Object.defineProperty(navigator, "canShare", { value: () => true });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin);
      await page.getByRole("button", { name: "Save archive" }).click();
      const handoff = page.getByRole("link", { name: "Скачать через браузер" });
      await expect(handoff).toBeVisible();
      assert.equal(await handoff.getAttribute("download"), null);
      assert.match(await handoff.getAttribute("href"), /^\/download\?/);
      const before = gets;
      const popupPromise = context.waitForEvent("page");
      await handoff.click();
      const popup = await popupPromise;
      const downloadLink = popup.getByRole("link", { name: "Скачать файл", exact: true });
      await expect(downloadLink).toBeVisible();
      assert.equal(gets, before, "handoff must not buffer the file");
      assert.equal(await downloadLink.getAttribute("href"), path);
      const downloadPromise = popup.waitForEvent("download");
      await downloadLink.click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), "archive.zip");
      assert.deepEqual(await readFile(await download.path()), bytes);
      await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("Keep this draft");
      // Safari may use a separate cookie jar: sign-in must return to the exact download.
      signedIn = false;
      await popup.reload();
      await expect(popup.locator('input[type="password"]')).toBeVisible();
      await popup.locator('input[type="password"]').fill("fixture-only");
      await popup.locator('button[type="submit"]').click();
      await expect(downloadLink).toBeVisible();
      assert.match(popup.url(), /source=/);
      denied = true;
      await popup.reload();
      await expect(popup.getByRole("alert")).toContainText("недоступен");
      await expect(downloadLink).toHaveCount(0);
      denied = false;
      const headBefore = heads;
      await popup.goto(
        origin +
          "/download?source=" +
          encodeURIComponent(
            "https://example.invalid/api/artifacts/12345678-1234-1234-1234-123456789abc",
          ),
      );
      await expect(popup.getByRole("alert")).toBeVisible();
      assert.equal(heads, headBefore);
      await popup.goto(origin + "/download?source=http%3A%2F%2F%5B");
      await expect(popup.getByRole("alert")).toBeVisible();
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        name +
          ": PWA handoff, exact 38 MiB download, retained draft, sign-in return and error states passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
