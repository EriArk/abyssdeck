import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "document-links-"));
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
        entry: resolve("apps/web/tests/fixtures/document-links.tsx"),
        name: "Fixture",
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
        .filter((p) => p.endsWith(".css"))
        .map((p) => readFile(join(dir, p), "utf8")),
    )
  ).join("\n");
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ])
    for (const width of [390, 1024]) {
      const browser = await type.launch();
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.log("PAGEERROR", e.message);
      });
      const refs = [];
      let releaseImages = () => {};
      let imagesReady = Promise.resolve();
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      );
      await page.route("https://fixture.test/**", async (r) => {
        const u = new URL(r.request().url());
        if (u.pathname === "/")
          return r.fulfill({
            contentType: "text/html; charset=utf-8",
            body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
          });
        if (u.pathname === "/fixture.js")
          return r.fulfill({ contentType: "application/javascript; charset=utf-8", body: js });
        if (u.pathname === "/fixture.css")
          return r.fulfill({
            contentType: "text/css; charset=utf-8",
            body: "html,body,#root{height:100%;margin:0}" + css,
          });
        if (u.pathname.endsWith("/links")) {
          const { href } = r.request().postDataJSON();
          refs.push(href);
          await imagesReady;
          return r.fulfill({
            json: {
              url:
                "/api/artifacts/" +
                (href === "wide.png"
                  ? "22222222-2222-4222-8222-222222222222"
                  : "33333333-3333-4333-8333-333333333333"),
              name: href,
              mime: "image/png",
            },
          });
        }
        if (u.pathname.startsWith("/api/artifacts/") || u.pathname.endsWith("/files/content")) {
          await imagesReady;
          return r.fulfill({ contentType: "image/png", body: png });
        }
        return r.fulfill({ json: { available: false, items: [] } });
      });
      await page.goto("https://fixture.test/");
      for (const source of ["Saved", "Working"]) {
        imagesReady = new Promise((resolve) => {
          releaseImages = resolve;
        });
        await page.getByLabel("Source", { exact: true }).selectOption({ label: source });
        await page.getByText("Screenshots", { exact: true }).click();
        const parent = page.locator("dialog").first();
        await expect(parent.locator(".reader-scroll article")).toContainText("Gallery");
        await expect(parent.locator(".reader-scroll article img").first()).toBeVisible({
          timeout: 20000,
        });
        releaseImages();
        await expect
          .poll(() =>
            parent
              .locator(".reader-scroll article img")
              .first()
              .evaluate((i) => i.complete && i.naturalWidth > 0),
          )
          .toBe(true);
        await parent.locator('.reader-scroll article a[data-document-link="wide.png"]').click();
        await expect(page.locator("dialog")).toHaveCount(2);
        const child = page.locator("dialog").last();
        await expect(child.locator(".file-viewer-heading strong")).toHaveText("wide.png");
        await expect(child.locator("img").first()).toBeVisible();
        await child.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
        await expect(page.locator("dialog")).toHaveCount(1);
        await expect(parent.locator(".reader-scroll article")).toContainText("Gallery");
        await parent.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
        await expect(page.locator("dialog")).toHaveCount(0);
        await expect(page.getByLabel("Draft")).toHaveValue("Keep my draft");
      }
      assert.equal(refs.filter((x) => x === "wide.png").length, 1);
      assert.equal(refs.filter((x) => x === "narrow.png").length, 1);
      await page.getByRole("button", { name: "Compact", exact: true }).click();
      await expect(page.locator(".book-reader")).toHaveCount(0);
      await page.getByRole("button", { name: "Wide Home", exact: true }).click();
      await expect(page.locator("dialog")).toHaveCount(2);
      await expect(page.locator("dialog").last().locator(".file-viewer-heading strong")).toHaveText(
        "wide.png",
      );
      await page
        .locator("dialog")
        .last()
        .getByRole("button", { name: "Закрыть просмотр", exact: true })
        .click();
      await expect(page.locator("dialog")).toHaveCount(1);
      await expect(page.locator(".file-document")).toContainText("Gallery");
      await page
        .locator("dialog")
        .getByRole("button", { name: "Закрыть просмотр", exact: true })
        .click();
      await expect(page.locator("dialog")).toHaveCount(0);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ name, width, passed: true }));
      await browser.close();
    }
} finally {
  await rm(dir, { recursive: true, force: true });
}
