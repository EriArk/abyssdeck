import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const { unzipSync, zipSync } = createRequire(new URL("../apps/web/package.json", import.meta.url))(
  "fflate",
);
const dir = await mkdtemp(join(tmpdir(), "xlsx-workspace-"));
const python = process.env.XLSX_PYTHON || resolve(".local/xlsx-check/Scripts/python.exe");
await mkdir(".local/qa-xlsx", { recursive: true });
execFileSync(python, ["tests/xlsx-fixture.py", "create", ".local/qa-xlsx/original.xlsx"]);
const original = await readFile(".local/qa-xlsx/original.xlsx"),
  originalParts = unzipSync(original);
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
      rolldownOptions: {
        input: [
          resolve("apps/web/tests/fixtures/file-popup.html"),
          resolve("apps/web/tests/fixtures/xlsx-logic.html"),
        ],
      },
    },
  });
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (process.env.BROWSER && process.env.BROWSER !== engine) continue;
    const origin = "http://127.0.0.1:18894",
      f = await handoffFixture(origin, dir),
      browser = await type.launch();
    try {
      await f.app.listen({ host: "127.0.0.1", port: 18894 });
      const thread = f.store.createThread("project", randomUUID(), "Workbook"),
        a = await f.sessions.attachments.put(thread.id, "book.xlsx", original);
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        serviceWorkers: "block",
      });
      const [name, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin }]);
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (v) => {
              window.copiedRange = v;
            },
          },
        });
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const button = (name) => page.getByRole("button", { name, exact: true });
      const open = async (id = a.id) => {
        await page.goto(
          origin +
            "/tests/fixtures/file-popup.html?" +
            new URLSearchParams({ file: "/api/attachments/" + id, name: "book.xlsx" }),
        );
        await button("Открыть файл").click();
        await expect(button("Ячейка A2")).toBeVisible();
      };
      await open();
      await button("Ячейка A2").click();
      await button("Расширять выделение").click();
      await button("Ячейка B3").click();
      await expect(page.getByLabel("Диапазон ячеек")).toHaveValue("A2:B3");
      await button("Копировать диапазон").click();
      await expect
        .poll(() => page.evaluate(() => window.copiedRange))
        .toBe("Alpha\t12.5\r\nHidden row\t7");
      await button("Расширять выделение").click();
      await button("Ячейка A2").click();
      await button("Ячейка A2").press("Shift+ArrowRight");
      await expect(page.getByLabel("Диапазон ячеек")).toHaveValue("A2:B2");
      await button("Ячейка A2").click();
      await button("Редактировать значения").click();
      await page.getByLabel("Значение ячейки XLSX").fill("temporary");
      await button("Отменить изменение ячейки").click();
      await expect(page.getByLabel("Значение ячейки XLSX")).toHaveValue("Alpha");
      await button("Повторить изменение ячейки").click();
      await expect(page.getByLabel("Значение ячейки XLSX")).toHaveValue("temporary");
      await page.getByLabel("Значение ячейки XLSX").fill("Лазарь 🙂 _x000A_\nline");
      await button("Ячейка B2").click();
      await page.getByLabel("Значение ячейки XLSX").fill("123.75");
      await page.getByLabel("Поиск в документе").fill("Лазарь");
      await expect(button("Ячейка A3")).toHaveCount(0);
      await page.getByLabel("Диапазон ячеек").fill("A2:B3");
      await button("Копировать диапазон").click();
      await expect.poll(() => page.evaluate(() => window.copiedRange)).toContain("Hidden row\t7");
      await page.getByLabel("Поиск в документе").fill("");
      await button("Ячейка E4").click();
      await page.getByLabel("Значение ячейки XLSX").fill("new blank cell");
      await page.getByLabel("Поиск в документе").fill("new blank cell");
      await expect(button("Ячейка E4")).toHaveText("new blank cell");
      await button("Отменить изменение ячейки").click();
      await page.getByLabel("Поиск в документе").fill("");
      await button("Ячейка C2").click();
      await expect(page.locator(".xlsx-cell-editor")).toContainText("Формула доступна");
      await page.getByLabel("Лист").selectOption("2");
      await expect(page.locator(".xlsx-cell-editor")).toContainText("Лист защищён");
      await page.getByLabel("Лист").selectOption("3");
      await expect(page.locator(".xlsx-cell-editor")).toContainText("структурированную таблицу");
      await page.getByLabel("Лист").selectOption("0");
      await button("Ячейка B2").click();
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        for (const width of [1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 700 : 768 });
          await expect
            .poll(() =>
              page
                .locator(".file-viewer-dialog")
                .evaluate((el) => el.getBoundingClientRect().right),
            )
            .toBeLessThanOrEqual(width + 1);
          await expect(button("Закрыть просмотр")).toBeInViewport();
          await page.screenshot({ path: `.local/qa-xlsx/${engine}-${theme}-${width}.png` });
        }
      }
      await page.setViewportSize({ width: 390, height: 400 });
      await page.getByLabel("Значение ячейки XLSX").click();
      await page.screenshot({ path: `.local/qa-xlsx/${engine}-keyboard.png` });
      await button("Закончить правку ячейки").click();
      for (const width of [390, 1024]) {
        await page.setViewportSize({ width, height: width === 390 ? 700 : 768 });
        await expect
          .poll(() =>
            page.locator(".file-viewer-dialog").evaluate((el) => el.getBoundingClientRect().right),
          )
          .toBeLessThanOrEqual(width + 1);
        await page.screenshot({ path: `.local/qa-xlsx/${engine}-view-${width}.png` });
      }
      await page.setViewportSize({ width: 1024, height: 768 });
      await button("Закрыть просмотр").click();
      await button("Оставить черновик").click();
      await button("Открыть файл").click();
      await expect(button("Ячейка B2")).toHaveText("123.75");
      await button("Сохранить копию XLSX").click();
      const downloading = page.waitForEvent("download");
      await page.getByRole("link", { name: "Скачать копию", exact: true }).click();
      const downloaded = await readFile(await (await downloading).path());
      const parts = unzipSync(downloaded);
      assert.deepEqual(Object.keys(parts).sort(), Object.keys(originalParts).sort());
      for (const [name, bytes] of Object.entries(originalParts))
        if (!["xl/worksheets/sheet1.xml", "xl/workbook.xml"].includes(name))
          assert.deepEqual(parts[name], bytes, name);
      const sheet = Buffer.from(parts["xl/worksheets/sheet1.xml"]).toString();
      assert.match(sheet, /r="B2" s="1"><v>123\.75<\/v>/);
      assert.match(sheet, /<f>B2\*2<\/f>/);
      assert.match(sheet, /_x005F_x000A_/);
      assert.match(sheet, /Лазарь 🙂/);
      assert.deepEqual(
        await (await context.request.get(origin + "/api/attachments/" + a.id)).body(),
        original,
      );
      // Fresh-source reopening verifies decoding; the old draft cannot shadow the exported bytes.
      const exported = await f.sessions.attachments.put(thread.id, "book.xlsx", downloaded);
      await open(exported.id);
      await expect(button("Ячейка A2")).toContainText("_x000A_");
      await expect(button("Ячейка B2")).toHaveText("123.75");
      await expect(button("Сохранить копию XLSX")).toBeDisabled();
      // Exercise exact CRLF and number lexemes without textarea newline normalization.
      await page.goto(origin + "/tests/fixtures/xlsx-logic.html");
      await page.waitForFunction(() => !!window.xlsxTools);
      const exact = await page.evaluate((bytes) => {
        const t = window.xlsxTools,
          source = new Uint8Array(bytes),
          doc = t.readOffice(source, "xlsx");
        const result = t.exportWorkbook(
          source,
          [
            { sheet: 0, ref: "A2", type: "text", value: "Лазарь 🙂 _x000A_\r\nline" },
            { sheet: 0, ref: "B2", type: "number", value: "123.75" },
          ],
          doc,
        );
        const reread = t.readOffice(result, "xlsx");
        if (t.cellAt(reread.pages[0], "A2").value !== "Лазарь 🙂 _x000A_\r\nline")
          throw Error("Unicode/escaped literal/CRLF changed");
        for (const edit of [
          { sheet: 0, ref: "C2", type: "text", value: "bad" },
          { sheet: 2, ref: "A1", type: "text", value: "bad" },
          { sheet: 0, ref: "G2", type: "text", value: "bad" },
          { sheet: 3, ref: "A2", type: "text", value: "bad" },
          { sheet: 0, ref: "B2", type: "number", value: "not a number" },
        ]) {
          let failed = false;
          try {
            t.exportWorkbook(source, [edit], doc);
          } catch {
            failed = true;
          }
          if (!failed) throw Error("Unsafe edit accepted: " + JSON.stringify(edit));
        }
        const numeric = t.exportWorkbook(source, [
          { sheet: 0, ref: "B2", type: "number", value: "900719925474099312345" },
        ]);
        if (
          t.cellAt(t.readOffice(numeric, "xlsx").pages[0], "B2").value !== "900719925474099312345"
        )
          throw Error("Number rounded");
        const formulaText = t.exportWorkbook(source, [
          { sheet: 0, ref: "A2", type: "text", value: "=1+2" },
        ]);
        if (t.cellAt(t.readOffice(formulaText, "xlsx").pages[0], "A2").formula !== undefined)
          throw Error("Text became formula");
        const multi = t.readOffice(
          t.exportWorkbook(source, [
            { sheet: 1, ref: "A1", type: "text", value: "Other changed" },
            { sheet: 0, ref: "F2", type: "blank", value: "" },
            { sheet: 0, ref: "F3", type: "boolean", value: "true" },
            { sheet: 0, ref: "E4", type: "text", value: "inserted" },
          ]),
          "xlsx",
        );
        if (
          t.cellAt(multi.pages[1], "A1").value !== "Other changed" ||
          t.cellAt(multi.pages[0], "F2").value !== "" ||
          t.cellAt(multi.pages[0], "F3").value !== "TRUE" ||
          t.cellAt(multi.pages[0], "E4").value !== "inserted"
        )
          throw Error("Typed/sparse/multiple-sheet edits lost");
        return Array.from(result);
      }, Array.from(original));
      await writeFile(`.local/qa-xlsx/${engine}-roundtrip.xlsx`, new Uint8Array(exact));
      console.log(
        execFileSync(
          python,
          ["tests/xlsx-fixture.py", "verify", `.local/qa-xlsx/${engine}-roundtrip.xlsx`],
          { encoding: "utf8" },
        ).trim(),
      );
      const signed = zipSync({
        ...originalParts,
        "_xmlsignatures/sig.xml": new TextEncoder().encode("signature"),
      });
      await page.evaluate((bytes) => {
        let failed = false;
        try {
          window.xlsxTools.exportWorkbook(new Uint8Array(bytes), [
            { sheet: 0, ref: "A2", type: "text", value: "changed" },
          ]);
        } catch {
          failed = true;
        }
        if (!failed) throw Error("Signature invalidated");
      }, Array.from(signed));
      assert.deepEqual(errors, []);
      console.log(
        `${engine}: XLSX selection/copy, filter, edit, Undo, drafts, exact package parts, independent reopen, guardrails and themes passed`,
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
