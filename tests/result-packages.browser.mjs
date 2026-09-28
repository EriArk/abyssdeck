import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const root = await mkdtemp(join(tmpdir(), "result-package-browser-"));
const name = process.env.BROWSER || "chromium";
let browser;
try {
  await build({
    configFile: false,
    root: resolve("apps/web"),
    plugins: [react()],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "error",
    build: {
      outDir: root,
      emptyOutDir: true,
      lib: {
        entry: resolve("apps/web/tests/fixtures/result-search.tsx"),
        name: "Fixture",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  const js = await readFile(join(root, "fixture.js"), "utf8");
  const css = (
    await Promise.all(
      (
        await readdir(root)
      )
        .filter((x) => x.endsWith(".css"))
        .map((x) => readFile(join(root, x), "utf8")),
    )
  ).join("\n");
  browser = await (name === "webkit" ? webkit : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    operations = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    sessionStorage.setItem("codex-workspace-identity", "10000000-0000-4000-8000-000000000001"),
  );
  const items = Array.from({ length: 4 }, (_, index) => ({
    id: "r" + index,
    type: index === 3 ? "image" : "file",
    threadId: "chat",
    turnId: "turn",
    createdAt: "2026-09-28T00:00:00Z",
    title: "Очень длинное название выбранного файла " + index + ".txt",
    payload: { url: "/api/artifacts/r" + index, bytes: 6, mime: "text/plain" },
  }));
  await page.route("https://package.test/**", async (route) => {
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
    if (path.endsWith("/results/search"))
      return route.fulfill({
        json: {
          items: items
            .filter(
              (r) => !url.searchParams.get("q") || r.title.includes(url.searchParams.get("q")),
            )
            .map(({ payload, ...r }) => r),
          nextCursor: null,
          scanned: 4,
        },
      });
    if (/\/results\/r\d$/.test(path))
      return route.fulfill({ json: items.find((r) => path.endsWith("/" + r.id)) });
    if (path.endsWith("/results"))
      return route.fulfill({
        json: {
          items: items.filter((r) =>
            url.searchParams.get("category") === "images" ? r.type === "image" : r.type === "file",
          ),
          counts: { all: 4, files: 3, images: 1, links: 0, demos: 0, work: 0, reasoning: 0 },
          nextBefore: null,
          sourceRevision: 0,
        },
      });
    if (path === "/api/team/result-packages") {
      operations.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          id: "20000000-0000-4000-8000-000000000001",
          title: "Results.zip",
          bytes: 200,
          mime: "application/zip",
          sha256: "a".repeat(64),
          ownerId: "owner",
          createdAt: 1,
        },
      });
    }
    if (path === "/api/team/conversations") return route.fulfill({ json: { items: [] } });
    if (path === "/api/team/spaces") return route.fulfill({ json: { spaces: [] } });
    if (path === "/api/team/brainstorm") return route.fulfill({ json: { rooms: [] } });
    if (path.endsWith("/grants")) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 404, json: { message: "unexpected " + path } });
  });
  await page.goto("https://package.test/");
  await page.getByRole("textbox", { name: "Draft" }).fill("Сохранённый черновик");
  await page.getByRole("button", { name: "Выбрать несколько результатов" }).click();
  await page.getByRole("button", { name: "Выбрать загруженные" }).click();
  await expect(page.getByText("Выбрано: 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Изображения", exact: false }).click();
  await page.getByRole("button", { name: "Выбрать загруженные" }).click();
  await expect(page.getByText("Выбрано: 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Подготовить пакет" }).click();
  await expect(page.getByRole("button", { name: "Отправить пакет", exact: true })).toBeVisible();
  assert.equal(operations.length, 1);
  assert.equal(operations[0].sources.length, 4);
  assert(operations[0].sources.every((s) => s.client === "gpt" && s.threadId === "chat"));
  await page.getByRole("button", { name: "Отправить пакет", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Отправить результат" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть отправку" }).click();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать несколько результатов" }).click();
  await expect(page.getByRole("button", { name: "Отправить пакет", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("Сохранённый черновик");
  const screenshots = resolve(".cache/result-packages-" + name);
  await mkdir(screenshots, { recursive: true });
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const [width, height] of [
      [390, 844],
      [390, 430],
      [768, 1024],
      [1366, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(
        page.getByRole("button", { name: "Отправить пакет", exact: true }),
      ).toBeInViewport();
      const bounds = await page
        .locator(".result-batch-actions")
        .evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
      assert(bounds.scroll <= bounds.width + 1);
      await page.screenshot({ path: join(screenshots, `${theme}-${width}-${height}.png`) });
    }
  }
  await page.getByRole("button", { name: "Снять выбор", exact: true }).click();
  await expect(page.getByRole("button", { name: "Подготовить пакет" })).toBeDisabled();
  await page.getByRole("button", { name: "Найти файл в результатах" }).click();
  const search = page.getByRole("dialog", { name: "Поиск файлов в результатах" });
  await search.getByRole("button", { name: "Выбрать несколько найденных файлов" }).click();
  await expect(search.getByRole("checkbox")).toHaveCount(4);
  await search.getByRole("checkbox").first().click();
  await expect(search.getByText("Выбрано: 1", { exact: true })).toBeVisible();
  await search.getByRole("button", { name: "Выбрать найденные на странице" }).click();
  await expect(search.getByText("Выбрано: 4", { exact: true })).toBeVisible();
  await search.getByRole("button", { name: "Подготовить пакет", exact: true }).click();
  await expect(search.getByRole("button", { name: "Отправить пакет", exact: true })).toBeVisible();
  assert.equal(operations.at(-1).sources.length, 4);
  assert(operations.at(-1).sources.every((s) => s.client === "gpt" && s.threadId === "chat"));
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const [width, height] of [
      [390, 844],
      [390, 430],
      [1024, 768],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(
        search.getByRole("button", { name: "Закрыть поиск результатов" }),
      ).toBeInViewport();
      await page.screenshot({ path: join(screenshots, `search-${theme}-${width}-${height}.png`) });
    }
  }
  await search.getByRole("button", { name: "Отправить пакет", exact: true }).click();
  await page.getByRole("button", { name: "Закрыть отправку" }).click();
  await expect(search.getByText("Выбрано: 4", { exact: true })).toBeVisible();
  await search.getByRole("button", { name: "Закрыть поиск результатов" }).click();
  await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue("Сохранённый черновик");
  assert.deepEqual(errors, []);
  console.log(
    "Results package selection, exact sources, nested sharing and 16 themed layouts passed",
  );
} finally {
  await browser?.close();
  await rm(root, { recursive: true, force: true });
}
