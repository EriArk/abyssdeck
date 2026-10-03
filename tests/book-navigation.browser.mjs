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
        entry: resolve("apps/web/tests/fixtures/book-navigation.tsx"),
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
  await mkdir(".local/qa-book-navigation", { recursive: true });
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
      release();
      await page.goto("https://speech.test");
      await page.evaluate(() =>
        localStorage.setItem("codexweb-reader-preferences", JSON.stringify({ engine: "browser" })),
      );
      const open = async (index) => {
        if (await page.locator(".file-viewer-dialog[open]").count())
          await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
        await page.getByLabel("Файл", { exact: true }).selectOption(String(index));
        await page.getByRole("button", { name: "Открыть файл", exact: true }).click();
      };
      await open(2);
      const reader = page.locator(".book-reader"),
        pane = reader.locator(".reader-scroll:not(.reader-measure)"),
        nav = reader.locator(".reader-navigation");
      const button = (name) => reader.getByRole("button", { name, exact: true });
      await expect(reader.locator(".reader-bottom")).toContainText(/Стр\. 1/);
      const initialHeight = await pane.evaluate((el) => el.clientHeight);
      const search = async (query) => {
        if (!(await reader.getByLabel("Найти в книге", { exact: true }).count()))
          await button("Поиск по книге").click();
        await reader.getByLabel("Найти в книге", { exact: true }).fill(query);
        await button("Искать в книге").click();
        await expect(nav.getByRole("status")).toContainText(/Найдено|Совпадений|Поиск неполный/);
      };
      await search("МАЯК");
      await expect(nav.locator(".reader-navigation-entry")).toHaveCount(2);
      assert.equal(
        await pane.evaluate((el) => el.clientHeight),
        initialHeight,
        "search reflowed the speech page",
      );
      await expect(reader.getByLabel("Оглавление", { exact: true })).toHaveValue("0");
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        for (const width of [1024, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 650 : 768 });
          await expect(button("Закрыть навигацию книги")).toBeVisible();
          assert.equal(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
          await page.screenshot({
            path: `.local/qa-book-navigation/${name}-search-${theme}-${width}.png`,
          });
        }
      }
      await nav.locator(".reader-navigation-entry").nth(1).click();
      await expect(nav).toHaveCount(0);
      await expect(reader.getByLabel("Оглавление", { exact: true })).toHaveValue("1");
      await expect(reader.locator(".reader-search-highlight i").first()).toBeVisible();
      const at = await page.evaluate(
        () => Object.values(JSON.parse(localStorage.getItem("codexweb-reader-positions")))[0],
      );
      assert.ok(at.anchor.block > 30);
      await button("Закладки книги").click();
      await button("Закладка здесь").click();
      await button("Закладка здесь").click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(1);
      const mark = await page.evaluate(
        () => JSON.parse(localStorage.getItem("codexweb-reader-bookmarks"))[0],
      );
      assert.deepEqual(mark.anchor, at.anchor);
      await page.screenshot({ path: `.local/qa-book-navigation/${name}-bookmarks.png` });
      await button("Закрыть навигацию книги").click();
      await button("Озвучить страницу").click();
      await expect
        .poll(() => page.evaluate(() => speechMock.spoken.at(-1)?.text))
        .toMatch(/^маяк:/);
      await button("Приостановить озвучивание").click();
      const spoken = await page.evaluate(() => speechMock.spoken.length);
      await search("Первый маяк");
      await nav.locator(".reader-navigation-entry").first().click();
      assert.equal(
        await page.evaluate(() => speechMock.spoken.length),
        spoken,
        "paused speech resumed on jump",
      );
      await expect(button("Продолжить озвучивание")).toBeVisible();
      await button("Закладки книги").click();
      await nav.locator(".reader-navigation-entry").click();
      await expect(reader.getByLabel("Оглавление", { exact: true })).toHaveValue("1");
      await button("Настройки чтения").click();
      await reader.getByLabel("Размер шрифта", { exact: true }).fill("30");
      await button("Настройки чтения").click();
      await page.setViewportSize({ width: 1366, height: 900 });
      await button("Закладки книги").click();
      await nav.locator(".reader-navigation-entry").click();
      await expect(reader.getByLabel("Оглавление", { exact: true })).toHaveValue("1");
      await open(2);
      await button("Закладки книги").click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(1);
      await nav.locator(".reader-navigation-entry").click();
      await button("Настройки чтения").click();
      await reader.getByLabel("Голос читалки", { exact: true }).selectOption("server");
      await button("Настройки чтения").click();
      await button("Озвучить страницу").click();
      await expect.poll(() => posts.some((p) => p.text.startsWith("маяк:"))).toBe(true);
      await expect(button("Приостановить озвучивание")).toBeVisible();
      const before = posts.length,
        stops = deletes.length;
      await search("Первый маяк");
      assert.equal(deletes.length, stops, "opening search stopped server audio");
      await nav.locator(".reader-navigation-entry").click();
      await expect
        .poll(() => posts.slice(before).some((p) => p.text.startsWith("Первый маяк")))
        .toBe(true);
      await open(1);
      await search("КНИГИ целиком.");
      await expect(nav.locator(".reader-navigation-entry")).toHaveCount(1);
      await nav.locator(".reader-navigation-entry").click();
      await expect(reader.locator(".reader-search-highlight i").first()).toBeVisible();
      await button("Закладки книги").click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(0);
      await button("Закладка здесь").click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(1);
      await nav.getByRole("button", { name: /Удалить закладку:/ }).click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(0);
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem("codexweb-reader-bookmarks")).length,
        ),
        1,
        "delete affected another book",
      );
      await open(0);
      await search("история");
      await expect(nav.getByRole("status")).toContainText("Поиск неполный");
      await expect(nav.locator(".reader-navigation-entry")).toHaveCount(500);
      await button("Искать в книге").click();
      await reader.getByLabel("Найти в книге", { exact: true }).fill("несуществующее");
      await expect(nav.locator(".reader-navigation-entry")).toHaveCount(0);
      await page.waitForTimeout(80);
      await expect(nav.locator(".reader-navigation-entry")).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 420 });
      await expect(button("Закрыть навигацию книги")).toBeVisible();
      await page.screenshot({ path: `.local/qa-book-navigation/${name}-keyboard.png` });
      await button("Закрыть навигацию книги").click();
      await button("Закладки книги").click();
      await button("Закладка здесь").click();
      await open(3);
      await button("Закладки книги").click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(0);
      await page.evaluate(() =>
        sessionStorage.setItem("codex-workspace-identity", "11111111-1111-4111-8111-111111111111"),
      );
      await page.reload();
      await open(2);
      await button("Закладки книги").click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(0);
      await page.evaluate(() => sessionStorage.removeItem("codex-workspace-identity"));
      await page.reload();
      await open(2);
      await button("Закладки книги").click();
      await expect(nav.locator(".reader-bookmark-row")).toHaveCount(1);
      assert.equal(await page.evaluate(() => window.importedScript), undefined);
      assert.deepEqual(errors, []);
      console.log(
        name +
          ": EPUB/FB2 search, exact jumps/highlights, bookmarks/reopen/account isolation, speech continuity, bounds and four themes passed",
      );
      await page.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
