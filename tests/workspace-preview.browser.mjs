import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const dir = await mkdtemp(join(tmpdir(), "workspace-preview-ui-"));
await mkdir(".local/qa-workspace-preview", { recursive: true });
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
      rolldownOptions: { input: resolve("apps/web/tests/fixtures/workspace-preview.html") },
    },
  });
  const origin = "http://127.0.0.1:18879",
    fixture = await handoffFixture(origin, dir);
  await fixture.app.listen({ host: "127.0.0.1", port: 18879 });
  const browser = await chromium.launch();
  try {
    const sample = await browser.newPage({ viewport: { width: 1024, height: 720 } });
    await sample.setContent(
      '<body style="margin:0;padding:30px;background:#f5f6f9;color:#26374c;font:22px Arial"><h1>Локальное приложение</h1><p>Проверка проекта</p><input placeholder="Название" style="padding:12px;font:inherit"><button style="padding:12px;font:inherit">Сохранить</button></body>',
    );
    const frame = await sample.screenshot({ type: "jpeg" });
    await sample.close();
    for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      });
      const [name, value] = fixture.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin }]);
      const page = await context.newPage();
      let effects = [];
      await page.route("**/api/projects/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/gui-previews"))
          return route.fulfill({
            json: {
              serverWorkspace: true,
              installed: true,
              actions: [],
              operations: [],
              threadId: null,
            },
          });
        if (path.endsWith("/frame"))
          return route.fulfill({ body: frame, contentType: "image/jpeg" });
        if (path.endsWith("/input")) {
          effects.push(route.request().postDataJSON());
          return route.fulfill({ json: { ok: true } });
        }
        if (route.request().method() === "DELETE") return route.fulfill({ json: { ok: true } });
        return route.fulfill({
          json: { id: "11111111-1111-1111-1111-111111111111", width: 1024, height: 720 },
        });
      });
      await page.goto(origin + "/tests/fixtures/workspace-preview.html");
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await page.getByRole("button", { name: "Открыть приложение", exact: true }).click();
      await expect(page.getByRole("application")).toBeVisible();
      await page.getByRole("application").click({ position: { x: 50, y: 50 } });
      await expect.poll(() => effects.length).toBe(1);
      assert.equal(effects[0].op, "click");
      await page.getByText("Ввод текста и клавиши", { exact: true }).click();
      await page.getByRole("textbox", { name: "Текст для приложения" }).fill("Проверка");
      await page.getByRole("button", { name: "Вставить в выбранное поле" }).click();
      await expect.poll(() => effects.length).toBe(2);
      assert.equal(effects[1].text, "Проверка");
      for (const [width, height] of [
        [390, 844],
        [390, 540],
        [1024, 768],
      ]) {
        await page.setViewportSize({ width, height });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const close = await page
          .getByRole("button", { name: "Закрыть предпросмотр", exact: true })
          .boundingBox();
        assert.ok(
          close &&
            close.x >= 0 &&
            close.x + close.width <= width &&
            close.y >= 0 &&
            close.y + close.height <= height,
        );
        await page.screenshot({
          path: `.local/qa-workspace-preview/${theme}-${width}-${height}.png`,
        });
      }
      await page.getByRole("button", { name: "Закрыть предпросмотр", exact: true }).click();
      await expect(page.getByText("Вернулись к чату")).toBeVisible();
      await context.close();
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
console.log(
  "Workspace preview UI: exact click/text, close, four themes, phone/keyboard/tablet passed.",
);
