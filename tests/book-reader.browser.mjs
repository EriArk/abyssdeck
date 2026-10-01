import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "book-reader-"));
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
        entry: resolve("apps/web/tests/fixtures/book-reader.tsx"),
        name: "BookReader",
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
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFile(join(dir, f), "utf8")),
    )
  ).join("\n");
  await mkdir(".local/qa-book-reader", { recursive: true });
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const errors = [],
        posts = [],
        deletes = [];
      let release;
      const hold = new Promise((resolve) => {
        release = resolve;
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        const speech = new EventTarget();
        speech.spoken = [];
        speech.cancelled = 0;
        speech.getVoices = () => [
          { name: "Russian", lang: "ru-RU", default: true, localService: true },
        ];
        speech.speak = (utterance) => (speech.spoken.push(utterance), utterance.onstart?.());
        speech.pause = speech.resume = () => {};
        speech.cancel = () => speech.cancelled++;
        Object.defineProperty(window, "speechSynthesis", { value: speech });
        Object.defineProperty(window, "SpeechSynthesisUtterance", {
          value: class {
            constructor(text) {
              this.text = text;
            }
          },
        });
        window.speechMock = speech;
        window.audioMock = [];
        window.Audio = class {
          constructor() {
            window.audioMock.push(this);
            this.currentTime = 0;
            this.duration = 1;
            this.paused = true;
            this.seeking = false;
            this.ended = false;
          }
          set src(value) {
            this._src = value;
            this.currentTime = 0;
            this.ended = false;
          }
          get src() {
            return this._src;
          }
          get currentSrc() {
            return this._src || "";
          }
          play() {
            this.paused = false;
            setTimeout(() => {
              this.onloadedmetadata?.();
              this.onplaying?.();
            }, 1000);
            return Promise.resolve();
          }
          pause() {
            this.stopped = true;
            this.paused = true;
          }
          removeAttribute() {}
          load() {}
        };
      });
      await page.route("https://speech.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
          });
        if (path === "/fixture.js")
          return route.fulfill({ contentType: "text/javascript", body: js });
        if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
        if (path.startsWith("/fonts/"))
          return route.fulfill({
            contentType: "font/woff2",
            body: await readFile(resolve("apps/web/public" + path)),
          });
        if (path === "/api/speech/status")
          return route.fulfill({ json: { available: true, voices: ["eugene"] } });
        if (path.endsWith("/audio")) {
          const bytes = Buffer.alloc(16044);
          bytes.write("RIFF");
          bytes.writeUInt32LE(16036, 4);
          bytes.write("WAVEfmt ", 8);
          bytes.writeUInt32LE(16, 16);
          bytes.writeUInt16LE(1, 20);
          bytes.writeUInt16LE(1, 22);
          bytes.writeUInt32LE(8000, 24);
          bytes.writeUInt32LE(16000, 28);
          bytes.writeUInt16LE(2, 32);
          bytes.writeUInt16LE(16, 34);
          bytes.write("data", 36);
          bytes.writeUInt32LE(16000, 40);
          return route.fulfill({ contentType: "audio/wav", body: bytes });
        }
        if (route.request().method() === "POST") {
          posts.push(route.request().postDataJSON());
          await hold;
        }
        if (route.request().method() === "DELETE") deletes.push(path);
        return route.fulfill({ json: {} });
      });
      await page.goto("https://speech.test");
      await page.evaluate(() =>
        localStorage.setItem("codexweb-reader-preferences", JSON.stringify({ engine: "browser" })),
      );
      await page.getByRole("button", { name: "Открыть файл" }).click();
      const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
      const reader = viewer.locator(".book-reader");
      await expect(reader.locator(".reader-bottom")).toContainText(/Стр\. 1 \/ \d+/);
      assert.ok(
        Number((await reader.locator(".reader-bottom").innerText()).match(/\/ (\d+)/)[1]) > 30,
      );
      await reader.getByRole("button", { name: "Следующая страница", exact: true }).click();
      await reader.getByRole("button", { name: "Озвучить страницу", exact: true }).click();
      const first = await page.evaluate(() => speechMock.spoken.at(-1).text);
      assert.doesNotMatch(first, /^Большая книга/);
      const label = await reader.locator(".reader-bottom").innerText();
      // Natural utterance endings move the page; no synthetic scrolling or send.
      await page.evaluate(() => {
        for (let i = 0; i < 15; i++) speechMock.spoken.at(-1).onend?.();
      });
      await expect(reader.locator(".reader-bottom")).not.toHaveText(label);
      await reader.getByRole("button", { name: "Приостановить озвучивание" }).click();
      await reader.getByRole("button", { name: "Продолжить озвучивание" }).click();
      await reader.getByRole("button", { name: "Приостановить озвучивание" }).click();
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("codexweb-reader-positions")),
      );
      assert.equal(Object.keys(saved).length, 1);
      for (const theme of ["classic-dark", "crt-green", "organizer", "hitech-2000s"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        for (const width of [390, 1366]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
          await expect
            .poll(() =>
              reader.locator(".reader-scroll:not(.reader-measure)").evaluate((pane) => {
                const article = pane.querySelector("article");
                const columns = pane.clientWidth >= 900 ? 2 : 1;
                return (
                  Math.abs(parseFloat(article.style.width) - (pane.clientWidth / columns - 44)) <
                    1 && pane.classList.contains("reader-spread") === (columns === 2)
                );
              }),
            )
            .toBe(true);
          await expect(reader.locator(".reader-bottom")).toContainText(/Стр\./);
          await page.screenshot({ path: `.local/qa-book-reader/${name}-${theme}-${width}.png` });
          assert.equal(
            await viewer.evaluate((dialog) => {
              const rect = dialog.getBoundingClientRect();
              return (
                dialog.scrollWidth <= dialog.clientWidth + 1 &&
                [...dialog.querySelectorAll(".reader-toolbar button,.reader-bottom button")].every(
                  (b) => {
                    const r = b.getBoundingClientRect();
                    return (
                      r.width >= 43 &&
                      r.height >= 43 &&
                      r.right <= rect.right + 1 &&
                      r.bottom <= rect.bottom
                    );
                  },
                )
              );
            }),
            true,
            `${theme} ${width}`,
          );
        }
      }
      await page.setViewportSize({ width: 390, height: 500 });
      await expect(reader.locator(".reader-scroll")).toBeVisible();
      await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveValue("Мой черновик");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Открыть файл" }).click();
      await expect(reader.locator(".reader-bottom")).not.toContainText(/Стр\. 1 \/ /);
      const chapters = reader.getByRole("combobox", { name: "Оглавление" });
      await chapters.selectOption({ index: (await chapters.locator("option").count()) - 1 });
      for (
        let i = 0;
        i < 60 &&
        (await reader.getByRole("button", { name: "Следующая страница", exact: true }).isEnabled());
        i++
      )
        await reader.getByRole("button", { name: "Следующая страница", exact: true }).click();
      await expect(reader.locator("article").first()).toContainText("КОНЕЦ ПОЛНОГО ФАЙЛА");
      await viewer.getByRole("button", { name: "Исходный текст", exact: true }).first().click();
      await expect(viewer.locator(".file-text")).toContainText("КОНЕЦ ПОЛНОГО ФАЙЛА");
      for (const [index, expected] of [
        [1, "Последнее примечание"],
        [2, "Начало EPUB"],
        [3, "Совсем другой текст"],
      ]) {
        await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
        await page.getByRole("combobox", { name: "Файл", exact: true }).selectOption(String(index));
        await page.getByRole("button", { name: "Открыть файл" }).click();
        await expect(reader.locator("article").first()).toContainText(expected);
        await expect(reader.locator(".reader-bottom")).toContainText(/Стр\. 1/);
      }
      assert.equal(await page.evaluate(() => window.importedScript), undefined);
      release();
      await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
      await page.getByRole("combobox", { name: "Файл", exact: true }).selectOption("0");
      await page.getByRole("button", { name: "Открыть файл" }).click();
      await reader.getByRole("combobox", { name: "Оглавление" }).selectOption("0");
      await reader.getByRole("button", { name: "Настройки чтения" }).click();
      await reader.getByRole("combobox", { name: "Голос читалки" }).selectOption("server");
      await reader.getByRole("button", { name: "Настройки чтения" }).click();
      await expect(reader.locator(".reader-bottom")).toContainText(/Стр\./);
      const beforeVoiceHeight = await reader
        .locator(".reader-scroll:not(.reader-measure)")
        .evaluate((pane) => pane.clientHeight);
      const deletedBeforeVoice = deletes.length;
      await reader.getByRole("button", { name: "Озвучить страницу" }).click();
      await expect.poll(() => posts.length).toBeGreaterThan(0);
      await expect(reader.locator(".reader-voice-status")).toContainText("Подготовка озвучки");
      assert.equal(
        await reader
          .locator(".reader-scroll:not(.reader-measure)")
          .evaluate((pane) => pane.clientHeight),
        beforeVoiceHeight,
        "loading does not change page geometry or cancel synthesis",
      );
      assert.ok(posts[0].text.length < 30000);
      await expect.poll(() => page.evaluate(() => audioMock.length)).toBe(1);
      const beforeAudioPage = await reader.locator(".reader-bottom").innerText();
      await expect.poll(() => posts.length).toBe(2);
      await expect(reader.locator(".reader-voice-status")).toBeEmpty();
      assert.equal(
        deletes.length,
        deletedBeforeVoice,
        "starting playback preserves the registered page and lookahead",
      );
      assert.equal(
        await reader
          .locator(".reader-scroll:not(.reader-measure)")
          .evaluate((pane) => pane.clientHeight),
        beforeVoiceHeight,
      );
      await page.evaluate(() => {
        const audio = audioMock[0];
        audio.currentTime = 1;
        audio.paused = true;
        audio.ended = true;
        audio.onended?.();
      });
      await expect(reader.locator(".reader-bottom")).not.toHaveText(beforeAudioPage);
      assert.equal(
        await page.evaluate(() => audioMock.length),
        1,
        "next page reuses unlocked iPhone audio element",
      );
      await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
      await expect.poll(() => deletes.length).toBeGreaterThan(0);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        name +
          ": full text, native book pagination/speech, position/reflow, four themes, FB2 and EPUB passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
