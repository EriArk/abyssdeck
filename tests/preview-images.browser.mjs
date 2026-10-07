import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { bundlePreview } from "../apps/hub/dist/preview-bundle.js";
import { previewImages } from "../apps/hub/dist/preview-images.js";
import { previewCsp, previewMarkup } from "../apps/hub/dist/previews.js";

const dir = await mkdtemp(join(tmpdir(), "gallery-browser-"));
const base = "/api/previews/" + "a".repeat(64),
  reads = [];
const asset = "/api/artifacts/12345678-1234-1234-1234-123456789abc";
const realSource = process.env.PREVIEW_GALLERY_SOURCE;
const originals = new Map();
const assetId = (key) =>
  `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
// A valid 3 MiB SVG demonstrates that the old per-asset ceiling no longer applies.
const picture = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#41666c"/><text x="120" y="180" fill="white" font-size="70">TrainerOS gallery</text><!--' +
    " ".repeat(3 * 1024 ** 2) +
    "--></svg>",
);
const html = await bundlePreview(
  realSource
    ? await readFile(realSource, "utf8")
    : '<h1>Gallery</h1><a href="one.svg" target="_blank"><img style="width:100%" src="one.svg" alt="First"></a><div style="height:3000px"></div><img style="width:100%" src="two.svg" alt="Second">',
  "index.html",
  async () => {
    throw Error("Images must be lazy");
  },
  (path) => {
    if (!realSource) return (path === "one.svg" ? "b" : "c").repeat(64);
    const key = createHash("sha256").update(path).digest("hex");
    originals.set(assetId(key), resolve(dirname(realSource), path));
    return key;
  },
);
let failSecond = true;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://fixture").pathname;
  const json = (value) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(value));
  };
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'",
  );
  if (path === "/") {
    res.setHeader("content-type", "text/html");
    return res.end(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
    );
  }
  if (path === "/fixture.js" || path === "/fixture.css") {
    res.setHeader("content-type", path.endsWith("js") ? "text/javascript" : "text/css");
    return res.end(await readFile(join(dir, path.slice(1))));
  }
  if (path === base + "/ready") return json({ ready: true });
  if (path === base) {
    res.setHeader("content-type", "text/html");
    res.setHeader("content-security-policy", previewCsp);
    return res.end(previewMarkup(html + previewImages));
  }
  if (path.startsWith(base + "/images/")) {
    reads.push(path);
    if (path.endsWith("c".repeat(64)) && failSecond) {
      res.statusCode = 503;
      return json({ error: { message: "Temporary image failure" } });
    }
    return json({ url: realSource ? "/api/artifacts/" + assetId(path.split("/").at(-1)) : asset });
  }
  if (realSource && originals.has(path.split("/").at(-1))) {
    res.setHeader("content-type", "image/png");
    return res.end(await readFile(originals.get(path.split("/").at(-1))));
  }
  if (path === asset) {
    res.setHeader("content-type", "image/svg+xml");
    return res.end(picture);
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
    define: { "process.env.NODE_ENV": '"production"' },
    build: {
      outDir: dir,
      emptyOutDir: true,
      lib: {
        entry: resolve("apps/web/tests/fixtures/preview-images.tsx"),
        name: "Fixture",
        formats: ["iife"],
        fileName: () => "fixture.js",
        cssFileName: "fixture",
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  await mkdir(".local/qa-gallery", { recursive: true });
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      reads.length = 0;
      failSecond = true;
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const frame = page.frameLocator("iframe");
      if (realSource) {
        const images = frame.locator("img[data-abyss-image]");
        await expect(images).toHaveCount(41);
        for (let i = 0; i < 41; i++) {
          await images.nth(i).scrollIntoViewIfNeeded();
          await expect.poll(() => images.nth(i).evaluate((img) => img.naturalWidth)).toBe(1920);
        }
        await images.first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `.local/qa-gallery/${name}-real-phone.png` });
        await images.first().click();
        await expect(frame.getByRole("dialog")).toBeVisible();
        await frame.getByRole("button", { name: "Close image" }).click();
        await page.setViewportSize({ width: 1366, height: 1000 });
        await page.screenshot({ path: `.local/qa-gallery/${name}-real-desktop.png` });
        await page.locator(".viewer-toolbar .icon-button").click();
        await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("Retained draft");
        console.log(name + ": all 41 actual gallery images, original viewer and return passed");
        continue;
      }
      await expect
        .poll(() => frame.getByAltText("First").evaluate((img) => img.naturalWidth))
        .toBe(1920);
      assert.equal(reads.length, 1);
      await frame.getByAltText("First").click();
      await expect(frame.getByRole("dialog")).toBeVisible();
      await expect
        .poll(() =>
          frame
            .getByRole("dialog")
            .locator("img")
            .evaluate((img) => img.naturalWidth),
        )
        .toBe(1920);
      await frame.getByRole("button", { name: "Close image" }).click();
      assert.equal(reads.length, 1); // original and thumbnail share the same bytes
      await page.screenshot({ path: `.local/qa-gallery/${name}-phone.png` });
      await frame.getByAltText("Second").scrollIntoViewIfNeeded();
      await expect(frame.getByRole("button", { name: /Temporary image failure/ })).toBeVisible();
      failSecond = false;
      await frame.getByRole("button", { name: /Retry/ }).click();
      await expect
        .poll(() => frame.getByAltText("Second").evaluate((img) => img.naturalWidth))
        .toBe(1920);
      await page.locator(".viewer-toolbar .icon-button").click();
      await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("Retained draft");
      assert.equal(page.url(), `http://127.0.0.1:${server.address().port}/`);
      console.log(
        name + ": lazy large images, nested original/return, retry and retained parent passed",
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
