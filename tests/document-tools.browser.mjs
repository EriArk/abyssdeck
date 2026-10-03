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
const dir = await mkdtemp(join(tmpdir(), "document-tools-"));
await mkdir(".local/qa-document-tools", { recursive: true });
const doc = await PDFDocument.create(),
  font = await doc.embedFont(StandardFonts.Helvetica);
for (const rotation of [0, 90]) {
  const p = doc.addPage([400, 300]);
  p.setCropBox(20, 30, 340, 240);
  p.setRotation(degrees(rotation));
  p.drawText("Original searchable text", { font, x: 40, y: 180, size: 18 });
}
const pdf = Buffer.from(await doc.save());
const csv = Buffer.from(
  '\ufeffname;id;note\r\n"Лазарь";900719925474099312345;"first\r\nsecond"\r\nHidden;0002;"a""b"\r\n',
);
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
    const origin = "http://127.0.0.1:18892",
      f = await handoffFixture(origin, dir),
      browser = await type.launch();
    try {
      await f.app.listen({ host: "127.0.0.1", port: 18892 });
      const thread = f.store.createThread("project", randomUUID(), "Documents"),
        files = {};
      for (const [name, bytes] of [
        ["document.pdf", pdf],
        ["table.csv", csv],
      ]) {
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
              path: `.local/qa-document-tools/${engine}-${kind}-${theme}-${width}.png`,
            });
          }
        }
        await page.setViewportSize({ width: 1024, height: 768 });
      };
      await open("table.csv");
      await expect(page.getByRole("table")).toContainText("900719925474099312345");
      await button("Редактировать").click();
      const editor = page.locator(".file-editor-embedded"),
        table = editor.locator(".delimited-table");
      await expect(table).toBeVisible();
      await table.getByLabel("Фильтр строк").fill("Лазарь");
      await table.getByRole("button", { name: "Строка 2, столбец 1", exact: true }).click();
      await table.getByLabel("Значение ячейки").fill("Лазарь; новый");
      await button("Закончить правку ячейки").click();
      await expect(table).not.toContainText("Hidden");
      await button("Исходный CSV/TSV").click();
      await expect(editor.locator(".cm-content")).toContainText("Hidden;0002;");
      await button("Отменить изменение").click();
      await expect(editor.locator(".cm-content")).not.toContainText("новый");
      await button("Повторить изменение").click();
      await button("Табличная правка").click();
      await screenshots("csv");
      await table.getByRole("button", { name: "Строка 2, столбец 1", exact: true }).click();
      await page.setViewportSize({ width: 390, height: 400 });
      await table.getByLabel("Значение ячейки").click();
      await page.screenshot({ path: `.local/qa-document-tools/${engine}-csv-keyboard.png` });
      await button("Закончить правку ячейки").click();
      await page.setViewportSize({ width: 1024, height: 768 });
      await button("Сохранить как…").click();
      assert.deepEqual(
        await download(),
        Buffer.from(csv.toString().replace('"Лазарь"', '"Лазарь; новый"')),
      );
      await button("Закрыть сохранение копии").click();
      await open("table.csv");
      await button("Редактировать").click();
      await expect(table).toContainText("Лазарь; новый");
      assert.deepEqual(await (await context.request.get(origin + files["table.csv"])).body(), csv);
      await open("document.pdf");
      const surface = page.locator(".pdf-markup-layer");
      await expect(surface).toBeVisible();
      await button("Разметить PDF").click();
      const positions = [],
        originalMasks = [];
      const draw = async () => {
        await surface.scrollIntoViewIfNeeded();
        const box = await surface.boundingBox();
        originalMasks.push(
          await page.locator(".pdf-sheet-stage canvas").evaluate((c) => {
            const p = c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
              result = [];
            for (let i = 0; i < p.length; i += 4)
              if (p[i] > 220 && p[i + 1] > 150 && p[i + 2] > 100 && p[i + 2] < 210) result.push(i);
            return result;
          }),
        );

        await page.mouse.move(box.x + 50, box.y + 80);
        await page.mouse.down();
        await page.mouse.move(box.x + 170, box.y + 80, { steps: 8 });
        await page.mouse.up();
        positions.push(
          await surface
            .locator("path")
            .last()
            .evaluate((el) => {
              const box = el.getBBox(),
                vb = el.ownerSVGElement.viewBox.baseVal;
              return {
                x: (box.x + box.width / 2) / vb.width,
                y: (box.y + box.height / 2) / vb.height,
              };
            }),
        );
      };
      await draw();
      await expect(surface.locator("path")).toHaveCount(1);
      await button("Отменить разметку PDF").click();
      await expect(surface.locator("path")).toHaveCount(0);
      await button("Повторить разметку PDF").click();
      await button("Следующая страница PDF").click();
      await expect(page.getByRole("img", { name: "PDF, страница 2", exact: true })).toBeVisible();
      await page.getByLabel("Масштаб PDF").selectOption("125");
      await expect(surface).toBeVisible();
      await draw();
      await button("Комментарий PDF").click();
      await page.getByLabel("Текст комментария PDF").fill("Проверить 🙂\nстроку");
      const box = await surface.boundingBox();
      await page.mouse.click(box.x + 90, box.y + 120);
      await expect(surface.locator("rect")).toHaveCount(1);
      await button("Перо PDF").click();
      await button("Предыдущая страница PDF").click();
      await page.getByLabel("Масштаб PDF").selectOption("100");
      await screenshots("pdf-markup");
      await button("Просмотр PDF").click();
      await screenshots("pdf");
      await button("Закрыть просмотр").click();
      await button("Оставить черновик").click();
      await button("Открыть файл").click();
      await expect(surface.locator("path")).toHaveCount(1);
      await button("Следующая страница PDF").click();
      await expect(surface.locator("rect")).toHaveCount(1);
      await button("Сохранить копию PDF").click();
      const exported = await download();

      const saved = await PDFDocument.load(exported);
      assert.equal(saved.getPageCount(), 2);
      assert.equal(saved.getPage(1).getRotation().angle, 90);
      const note = saved.context.lookup(saved.getPage(1).node.Annots().get(0));
      assert.equal(note.lookup(PDFName.of("Contents")).decodeText(), "Проверить 🙂\nстроку");
      const a = await f.sessions.attachments.put(thread.id, "exported.pdf", exported);
      files["exported.pdf"] = "/api/attachments/" + a.id;
      await open("exported.pdf");
      await expect(page.getByRole("img", { name: "PDF, страница 1", exact: true })).toBeVisible();
      // Inspect actual rendered exported pixels: marker survives export as vectors.
      for (let number = 1; number <= 2; number++) {
        if (number === 2) {
          await button("Следующая страница PDF").click();
          await page.getByLabel("Масштаб PDF").selectOption("125");
          await expect(
            page.getByRole("img", { name: "PDF, страница 2", exact: true }),
          ).toBeVisible();
        }
        const marked = await page.locator(`canvas[aria-label='PDF, страница ${number}']`).evaluate(
          (c, original) => {
            const prior = new Set(original);
            const p = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
            let n = 0,
              x = 0,
              y = 0;
            for (let i = 0; i < p.length; i += 4)
              if (
                !prior.has(i) &&
                p[i] > 220 &&
                p[i + 1] > 150 &&
                p[i + 2] > 100 &&
                p[i + 2] < 210
              ) {
                n++;
                x += (i / 4) % c.width;
                y += Math.floor(i / 4 / c.width);
              }
            return { n, x: x / n / c.width, y: y / n / c.height, width: c.width, height: c.height };
          },
          originalMasks[number - 1],
        );
        assert.ok(marked.n > 100);
        assert.ok(
          Math.abs(marked.x - positions[number - 1].x) < 0.015,
          JSON.stringify({ marked, expected: positions[number - 1] }),
        );
        assert.ok(Math.abs(marked.y - positions[number - 1].y) < 0.015);
      }
      await page.getByText("Комментарии в документе", { exact: true }).click();
      await expect(page.locator(".pdf-comments")).toContainText("Проверить 🙂");
      assert.deepEqual(
        await (await context.request.get(origin + files["document.pdf"])).body(),
        pdf,
      );
      assert.deepEqual(errors, []);
      console.log(
        engine +
          ": CSV exact copy/filter/Undo/restoration and PDF page coordinates/Unicode/vector export/drafts/themes passed",
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
