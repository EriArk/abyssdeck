import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "viewer-speech-"));
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
        entry: resolve("apps/web/tests/fixtures/viewer-speech.tsx"),
        name: "ViewerSpeech",
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
  await mkdir(".local/qa-viewer-speech", { recursive: true });
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
        speech.speak = (utterance) => speech.spoken.push(utterance);
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
          }
          play() {
            return Promise.resolve();
          }
          pause() {
            this.stopped = true;
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
        if (route.request().method() === "POST") {
          posts.push(route.request().postDataJSON());
          await hold;
        }
        if (route.request().method() === "DELETE") deletes.push(path);
        return route.fulfill({ json: {} });
      });
      await page.goto("https://speech.test");
      await page.getByRole("button", { name: "Открыть файл" }).tap();
      const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
      const speak = () => viewer.getByRole("button", { name: "Озвучить текст", exact: true }).tap();
      await speak();
      assert.match(await page.evaluate(() => speechMock.spoken[0].text), /^Кто должен был/);
      await viewer.getByRole("button", { name: "Приостановить озвучивание" }).tap();
      await viewer.getByRole("button", { name: "Продолжить озвучивание" }).tap();
      assert.equal(await page.evaluate(() => speechMock.spoken.length), 1);
      for (const theme of ["classic-dark", "crt-green", "organizer", "hitech-2000s"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        for (const width of [390, 1366]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
          assert.equal(
            await viewer.locator(".file-text-tools").evaluate((rail) => {
              const bounds = rail.getBoundingClientRect();
              return (
                [...rail.querySelectorAll("button")].every((button) => {
                  const rect = button.getBoundingClientRect();
                  return (
                    rect.width >= 43 &&
                    rect.height >= 43 &&
                    rect.left >= bounds.left &&
                    rect.right <= bounds.right + 1
                  );
                }) && rail.scrollWidth <= rail.clientWidth + 1
              );
            }),
            true,
            theme + " " + width,
          );
          await page.screenshot({ path: `.local/qa-viewer-speech/${name}-${theme}-${width}.png` });
        }
      }
      await viewer.getByRole("button", { name: "Остановить озвучивание", exact: true }).tap();
      await page.setViewportSize({ width: 390, height: 844 });
      const pane = viewer.locator(".readable-file");
      await viewer
        .locator(".file-document p")
        .last()
        .evaluate((paragraph) => {
          const node = paragraph.firstChild;
          const start = node.textContent.indexOf("Чтение30");
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + 1);
          const pane = paragraph.closest(".readable-file");
          pane.scrollTop +=
            range.getBoundingClientRect().top -
            pane.querySelector("fieldset").getBoundingClientRect().bottom;
        });
      const startScroll = await pane.evaluate((pane) => pane.scrollTop);
      await speak();
      const firstVisible = await page.evaluate(() => speechMock.spoken.at(-1).text);
      assert.doesNotMatch(firstVisible, /Кто должен был|Когда умер/);
      const word = Number(firstVisible.match(/Чтение(\d+)/)?.[1]);
      assert.ok(word >= 27 && word <= 30, firstVisible);
      await page.evaluate(() => {
        for (let i = 0; i < 7; i++) speechMock.spoken.at(-1).onend();
      });
      assert.ok(
        (await pane.evaluate((pane) => pane.scrollTop)) > startScroll + 100,
        "follows native chunks",
      );
      await viewer.getByRole("button", { name: "Приостановить озвучивание" }).tap();
      const pausedScroll = await pane.evaluate((pane) => pane.scrollTop);
      await page.evaluate(() => speechMock.spoken.at(-1).onboundary({ charIndex: 200 }));
      assert.equal(await pane.evaluate((pane) => pane.scrollTop), pausedScroll);
      await viewer.getByRole("button", { name: "Продолжить озвучивание" }).tap();
      assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0);
      await page.screenshot({ path: `.local/qa-viewer-speech/${name}-following.png` });
      const spokenBeforeSwitch = await page.evaluate(() => speechMock.spoken.length);
      await viewer.getByRole("button", { name: "Следующий файл" }).tap();
      await expect(viewer.getByRole("heading", { name: "Другая глава" })).toBeVisible();
      const cancelled = await page.evaluate(() => speechMock.cancelled);
      assert.ok(cancelled >= 2);
      await page.evaluate(() => speechMock.spoken[0].onend());
      assert.equal(
        await page.evaluate(() => speechMock.spoken.length),
        spokenBeforeSwitch,
        "old file cannot continue",
      );
      await speak();
      assert.match(await page.evaluate(() => speechMock.spoken.at(-1).text), /^Другая глава/);
      await viewer.getByRole("button", { name: "Закрыть просмотр" }).tap();
      assert.ok((await page.evaluate(() => speechMock.cancelled)) > cancelled);
      await expect(page.getByRole("textbox", { name: "Черновик" })).toHaveValue(
        "Сохранённый черновик",
      );
      await page.getByRole("button", { name: "Открыть файл" }).tap();
      await expect(
        viewer.getByRole("button", { name: "Остановить озвучивание", exact: true }),
      ).toHaveCount(0);
      await viewer.getByRole("button", { name: "Следующий файл" }).tap();
      await speak();
      assert.match(await page.evaluate(() => speechMock.spoken.at(-1).text), /<важно>/);
      await viewer.getByRole("button", { name: "Остановить озвучивание", exact: true }).tap();
      await pane.evaluate((pane) => {
        pane.scrollTop = 500;
      });
      await speak();
      assert.match(await page.evaluate(() => speechMock.spoken.at(-1).text), /^Строка\d+/);
      const plainScroll = await pane.evaluate((pane) => pane.scrollTop);
      await page.evaluate(() => {
        for (let i = 0; i < 30; i++) speechMock.spoken.at(-1).onend();
      });
      assert.ok(
        (await pane.evaluate((pane) => pane.scrollTop)) > plainScroll,
        "plain source follows as well",
      );
      await viewer.getByRole("button", { name: "Следующий файл" }).tap();
      await expect(viewer.locator(".file-text")).toContainText("двоичные данные");
      await expect(viewer.getByRole("button", { name: "Озвучить текст" })).toHaveCount(0);
      await viewer.getByRole("button", { name: "Следующий файл" }).tap();
      await viewer.getByRole("button", { name: "Закрыть просмотр" }).tap();
      await page.getByLabel("Режим озвучивания").selectOption("background");
      await page.getByRole("button", { name: "Открыть файл" }).tap();
      await expect(
        viewer.getByRole("button", { name: "Озвучить текст", exact: true }),
      ).toBeEnabled();
      await pane.evaluate((pane) => {
        pane.scrollTop = 600;
      });
      await speak();
      await expect.poll(() => posts.length).toBe(1);
      assert.doesNotMatch(posts[0].text, /Кто должен был|Когда умер/);
      assert.equal(posts[0].voice, "eugene");
      await page.evaluate(() => {
        const audio = audioMock.at(-1);
        audio.duration = 100;
        audio.currentTime = 0;
        audio.onplaying();
        audio.currentTime = 75;
        audio.ontimeupdate();
      });
      const audioScroll = await pane.evaluate((pane) => pane.scrollTop);
      assert.ok(audioScroll > 700, "follows actual audio time");
      await viewer.getByRole("button", { name: "Приостановить озвучивание" }).tap();
      await page.evaluate(() => {
        const audio = audioMock.at(-1);
        audio.currentTime = 90;
        audio.ontimeupdate();
      });
      assert.equal(await pane.evaluate((pane) => pane.scrollTop), audioScroll);
      await viewer.getByRole("button", { name: "Закрыть просмотр" }).tap();
      await expect.poll(() => deletes.length).toBe(1);
      release();
      await expect.poll(() => deletes.length).toBe(2);
      assert.equal(deletes[0], deletes[1], "late synthesis deletes only its original clip");
      assert.equal(await page.evaluate(() => audioMock.every((audio) => audio.stopped)), true);
      assert.deepEqual(errors, []);
      console.log(
        name +
          ": viewer speech, same-name file switch, close, plain text, late audio and 4 themes passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
