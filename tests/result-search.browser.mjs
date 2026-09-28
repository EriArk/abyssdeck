import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import { searchGptResults } from "../apps/hub/dist/result-search.js";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { emptyResultCounts, resultSearchQuerySchema } from "../packages/shared/dist/index.js";

const dir = await mkdtemp(join(tmpdir(), "result-search-browser-"));
const browserName = process.env.BROWSER || "chromium";
let browser;
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
        entry: resolve("apps/web/tests/fixtures/result-search.tsx"),
        name: "ResultSearchFixture",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  const js = await readFile(join(dir, "fixture.js"), "utf8"),
    css = (
      await Promise.all(
        (
          await readdir(dir)
        )
          .filter((x) => x.endsWith(".css"))
          .map((x) => readFile(join(dir, x), "utf8")),
      )
    ).join("\n");
  browser = await (browserName === "webkit" ? webkit : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const items = Array.from({ length: 86 }, (_, i) => ({
    id: "r" + i,
    type: i === 85 ? "image" : "file",
    title: i === 85 ? "preview.png" : `Материал-${String(i).padStart(3, "0")}.txt`,
    createdAt: new Date((i + 1) * 1000000).toISOString(),
    turnId: "m" + i,
    threadId: "chat",
    threadTitle: "Очень длинное название исходного проекта и разговора",
    payload: {
      url: "/api/artifacts/r" + i,
      mime: i === 85 ? "image/png" : "text/plain",
      bytes: 20,
    },
  })).reverse();
  let reads = 0,
    writes = 0,
    lists = 0,
    searches = 0,
    revision = "rev",
    slow = null;
  await page.route("https://result-search.test/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html data-theme="organizer"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><link rel="stylesheet" href="/fixture.css"><script src="/fixture.js"></script></html>',
      });
    if (path === "/fixture.js")
      return route.fulfill({ contentType: "application/javascript", body: js });
    if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
    if (route.request().method() !== "GET") writes++;
    if (path.startsWith("/api/artifacts/")) {
      reads++;
      return route.fulfill({
        contentType: "text/plain",
        body: "Exact contents " + path.split("/").at(-1),
      });
    }
    if (path.endsWith("/search")) {
      searches++;
      const q = resultSearchQuerySchema.parse(Object.fromEntries(url.searchParams));
      if (q.q === "slow") {
        slow = route;
        return;
      }
      try {
        return route.fulfill({ json: searchGptResults(path, items, revision, q) });
      } catch (e) {
        return route.fulfill({ status: 409, json: { code: e.code, message: e.message } });
      }
    }
    if (path.endsWith("/results")) {
      lists++;
      const category = url.searchParams.get("category") ?? "files",
        subset = items.filter((x) =>
          category === "images" ? x.type === "image" : x.type === "file",
        );
      const offset = Number(url.searchParams.get("before") ?? 0),
        count = emptyResultCounts();
      count.all = items.length;
      count.files = 85;
      count.images = 1;
      return route.fulfill({
        json: {
          items: subset.slice(offset, offset + 20),
          counts: count,
          nextBefore: offset + 20 < subset.length ? String(offset + 20) : null,
          sourceRevision: 0,
        },
      });
    }
    const id = path.match(/\/results\/(r\d+)$/)?.[1];
    if (id) return route.fulfill({ json: items.find((x) => x.id === id) });
    return route.fulfill({ status: 404, json: { message: "missing" } });
  });
  await page.goto("https://result-search.test/");
  await page.getByLabel("Draft").fill("Не потерять черновик");
  await expect(page.locator("[data-result]")).toHaveCount(20);
  const launch = page.getByRole("button", { name: "Найти файл в результатах", exact: true });
  await launch.click();
  const search = page.getByRole("dialog", { name: "Поиск файлов в результатах", exact: true });
  await expect(search.locator(".result-search-row")).toHaveCount(40);
  assert.equal(reads, 0);
  await search.getByRole("button", { name: "Показать ещё", exact: true }).click();
  await expect(search.locator(".result-search-row")).toHaveCount(80);
  await search.getByLabel("Название файла").fill("Материал-003");
  await expect(search.locator(".result-search-row")).toHaveCount(1);
  await search.getByRole("button", { name: "Открыть Материал-003.txt", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents r3");
  await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
  await expect(search.getByLabel("Название файла")).toHaveValue("Материал-003");
  await search.getByLabel("Название файла").fill("");
  await expect(search.locator(".result-search-row")).toHaveCount(40);
  await search.getByLabel("Порядок результатов").selectOption("oldest");
  await expect(search.locator(".result-search-open").first()).toContainText("Материал-000");
  await search.locator(".result-search-list").evaluate((el) => (el.scrollTop = 280));
  const top = await search.locator(".result-search-list").evaluate((el) => el.scrollTop);
  await search.getByRole("button", { name: "Открыть Материал-004.txt", exact: true }).click();
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents r4");
  await viewer.getByRole("button", { name: "Свойства файла", exact: true }).click();
  await viewer.getByRole("button", { name: "Следующий файл", exact: true }).click();
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents r5");
  await expect(viewer.getByLabel("Свойства", { exact: true })).toContainText("Материал-005");
  await viewer.getByRole("button", { name: "Предыдущий файл", exact: true }).click();
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents r4");
  await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
  assert.equal(await search.locator(".result-search-list").evaluate((el) => el.scrollTop), top);
  await search.getByLabel("Название файла").fill("slow");
  await expect.poll(() => !!slow).toBe(true);
  await search.getByLabel("Название файла").fill("Материал-002");
  await expect(search.locator(".result-search-row")).toHaveCount(1);
  await slow.fulfill({ json: { items: [], nextCursor: null, scanned: 0 } }).catch(() => {});
  await expect(search.locator(".result-search-open")).toContainText("Материал-002");
  // A replaced native branch resets continuation, never mixes incompatible pages.
  await search.getByLabel("Название файла").fill("");
  await expect(search.locator(".result-search-row")).toHaveCount(40);
  revision = "new-revision";
  await search.getByRole("button", { name: "Показать ещё", exact: true }).click();
  await expect.poll(() => searches).toBeGreaterThan(7);
  await expect(search.getByRole("button", { name: "Показать ещё", exact: true })).toBeEnabled();
  await expect(search.locator(".result-search-row")).toHaveCount(40);
  await search.getByLabel("Название файла").fill("Материал-003");
  await expect(search.locator(".result-search-row")).toHaveCount(1);
  await search.getByRole("button", { name: "В ленте: Материал-003.txt", exact: true }).click();
  await expect(search).toHaveCount(0);
  await expect(page.locator('[data-result="r3"]')).toBeVisible();
  const pane = page.locator(".results-pane > .pane-scroll");
  await pane.evaluate((el) => (el.scrollTop = 400));
  const position = await pane.evaluate((el) => el.scrollTop),
    before = lists;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => lists).toBeGreaterThan(before);
  await page.waitForTimeout(100);
  assert.equal(await pane.evaluate((el) => el.scrollTop), position);
  // Same features also use the ordinary Codex feed; source jumps remain exact.
  await page.getByRole("button", { name: "Client", exact: true }).click();
  await launch.click();
  await expect(search.locator(".result-search-row")).toHaveCount(40);
  await search.getByLabel("Название файла").fill("Материал-001");
  await expect(search.locator(".result-search-row")).toHaveCount(1);
  await search.locator(".result-search-open").click();
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents r1");
  await viewer.getByRole("button", { name: "К сообщению", exact: true }).click();
  await expect(page.getByTestId("source")).toHaveText("chat:m1");
  await expect(search).toHaveCount(0);
  await expect(page.getByLabel("Draft")).toHaveValue("Не потерять черновик");
  // Existing feed viewer keeps its shell, but switches exact bytes with next/previous.
  await page.getByRole("button", { name: "Открыть Материал-084.txt", exact: true }).click();
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents r84");
  await viewer.getByRole("button", { name: "Следующий файл", exact: true }).click();
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents r83");
  await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
  await launch.click();
  await expect(search.locator(".result-search-row")).toHaveCount(40);
  await mkdir(".cache/results-search", { recursive: true });
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    for (const [width, height] of [
      [390, 844],
      [390, 430],
      [768, 1024],
      [1366, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        (value) => (document.documentElement.dataset.keyboard = String(value)),
        height === 430,
      );
      const b = await search.boundingBox(),
        close = await search
          .getByRole("button", { name: "Закрыть поиск результатов" })
          .boundingBox();
      assert(
        b.x >= 0 && b.y >= 0 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1,
        `${theme} window bounds`,
      );
      assert(Math.abs(b.x - (width - b.width) / 2) < 2, `${theme} symmetric gutters`);
      assert(close.y + close.height <= height && close.x + close.width <= width, `${theme} close`);
      assert.equal(await search.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
      await page.screenshot({
        path: `.cache/results-search/${browserName}-${theme}-${width}x${height}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.keyboard = "false"));
  await search.locator(".result-search-open").first().click();
  await expect(viewer.getByLabel("Содержимое файла")).toContainText("Exact contents");
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await page.screenshot({ path: `.cache/results-search/${browserName}-${theme}-viewer.png` });
  }
  assert.deepEqual(errors, []);
  assert.equal(writes, 0);
  console.log(
    `${browserName}: Results search pagination/sort/cancellation/revision, exact nested viewer navigation, source/feed focus continuity, Codex/GPT, draft and 16 themed layouts passed.`,
  );
} finally {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
}
