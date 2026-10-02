import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium, expect, webkit } from "@playwright/test";
import { createServer } from "../apps/web/node_modules/vite/dist/node/index.js";

const require = createRequire(new URL("../apps/hub/package.json", import.meta.url)),
  sharp = require("sharp");
// Test bytes, not the owner's private screenshot. Non-interlaced PNG exposes partial rows in a raw img.
const raw = Buffer.alloc(640 * 480 * 3);
for (let i = 0; i < raw.length; i++) raw[i] = (i * 13 + Math.floor(i / 191)) % 256;
const png = await sharp(raw, { raw: { width: 640, height: 480, channels: 3 } })
  .png()
  .toBuffer();
let responses = [],
  requests = [];
const server = await createServer({
  root: "apps/web",
  server: { host: "127.0.0.1", port: 18971 },
  logLevel: "error",
  plugins: [
    {
      name: "split-image-response",
      configureServer(s) {
        s.middlewares.use((req, res, next) => {
          if (!req.url.startsWith("/api/")) return next();
          requests.push(req.url);
          res.writeHead(200, {
            "content-type": "image/png",
            "content-length": png.length,
            "cache-control": "no-store",
          });
          res.write(png.subarray(0, Math.floor(png.length / 3)));
          responses.push(() => res.end(png.subarray(Math.floor(png.length / 3))));
        });
      },
    },
  ],
});
await server.listen();
try {
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    requests = [];
    responses = [];
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });
      await page.goto("http://127.0.0.1:18971/tests/fixtures/image-stream.html", {
        waitUntil: "domcontentloaded",
      });
      const native = page.locator('img[alt="Снимок"]'),
        gpt = page.locator('img[alt="Снимок GPT"]');
      await expect.poll(() => requests.length).toBe(2);
      for (const img of [native, gpt]) {
        await expect(img).toHaveAttribute("data-image-state", "loading");
        await expect(img).toHaveCSS("visibility", "hidden");
        assert.equal(await img.evaluate((i) => i.complete), false);
      }
      await expect(native).toHaveAttribute("fetchpriority", "high");
      await expect(native).toHaveAttribute("loading", "eager");
      await native.evaluate((i) => {
        window.originalImage = i;
      });
      await page.getByRole("button", { name: "Обновить историю" }).click();
      await expect(page.locator(".message-body")).toContainText("Ответ 1");
      assert.equal(
        await native.evaluate((i) => i === window.originalImage),
        true,
        "history keeps the in-flight image node/request",
      );
      assert.equal(requests.length, 2);
      assert(!requests.some((r) => r.includes("offscreen")));
      for (const finish of responses.splice(0)) finish();
      for (const img of [native, gpt]) {
        await expect(img).toHaveAttribute("data-image-state", "ready");
        await expect(img).toBeVisible();
        assert.equal(
          await img.evaluate(
            (i) => i.complete && i.naturalWidth === 640 && i.naturalHeight === 480,
          ),
          true,
        );
      }
      assert.equal(requests.length, 2, "decode does not fetch again");
      console.log(
        `${engine}: chunked PNG stays hidden until complete decode, visible slide priority, stable history request and offscreen gating passed`,
      );
    } finally {
      for (const finish of responses.splice(0)) finish();
      await browser.close();
    }
  }
} finally {
  await server.close();
}
