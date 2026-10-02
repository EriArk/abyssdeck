import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { createServer } from "../apps/web/node_modules/vite/dist/node/index.js";

await mkdir(".local/qa-file-browser", { recursive: true });
const server = await createServer({
  root: "apps/web",
  server: { host: "127.0.0.1", port: 18967 },
  logLevel: "error",
});
await server.listen();
try {
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const errors = [],
        writes = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/**", async (route) => {
        const req = route.request(),
          u = new URL(req.url());
        if (req.method() !== "GET") writes.push(req.url());
        if (u.pathname === "/api/projects")
          return route.fulfill({
            json: {
              projects: [
                { id: "a", name: "Первый проект" },
                { id: "b", name: "Второй проект" },
              ],
            },
          });
        if (u.pathname.endsWith("/files")) {
          const path = u.searchParams.get("path") || "";
          return route.fulfill({
            json: {
              path,
              entries: path ? [] : [{ path: "notes", name: "notes", kind: "directory" }],
              offset: 0,
              nextOffset: null,
              total: 1,
              truncated: false,
            },
          });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto("http://127.0.0.1:18967/tests/fixtures/file-browser.html");
      const fb = page.getByRole("region", { name: "Навигация по файлам" });
      await fb.getByRole("button", { name: "Документы Папка", exact: true }).click();
      await expect(fb.getByRole("navigation", { name: "Путь к папке" })).toContainText("Документы");
      await fb.getByRole("button", { name: "Вложенная папка Папка", exact: true }).click();
      await fb
        .getByRole("navigation", { name: "Путь к папке" })
        .getByRole("button", { name: "Документы", exact: true })
        .click();
      await fb.getByRole("button", { name: "Ввести путь" }).click();
      await expect(fb.getByLabel("Путь в проекте")).toHaveValue("/Документы");
      await fb.getByRole("button", { name: "Отменить ввод пути" }).click();
      await fb.getByRole("button", { name: "Назад по папкам" }).click();
      await expect(fb.getByRole("navigation", { name: "Путь к папке" })).toContainText(
        "Вложенная папка",
      );
      await fb.getByRole("button", { name: "Вперёд по папкам" }).click();
      await fb.getByRole("button", { name: "Папка выше" }).click();
      await expect(fb.getByRole("button", { name: "Снимки Папка", exact: true })).toBeVisible();
      const scroll = fb.locator(".file-browser-scroll");
      await scroll.evaluate((e) => (e.scrollTop = 500));
      await fb.getByRole("button", { name: "Ввести путь" }).click();
      await fb.getByLabel("Путь в проекте").fill("/Снимки");
      await fb.getByRole("button", { name: "Открыть папку", exact: true }).click();
      await expect.poll(() => scroll.evaluate((e) => e.scrollTop)).toBe(0);
      await fb.getByRole("button", { name: "Назад по папкам" }).click();
      await expect.poll(() => scroll.evaluate((e) => e.scrollTop)).toBe(500);
      await page.getByRole("button", { name: "Windows", exact: true }).click();
      await fb.getByRole("button", { name: "Документы Папка", exact: true }).click();
      await fb.getByRole("button", { name: "Ввести путь" }).click();
      await expect(fb.getByLabel("Путь в проекте")).toHaveValue("D:/Projects/Документы");
      await fb.getByRole("button", { name: "Отменить ввод пути" }).click();
      await fb.getByLabel("Найти в папке").fill("Документ 4.md");
      await expect(fb.locator(".file-browser-entry")).toHaveCount(1);
      await fb.getByLabel("Найти в папке").fill("");
      for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        for (const width of [390, 768, 1366]) {
          await page.setViewportSize({ width, height: 844 });
          for (const view of ["Список файлов", "Значки файлов"]) {
            await fb.getByRole("button", { name: view, exact: true }).click();
            await page.screenshot({
              path: `.local/qa-file-browser/${engine}-${theme}-${width}-${view === "Список файлов" ? "list" : "icons"}.png`,
            });
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
              false,
            );
          }
        }
      }
      await page.setViewportSize({ width: 1366, height: 844 });
      await fb.getByRole("button", { name: /^Документ 1.md/ }).click();
      const divider = fb.locator(".panel-divider").last();
      await expect(divider).toBeVisible();
      const detail = fb.locator(".file-browser-detail");
      const initial = (await detail.boundingBox()).width;
      await divider.focus();
      await divider.press("ArrowLeft");
      await expect
        .poll(async () => (await detail.boundingBox()).width)
        .toBeGreaterThan(initial + 10);
      await expect
        .poll(async () => {
          const h = await divider.boundingBox(),
            d = await detail.boundingBox();
          return Math.abs(h.x + h.width / 2 - d.x);
        })
        .toBeLessThan(2);
      const handle = await divider.boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 - 60, handle.y + 50, { steps: 5 });
      await page.mouse.up();
      await expect
        .poll(async () => (await detail.boundingBox()).width)
        .toBeGreaterThan(initial + 65);
      const preference = await page.evaluate(() =>
        localStorage.getItem("codex-panel:files-preview"),
      );
      assert(Number(preference) > initial + 65);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(divider).toBeHidden();
      await expect(detail).toContainText("Содержимое выбранного файла");
      await page.setViewportSize({ width: 1366, height: 844 });
      await expect(divider).toBeVisible();
      await expect
        .poll(async () => Math.round((await detail.boundingBox()).width))
        .toBe(Number(preference));
      await fb.getByRole("button", { name: "Закрыть файл", exact: true }).click();
      await fb.getByRole("button", { name: /^Документ 1.md/ }).click();
      await expect
        .poll(async () => Math.round((await detail.boundingBox()).width))
        .toBe(Number(preference));
      await divider.press("Home");
      await expect.poll(async () => Math.round((await detail.boundingBox()).width)).toBe(250);
      await divider.dblclick();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("codex-panel:files-preview")))
        .toBe(null);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(fb.getByRole("region", { name: "Выбранный файл" })).toBeVisible();
      await fb.getByRole("button", { name: "Закрыть файл", exact: true }).click();
      await page.getByRole("button", { name: "Сохранить копию", exact: true }).click();
      const copy = page.getByRole("dialog", { name: "Сохранить копию", exact: true });
      await copy.getByLabel("Проект для копии").selectOption("a");
      await copy.getByRole("button", { name: "notes Папка", exact: true }).click();
      await expect(copy).toContainText("Папка для копии: notes");
      await copy.getByLabel("Проект для копии").selectOption("b");
      await expect(copy).toContainText("Папка для копии: Корень проекта");
      await expect(copy.getByRole("button", { name: "Назад по папкам" })).toBeDisabled();
      await expect(
        copy.getByRole("button", { name: "Сохранить в проект", exact: true }),
      ).toBeEnabled();
      await page.screenshot({ path: `.local/qa-file-browser/${engine}-copy.png` });
      await copy.getByRole("button", { name: "Закрыть сохранение копии" }).click();
      await expect(page.getByLabel("Черновик")).toHaveValue("Черновик остаётся");
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      console.log(
        engine +
          ": paths, history, scroll, filtering, views, copy source isolation and themes passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
