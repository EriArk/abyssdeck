import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { createServer } from "../apps/web/node_modules/vite/dist/node/index.js";

await mkdir(".local/qa-image-gallery", { recursive: true });
const server = await createServer({
  root: "apps/web",
  server: { host: "127.0.0.1", port: 18966 },
  logLevel: "error",
});
await server.listen();
const png = await readFile("polish/05-files/394-desktop.webp");
const image = (n) => ({
  id: String(n),
  title: n === 2 ? "Изображение" : `screen-${n}.webp`,
  type: "image",
  turnId: "turn",
  createdAt: "2026-10-02",
  payload: { url: `/api/native-images/${n}`, ...(n === 2 ? {} : { mime: "image/webp" }) },
});
try {
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const errors = [];
      const requests = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/**", (route) => {
        const u = new URL(route.request().url());
        requests.push(u.pathname + u.search);
        if (u.pathname.endsWith("/results"))
          return route.fulfill({
            json: {
              items: u.searchParams.has("before") ? [image(4)] : [image(1), image(2), image(3)],
              nextBefore: u.searchParams.has("before") ? null : "3",
              counts: { images: 4 },
            },
          });
        if (u.pathname.startsWith("/api/native-images/"))
          return route.fulfill({ contentType: "image/webp", body: png });
        return route.fulfill({ json: {} });
      });
      await page.goto("http://127.0.0.1:18966/tests/fixtures/image-gallery.html");
      const gallery = page.getByRole("group", { name: "Галерея изображений" });
      await expect(gallery).toHaveCount(1);
      await expect(gallery).toContainText("1 из 3");
      await expect(gallery.locator("img")).toHaveCount(1);
      await expect(page.getByAltText("Отдельная картинка")).toBeVisible();
      assert(!requests.some((r) => r.endsWith("/2")), "unselected image must not load");
      await gallery.getByRole("button", { name: "Следующее изображение" }).click();
      await expect(gallery).toContainText("2 из 3");
      await page.getByRole("button", { name: "Продолжить ответ" }).click();
      await expect(gallery).toContainText("2 из 4");
      await expect(gallery.getByAltText("Экран 2")).toBeVisible();
      for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"]) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        for (const width of [390, 768]) {
          await page.setViewportSize({ width, height: 844 });
          await gallery.scrollIntoViewIfNeeded();
          const bounds = await gallery.boundingBox();
          assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
          await expect
            .poll(() => gallery.locator("img").evaluate((e) => e.naturalWidth))
            .toBeGreaterThan(0);
          await page.screenshot({ path: `.local/qa-image-gallery/${name}-${theme}-${width}.webp` });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await gallery.getByRole("button", { name: "Экран 2", exact: true }).click();
      const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
      await expect(viewer).toBeVisible();
      await expect(viewer).toContainText("Изображение");
      await expect(viewer).toContainText("2 из 3");
      await expect(viewer.locator(".image-viewport img")).toBeVisible();
      await expect
        .poll(() => viewer.locator(".image-viewport img").evaluate((e) => e.naturalWidth))
        .toBeGreaterThan(0);
      await viewer.getByRole("button", { name: "Следующее изображение" }).click();
      await expect(viewer).toContainText("screen-3.webp");
      await viewer.getByRole("button", { name: "Следующее изображение" }).click();
      await expect(viewer).toContainText("screen-4.webp");
      await expect(viewer).toContainText("4 из 4");
      await expect(viewer.getByRole("button", { name: "Следующее изображение" })).toBeDisabled();
      await viewer.getByRole("button", { name: "Предыдущее изображение" }).click();
      await expect(viewer).toContainText("screen-3.webp");
      await viewer.getByRole("button", { name: "Закрыть просмотр" }).click();
      await expect(gallery).toContainText("2 из 4");
      await expect(page.getByLabel("Черновик")).toHaveValue("Сохранить черновик");
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.getByRole("button", { name: "Встроенные картинки", exact: true }).click();
      const attachments = page.getByRole("region", { name: "Встроенные картинки" });
      await expect(attachments.locator("img")).toHaveCount(1);
      await attachments.getByRole("button", { name: "Следующее изображение" }).click();
      await expect(attachments).toContainText("2 из 3");
      await attachments
        .getByRole("button", { name: "Посмотреть Изображение 2", exact: true })
        .click();
      const attachedViewer = page.locator("dialog.attachment-preview[open]");
      await expect(attachedViewer).toContainText("2 из 3");
      await attachedViewer.getByRole("button", { name: "Следующее изображение" }).click();
      await expect(attachedViewer).toContainText("Изображение 3");
      await expect
        .poll(() => attachedViewer.locator("img").evaluate((e) => e.naturalWidth))
        .toBeGreaterThan(0);
      await page.screenshot({ path: `.local/qa-image-gallery/${name}-native-viewer.png` });
      await attachedViewer.getByRole("button", { name: "Закрыть изображение" }).click();
      await expect(attachments).toContainText("2 из 3");
      assert.deepEqual(errors, []);
      console.log(
        name +
          ": image grouping, retained slide, viewer image-only pagination, themes and parent continuity passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
