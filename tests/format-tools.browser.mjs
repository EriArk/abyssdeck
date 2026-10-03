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

const sharp = createRequire(new URL("../apps/hub/package.json", import.meta.url))("sharp");
const { zipSync } = createRequire(new URL("../apps/web/package.json", import.meta.url))("fflate");
const wav = Buffer.alloc(44 + 16000 * 3);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
const dir = await mkdtemp(join(tmpdir(), "format-tools-"));
await mkdir(".local/qa-format-tools", { recursive: true });
const png = await sharp({
  create: { width: 240, height: 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .png()
  .toBuffer();
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
    const origin = "http://127.0.0.1:18891",
      f = await handoffFixture(origin, dir),
      browser = await type.launch();
    try {
      await f.app.listen({ host: "127.0.0.1", port: 18891 });
      const thread = f.store.createThread("project", randomUUID(), "Format tools");
      const files = {};
      for (const [name, bytes] of [
        ["image.png", png],
        ["sound.wav", wav],
        [
          "archive.zip",
          Buffer.from(
            zipSync({ "alpha.txt": Buffer.from("a"), "zeta.txt": Buffer.from("larger content") }),
          ),
        ],
        ["frame.gif", await sharp(png).gif().toBuffer()],
        ["notes.md", Buffer.from("selected text")],
        ["data.json", Buffer.from('{"id":900719925474099312345,"a":1}')],
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
      await open("notes.md");
      await page.getByRole("button", { name: "Редактировать", exact: true }).click();
      const editor = page.locator(".file-editor-embedded"),
        content = editor.locator(".cm-content");
      await expect(content).toContainText("selected text");
      await content.click();
      await page.keyboard.press("ControlOrMeta+A");
      await editor.getByRole("button", { name: "Жирный", exact: true }).click();
      await expect(content).toHaveText("**selected text**");
      await editor.getByRole("button", { name: "Отменить изменение", exact: true }).click();
      await expect(content).toHaveText("selected text");
      await editor.getByRole("button", { name: "Повторить изменение", exact: true }).click();
      await expect(content).toHaveText("**selected text**");
      await editor.getByRole("button", { name: "Просмотр", exact: true }).click();
      await expect(page.locator(".file-viewer-dialog")).toHaveCount(1);
      await editor.getByRole("button", { name: "Правка", exact: true }).click();
      await expect(content).toHaveText("**selected text**");
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        for (const width of [1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 600 : 768 });
          await expect(editor.getByRole("button", { name: "Таблица", exact: true })).toBeVisible();
          await expect
            .poll(async () =>
              page
                .locator(".file-viewer-dialog")
                .evaluate((el) => el.getBoundingClientRect().right),
            )
            .toBeLessThanOrEqual(width + 1);
          await page.screenshot({
            path: `.local/qa-format-tools/${engine}-markdown-${theme}-${width}.png`,
          });
        }
      }
      await open("data.json");
      await page.getByRole("button", { name: "Редактировать", exact: true }).click();
      await expect(content).toContainText("900719925474099312345");
      await editor.getByRole("button", { name: "Форматировать JSON", exact: true }).click();
      await expect(content).toContainText("900719925474099312345");
      await expect(editor.locator("output")).toContainText("Форматирование применено");
      await editor.getByRole("button", { name: "Отменить изменение", exact: true }).click();
      await expect(content).toHaveText('{"id":900719925474099312345,"a":1}');
      await page.setViewportSize({ width: 1024, height: 768 });
      await open("image.png");
      await page.getByRole("button", { name: "Разметка", exact: true }).click();
      const surface = page.getByRole("img", { name: "Холст разметки", exact: true });
      await expect(surface).toBeVisible();
      const draw = async (x1, y1, x2, y2) => {
        const points = await surface
          .locator("g")
          .first()
          .evaluate(
            (g, ps) =>
              ps.map(([x, y]) => {
                const p = new DOMPoint(x, y).matrixTransform(g.getScreenCTM());
                return { x: p.x, y: p.y };
              }),
            [
              [x1, y1],
              [x2, y2],
            ],
          );
        await page.mouse.move(points[0].x, points[0].y);
        await page.mouse.down();
        await page.mouse.move(points[1].x, points[1].y, { steps: 6 });
        await page.mouse.up();
      };
      await page.getByRole("button", { name: "Перо", exact: true }).click();
      await page.getByLabel("Цвет разметки").fill("#ff0000");
      await draw(40, 40, 180, 100);
      await expect(surface.locator("path")).toHaveCount(1);
      await page.getByRole("button", { name: "Отменить разметку", exact: true }).click();
      await expect(surface.locator("path")).toHaveCount(0);
      await page.getByRole("button", { name: "Повторить разметку", exact: true }).click();
      await expect(surface.locator("path")).toHaveCount(1);
      await page.getByRole("button", { name: "Повернуть вправо", exact: true }).click();
      await page.getByRole("button", { name: "Увеличить разметку", exact: true }).click();
      await page.getByRole("button", { name: "Стрелка", exact: true }).click();
      await draw(70, 60, 160, 110);
      await expect(surface.locator("path")).toHaveCount(2);
      await page.getByRole("button", { name: "Вписать разметку", exact: true }).click();
      await page.getByRole("button", { name: "Обрезка", exact: true }).click();
      await draw(20, 20, 220, 140);
      await expect(surface).toHaveAttribute("viewBox", "0 0 120 200");
      if (engine === "chromium") {
        const rect = await surface.boundingBox(),
          cdp = await context.newCDPSession(page);
        const first = { id: 1, x: rect.x + 40, y: rect.y + 40 },
          second = { id: 2, x: rect.x + 140, y: rect.y + 40 };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first] });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [first, second],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [first, { ...second, x: rect.x + 240 }],
        });
        await expect(surface).toHaveAttribute("style", /scale\(2\)/);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
        await page.getByRole("button", { name: "Вписать разметку", exact: true }).click();
      }
      await page.getByRole("button", { name: "Просмотр", exact: true }).click();
      await expect(surface.locator("path")).toHaveCount(2);
      await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
      await page.getByRole("button", { name: "Закрыть с черновиком", exact: true }).click();
      await page.getByRole("button", { name: "Открыть файл", exact: true }).click();
      await expect(surface.locator("path")).toHaveCount(2);
      await expect(surface).toHaveAttribute("viewBox", "0 0 120 200");
      await page.getByRole("button", { name: "Сохранить размеченную копию", exact: true }).click();
      const download = page.waitForEvent("download");
      await page.getByRole("link", { name: "Скачать копию", exact: true }).click();
      const bytes = await readFile(await (await download).path());
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.width, 120);
      assert.equal(metadata.height, 200);
      assert.equal(metadata.hasAlpha, true);
      const pixels = await sharp(bytes).raw().toBuffer();
      assert.ok(pixels.some((v, i) => i % 4 === 3 && v > 0));
      assert.ok(pixels.some((v, i) => i % 4 === 3 && v === 0));
      assert.notDeepEqual(bytes, png);
      await page.getByRole("button", { name: "Закрыть сохранение копии", exact: true }).click();
      await page.getByRole("button", { name: "Разметка", exact: true }).click();
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        for (const width of [1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 700 : 768 });
          await page.screenshot({
            path: `.local/qa-format-tools/${engine}-image-${theme}-${width}.png`,
          });
        }
      }
      await page.setViewportSize({ width: 1024, height: 768 });
      // Persist across a real page recreation, not just a mounted window toggle.
      await open("image.png");
      await expect(surface).toHaveAttribute("viewBox", "0 0 120 200");
      await expect(surface.locator("path")).toHaveCount(2);
      await page.getByLabel("Формат копии изображения").selectOption("jpeg");
      await page.getByRole("button", { name: "Сохранить размеченную копию", exact: true }).click();
      const jpegDownload = page.waitForEvent("download");
      await page.getByRole("link", { name: "Скачать копию", exact: true }).click();
      const jpeg = await readFile(await (await jpegDownload).path());
      assert.equal((await sharp(jpeg).metadata()).format, "jpeg");
      assert.deepEqual(
        [...(await sharp(jpeg).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer())],
        [255, 255, 255],
      );
      await page.getByRole("button", { name: "Закрыть сохранение копии", exact: true }).click();
      await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
      await page.getByRole("button", { name: "Не сохранять", exact: true }).click();
      await expect(page.locator(".file-viewer-dialog")).not.toBeVisible();
      await open("image.png");
      await page.getByRole("button", { name: "Разметка", exact: true }).click();
      await expect(surface.locator("path")).toHaveCount(0);
      await expect(surface).toHaveAttribute("viewBox", "0 0 240 160");
      const original = await context.request.get(origin + files["image.png"]);
      assert.deepEqual(await original.body(), png);
      await open("frame.gif");
      await expect(
        page.getByRole("button", { name: "Разметить снимок кадра", exact: true }),
      ).toBeVisible();
      // Windows Playwright WebKit has no WAV/MP3 decoder (MEDIA_ERR_SRC_NOT_SUPPORTED).
      // Exercise real media bytes in Chromium; never fake metadata to claim playback.
      if (engine === "chromium") {
        await open("sound.wav");
        const audio = page.locator("audio");
        await expect.poll(() => audio.evaluate((m) => m.readyState || m.error?.code)).toBeTruthy();
        await expect
          .poll(() => audio.evaluate((m) => m.duration > 2.9 && m.duration < 3.2))
          .toBe(true);
        await page.getByLabel("Скорость воспроизведения").selectOption("1.5");
        assert.equal(await audio.evaluate((m) => m.playbackRate), 1.5);
        await page.getByLabel("Позиция в секундах").fill("0.5");
        await page.getByRole("button", { name: "Перейти к позиции", exact: true }).click();
        await expect.poll(() => audio.evaluate((m) => m.currentTime)).toBe(0.5);
        await page.getByTitle("Начало повторяемого фрагмента").click();
        await page.getByLabel("Позиция в секундах").fill("1.5");
        await page.getByRole("button", { name: "Перейти к позиции", exact: true }).click();
        await page.getByTitle("Конец повторяемого фрагмента").click();
        await page.getByRole("button", { name: "Повторять A–B", exact: true }).click();
        await audio.evaluate((m) => {
          m.currentTime = 1.8;
          m.dispatchEvent(new Event("timeupdate"));
        });
        await expect.poll(() => audio.evaluate((m) => m.currentTime)).toBe(0.5);
      }
      await open("archive.zip");
      await expect(page.getByLabel("Сортировка архива")).toBeVisible();
      await page.getByLabel("Сортировка архива").selectOption("size");
      const zipRows = page.locator(".archive-entry");
      await expect(zipRows).toHaveCount(2);
      await expect(zipRows.first()).toContainText("zeta.txt");
      await page.getByLabel("Сортировка архива").selectOption("name");
      await expect(zipRows.first()).toContainText("alpha.txt");
      assert.deepEqual(errors, []);
      console.log(
        engine +
          ": Markdown selection/Undo, JSON precision, annotation transforms/export/transparency/draft restore/themes/ZIP passed; media A–B verified in Chromium",
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
