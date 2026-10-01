import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const docx = await readFile(new URL("./fixtures/document-pages.docx", import.meta.url));
const pdf = await readFile(new URL("./fixtures/document-pages.pdf", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "docx-browser-"));
const socket =
  process.platform === "win32" ? "\\\\.\\pipe\\docx-" + randomUUID() : join(dir, "worker.sock");
const oldSocket = process.env.HUB_DOCUMENT_SOCKET;
process.env.HUB_DOCUMENT_SOCKET = socket;
let requests = 0;
const worker = createServer(async (req, res) => {
  requests++;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  assert.deepEqual(Buffer.concat(chunks), docx);
  res.end(pdf);
});
worker.listen(socket);
await once(worker, "listening");
await mkdir(".local/qa-docx", { recursive: true });
try {
  await build({
    configFile: false,
    root: resolve("apps/web"),
    plugins: [react()],
    logLevel: "error",
    build: {
      target: "esnext",
      outDir: dir,
      emptyOutDir: true,
      rolldownOptions: { input: resolve("apps/web/tests/fixtures/file-popup.html") },
    },
  });
  console.log('DOCX browser fixture built');
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const origin = "http://127.0.0.1:18849",
      f = await handoffFixture(origin, dir),
      browser = await type.launch();
    console.log(engine+' fixture started');
    try {
      await f.app.listen({ host: "127.0.0.1", port: 18849 });
      const thread = f.store.createThread("project", randomUUID(), "Document fixture");
      const a = await f.sessions.attachments.put(thread.id, "pages.docx", docx);
      for (const [layout, viewport] of [
        ["phone", { width: 390, height: 844 }],
        ["tablet", { width: 1366, height: 1024 }],
      ]) {
        const context = await browser.newContext({
          viewport,
          hasTouch: true,
          serviceWorkers: "block",
        });
        const [name, value] = f.headers.cookie.split("=");
        await context.addCookies([{ name, value, url: origin }]);
        await context.addInitScript(() => {
          window.shares = [];
          Object.defineProperty(navigator, "canShare", { value: () => true });
          Object.defineProperty(navigator, "share", {
            value: async ({ files }) =>
              window.shares.push(Array.from(new Uint8Array(await files[0].arrayBuffer()))),
          });
        });
        const page = await context.newPage();
        console.log(engine+' '+layout+' opening');
        const previousRequests = requests;
        await page.goto(
          origin +
            "/tests/fixtures/file-popup.html?" +
            new URLSearchParams({ file: "/api/attachments/" + a.id, name: "pages.docx" }),
        );
        await page.getByRole("textbox", { name: "Draft" }).fill("Retain document context");
        await page.getByRole("button", { name: "Открыть файл" }).tap();
        await expect(page.getByRole("img", { name: "PDF, страница 1" })).toBeVisible({
          timeout: 20000,
        });
        assert.equal(requests, previousRequests + 1);
        const before = await page.locator("canvas").boundingBox();
        await page.getByRole("combobox", { name: "Масштаб PDF" }).selectOption("200");
        await expect
          .poll(async () => (await page.locator("canvas").boundingBox())?.width || 0)
          .toBeGreaterThan(before.width * 1.9);
        await page.getByRole("button", { name: "Следующая страница PDF" }).tap();
        await expect(page.getByRole("img", { name: "PDF, страница 2" })).toBeVisible();
        for (let n = 3; n <= 7; n++)
          await page.getByRole("button", { name: "Следующая страница PDF" }).tap();
        await expect(page.getByRole("img", { name: "PDF, страница 7" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Следующая страница PDF" })).toBeDisabled();
        await page.getByRole("combobox", { name: "Масштаб PDF" }).selectOption("100");
        await expect(page.getByRole("img", { name: "PDF, страница 7" })).toBeVisible();
        await expect(page.locator('.file-pdf > [role="status"]')).toHaveCount(0);
        await page.screenshot({ path: ".local/qa-docx/" + engine + "-" + layout + ".png" });
        await page.getByRole("button", { name: "Сохранить / поделиться" }).tap();
        await expect.poll(() => page.evaluate(() => window.shares.length)).toBe(1);
        assert.deepEqual(await page.evaluate(() => window.shares[0]), [...docx]);
        await page.getByRole("button", { name: "Закрыть просмотр" }).tap();
        await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue(
          "Retain document context",
        );
        await context.close();
      }
      console.log(
        engine + ": fixed seven-page DOCX, zoom, paging, unchanged original and draft passed",
      );
    } finally {
      await browser.close();
      await f.close();
    }
  }
} finally {
  worker.closeAllConnections();
  await new Promise((r) => worker.close(r));
  if (oldSocket === undefined) delete process.env.HUB_DOCUMENT_SOCKET;
  else process.env.HUB_DOCUMENT_SOCKET = oldSocket;
  await rm(dir, { recursive: true, force: true });
}
