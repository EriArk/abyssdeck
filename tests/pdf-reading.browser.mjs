import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const { PDFDocument, StandardFonts, degrees, PDFName } = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
)("pdf-lib");
const dir = await mkdtemp(join(tmpdir(), "pdf-reading-"));
await mkdir(".local/qa-pdf-reading", { recursive: true });
const doc = await PDFDocument.create(),
  font = await doc.embedFont(StandardFonts.Helvetica);
for (let n = 0; n < 36; n++) {
  const p = doc.addPage([400, 300]);
  p.setCropBox(20, 30, 340, 240);
  if (n < 4) {
    p.setRotation(degrees(n * 90));
    if (n === 1) p.node.set(PDFName.of("UserUnit"), doc.context.obj(2));
    p.drawText("Original searchable text", { font, x: 40, y: 180, size: 18 });
    p.drawText("Across", { font, x: 40, y: 135, size: 18 });
    p.drawText("lines [test].", { font, x: 40, y: 110, size: 18 });
  }
}
const pdf = Buffer.from(await doc.save());
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
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (process.env.BROWSER && process.env.BROWSER !== engine) continue;
    const origin = "http://127.0.0.1:18898",
      f = await handoffFixture(origin, dir),
      browser = await type.launch();
    try {
      await f.app.listen({ host: "127.0.0.1", port: 18898 });
      const thread = f.store.createThread("project", randomUUID(), "Documents"),
        files = {};
      for (const [name, bytes] of [["document.pdf", pdf]]) {
        const a = await f.sessions.attachments.put(thread.id, name, bytes);
        files[name] = "/api/attachments/" + a.id;
      }
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        serviceWorkers: "block",
      });
      const [name, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin }]);
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const open = async (name) => {
        await page.goto(
          origin +
            "/tests/fixtures/file-popup.html?" +
            new URLSearchParams({ file: files[name], name }),
        );
        await page.getByRole("button", { name: "Открыть файл", exact: true }).click();
      };
      const button = (name) => page.getByRole("button", { name, exact: true });
      const download = async () => {
        const next = page.waitForEvent("download");
        await page.getByRole("link", { name: "Скачать копию", exact: true }).click();
        return readFile(await (await next).path());
      };
      const screenshots = async (kind) => {
        for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
          await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
          for (const width of [1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 650 : 768 });
            const dialog = page.locator(".file-viewer-dialog");
            await expect
              .poll(() => dialog.evaluate((el) => el.getBoundingClientRect().right))
              .toBeLessThanOrEqual(width + 1);
            await expect(button("Закрыть просмотр")).toBeVisible();
            await page.screenshot({
              path: `.local/qa-pdf-reading/${engine}-${kind}-${theme}-${width}.png`,
            });
          }
        }
        await page.setViewportSize({ width: 1024, height: 768 });
      };
      await open("document.pdf");
      const text = page.locator(".pdf-text-layer");
      await expect(text).toContainText("Original searchable text");
      // Real pointer selection on the PDF.js text, not programmatic selection.
      const line = text.locator("span").filter({ hasText: "Original searchable text" });
      const box = await line.boundingBox();
      await page.mouse.move(box.x + 1, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(() => page.evaluate(() => getSelection().toString()))
        .toContain("searchable");
      // Markup remains mounted through search, page changes and thumbnail disclosure.
      await button("Разметить PDF").click();
      const markup = page.locator(".pdf-markup-layer");
      const paper = await markup.boundingBox();
      await page.mouse.move(paper.x + 35, paper.y + 35);
      await page.mouse.down();
      await page.mouse.move(paper.x + 100, paper.y + 35);
      await page.mouse.up();
      await expect(markup.locator("path")).toHaveCount(1);
      await button("Просмотр PDF").click();
      await button("Поиск в PDF").click();
      const input = page.getByLabel("Найти текст в PDF");
      await input.fill("SEARCHABLE");
      await expect(page.locator(".pdf-search-results")).toContainText("1 / 4");
      for (let n = 1; n <= 4; n++) {
        await expect(
          page.getByRole("img", { name: `PDF, страница ${n}`, exact: true }),
        ).toBeVisible();
        await expect(text.locator('mark[data-current="true"]')).toHaveText("searchable");
        // Bounding box overlaps actual ink, including CropBox, rotation and UserUnit.
        const ink = await page.evaluate(() => {
          const mark = document
            .querySelector('.pdf-text-layer mark[data-current="true"]')
            .getBoundingClientRect();
          const c = document.querySelector(".pdf-sheet-stage canvas"),
            box = c.getBoundingClientRect();
          const x = Math.max(0, Math.floor(((mark.left - box.left) * c.width) / box.width));
          const y = Math.max(0, Math.floor(((mark.top - box.top) * c.height) / box.height));
          const w = Math.min(c.width - x, Math.ceil((mark.width * c.width) / box.width));
          const h = Math.min(c.height - y, Math.ceil((mark.height * c.height) / box.height));
          if (w <= 0 || h <= 0) return 0;
          const pixels = c.getContext("2d").getImageData(x, y, w, h).data;
          let dark = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100) dark++;
          return dark;
        });
        assert.ok(ink > 100, `${engine} rotation ${n} selection missed ink: ${ink}`);
        await button("Следующее совпадение PDF").click();
      }
      await expect(markup.locator("path")).toHaveCount(1);
      await input.fill("Across lines");
      await expect(page.locator(".pdf-search-results")).toContainText("1 / 4");
      await expect(text.locator("mark")).toHaveCount(2);
      await input.fill("[test].");
      await expect(page.locator(".pdf-search-results")).toContainText("1 / 4");
      await expect(text.locator("mark")).toHaveText("[test].");
      await input.fill("not in this document");
      await expect(page.locator(".pdf-search-results")).toContainText("0 / 0");
      await input.fill("text");
      await input.fill("original");
      await expect(page.locator(".pdf-search-results")).toContainText("1 / 4");
      await expect(text.locator("mark")).toHaveText("Original");
      await button("Миниатюры PDF").click();
      const strip = page.getByRole("region", { name: "Миниатюры страниц PDF" });
      await expect(strip).toBeVisible();
      assert.ok((await strip.locator("canvas").count()) < 16);
      await button("Страница PDF 2").click();
      await expect(text).toContainText("Original");
      await page.getByLabel("Масштаб PDF").selectOption("200");
      await expect(text).toContainText("Original");
      await screenshots("search-thumbnails");
      // Returning from narrow to wide keeps page, scale, search, source and markings.
      await expect(page.getByLabel("Масштаб PDF")).toHaveValue("200");
      await expect(page.getByRole("img", { name: "PDF, страница 2", exact: true })).toBeVisible();
      await page.getByLabel("Масштаб PDF").selectOption("100");
      await input.fill("searchable");
      await expect(page.locator(".pdf-search-results")).toContainText("1 / 4");
      await expect(text.locator('mark[data-current="true"]')).toHaveText("searchable");
      await screenshots("reading");
      await page.setViewportSize({ width: 390, height: 420 });
      await expect
        .poll(() => page.locator(".pdf-sheet-scroll").evaluate((el) => el.clientHeight))
        .toBeGreaterThanOrEqual(96);
      await page.screenshot({ path: `.local/qa-pdf-reading/${engine}-keyboard.png` });
      await expect(button("Закрыть просмотр")).toBeVisible();
      await expect(page.getByLabel("Найти текст в PDF")).toBeVisible();
      await page.setViewportSize({ width: 1024, height: 768 });
      await strip.evaluate((el) => (el.scrollLeft = el.scrollWidth));
      await button("Страница PDF 36").click();
      await expect(page.getByRole("img", { name: "PDF, страница 36", exact: true })).toBeVisible();
      await expect(page.locator(".pdf-text-status")).toContainText("нет текстового слоя");
      assert.ok((await strip.locator("canvas").count()) < 16);
      await button("Миниатюры PDF").click();
      await expect(strip).toHaveCount(0);
      await button("Поиск в PDF").click();
      await expect(text.locator("mark")).toHaveCount(0);
      assert.deepEqual(
        await (await context.request.get(origin + files["document.pdf"])).body(),
        pdf,
      );
      await button("Закрыть просмотр").click();
      await button("Оставить черновик").click();
      assert.deepEqual(errors, []);
      console.log(
        engine +
          ": PDF native selection, search across pages/lines/rotations, crop/UserUnit alignment, virtual thumbnails, scan fallback, themes/phone and original bytes passed",
      );
      await context.close();
    } finally {
      await browser.close();
      await f.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
