import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
  denied = false,
  paused = false;
const server = createServer(async (req, res) => {
  // Match production's script/worker policy: blob/data workers are not permitted.
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'",
  );
  const url = new URL(req.url, "http://fixture");
  const json = (value) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(value));
  };
  if (["/", "/download"].includes(url.pathname)) {
    res.setHeader("content-type", "text/html");
    return res.end(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
    );
  }
  if (url.pathname === "/fixture.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(await readFile(join(dir, "fixture.js")));
  }
  if (/^\/assets\/[a-zA-Z0-9_.-]+\.js$/.test(url.pathname)) {
    res.setHeader("content-type", "text/javascript");
    return res.end(await readFile(join(dir, url.pathname.slice(1))));
  }
  if (url.pathname === "/fixture.css") {
    res.setHeader("content-type", "text/css");
    return res.end(await readFile(join(dir, "fixture.css")));
  }
  if (/^\/fonts\/[a-zA-Z0-9._-]+\.woff2$/.test(url.pathname)) {
    res.setHeader("content-type", "font/woff2");
    return res.end(await readFile(resolve("apps/web/public" + url.pathname)));
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
    if (paused) {
      res.write(bytes.subarray(0, 1024));
      return; // Closing preparation must abort this still-open response.
    }
    return res.end(bytes);
  }
  res.statusCode = 404;
  res.end();
});
try {
  await mkdir(".local/qa-downloads", { recursive: true });
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
        cssFileName: "fixture",
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
        window.shares = [];
        Object.defineProperty(navigator, "share", {
          value: async ({ files }) => {
            const file = files[0];
            const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
            window.shares.push({
              name: file.name,
              size: file.size,
              hash: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
                "",
              ),
            });
            throw new DOMException("Cancelled", "AbortError");
          },
        });
        Object.defineProperty(navigator, "canShare", {
          value: () => window.shareSupported !== false,
        });
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text) => {
              window.copiedLink = text;
            },
          },
        });
        window.policyViolations = [];
        document.addEventListener("securitypolicyviolation", (event) =>
          window.policyViolations.push({
            directive: event.effectiveDirective,
            blocked: event.blockedURI,
          }),
        );
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin);
      const diskAvailable = await page.evaluate(
        () => typeof navigator.storage?.getDirectory === "function",
      );
      const saveLabel = diskAvailable ? "Сохранить / поделиться" : "Копировать ссылку для Safari";
      const before = gets;
      await page.getByRole("button", { name: "Save archive" }).click();
      const save = page.getByRole("button", { name: saveLabel });
      await expect(save).toBeVisible({ timeout: 30000 });
      assert.equal(context.pages().length, 1, "no handoff or binary navigation");
      assert.equal(page.url(), origin + "/");
      assert.equal(
        gets - before,
        diskAvailable ? 1 : 0,
        "one streaming GET; headers-only fallback without disk storage",
      );
      if (diskAvailable) {
        await save.click();
        await expect.poll(() => page.evaluate(() => window.shares.length)).toBe(1);
        assert.deepEqual(await page.evaluate(() => window.shares[0]), {
          name: "archive.zip",
          size: bytes.length,
          hash: createHash("sha256").update(bytes).digest("hex"),
        });
        await expect(save).toBeEnabled();
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Закрыть сохранение" }).click();
      await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("Keep this draft");
      if (diskAvailable)
        await expect
          .poll(() =>
            page.evaluate(async () => {
              const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(
                "abyssdeck-save-temporary",
              );
              let count = 0;
              for await (const _entry of directory.values()) count++;
              return count;
            }),
          )
          .toBe(0);
      await page.getByRole("button", { name: "Open preview" }).click();
      const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
      const previewSave = viewer.getByRole("button", { name: "Скачать", exact: true });
      await expect(previewSave).toBeInViewport();
      await expect(previewSave).toHaveText("Скачать");
      await page.screenshot({ path: `.local/qa-downloads/${name}-preview-download.png` });
      await previewSave.click();
      await expect(save).toBeVisible({ timeout: 30000 });
      await page.screenshot({ path: `.local/qa-downloads/${name}-in-place-save.png` });
      await page.getByRole("button", { name: "Закрыть сохранение" }).click();
      await expect(viewer).toBeVisible();
      await expect(previewSave).toBeFocused();
      await viewer.getByRole("button", { name: "Закрыть просмотр" }).click();
      await page.getByRole("button", { name: "Save local draft" }).click();
      const localShare = page.getByRole("button", { name: "Сохранить / поделиться" });
      await localShare.click();
      await expect.poll(() => page.evaluate(() => window.shares.at(-1)?.name)).toBe("draft.md");
      assert.equal(
        (await page.evaluate(() => window.shares.at(-1))).hash,
        createHash("sha256").update("# Exact local draft\n").digest("hex"),
      );
      await page.getByRole("button", { name: "Закрыть сохранение" }).click();
      await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("Keep this draft");
      assert.equal(page.url(), origin + "/");
      assert.equal(context.pages().length, 1);
      if (diskAvailable) {
        paused = true;
        const beforeCancel = gets;
        await page.getByRole("button", { name: "Save archive" }).click();
        await expect.poll(() => gets).toBe(beforeCancel + 1);
        await page.getByRole("button", { name: "Закрыть сохранение" }).click();
        await expect
          .poll(() =>
            page.evaluate(async () => {
              const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(
                "abyssdeck-save-temporary",
              );
              let count = 0;
              for await (const _entry of directory.values()) count++;
              return count;
            }),
          )
          .toBe(0);
        paused = false;
      }
      // Previously shared links have the same save flow and an explicit return.
      await page.evaluate(() => {
        window.shareSupported = false;
      });
      await page.getByRole("button", { name: "Save archive" }).click();
      await page.getByRole("button", { name: "Копировать ссылку для Safari" }).click();
      const copied = await page.evaluate(() => window.copiedLink);
      assert.equal(new URL(copied).pathname, "/download");
      assert.equal(new URL(copied).searchParams.get("source"), path);
      await page.getByRole("button", { name: "Закрыть сохранение" }).click();
      await page.evaluate(() => {
        window.shareSupported = true;
      });
      const popup = await context.newPage();
      await popup.goto(copied);
      const downloadLink = popup.getByRole("button", { name: saveLabel });
      await expect(downloadLink).toBeVisible({ timeout: 30000 });
      await popup.getByRole("button", { name: "Закрыть сохранение" }).click();
      await expect(popup.getByRole("link", { name: "Вернуться в AbyssDeck" })).toBeVisible();
      signedIn = false;
      await popup.reload();
      await expect(popup.locator('input[type="password"]')).toBeVisible();
      await popup.locator('input[type="password"]').fill("fixture-only");
      await popup.locator('button[type="submit"]').click();
      await expect(downloadLink).toBeVisible({ timeout: 30000 });
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
      assert.deepEqual(
        await page.evaluate(() =>
          window.policyViolations.filter((event) => event.directive === "worker-src"),
        ),
        [],
      );
      await context.close();
      console.log(
        name +
          (diskAvailable
            ? ": OPFS exact 38 MiB save/share cancel/cleanup"
            : ": this WebKit port has no OPFS; safe unsupported-storage fallback") +
          ", no navigation, legacy return/login and errors passed",
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
