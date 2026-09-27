import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { fileLaunchFixture } from "./file-launch-fixture.mjs";

for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18893",
    f = await fileLaunchFixture(origin),
    browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      serviceWorkers: "block",
    });
  await f.release();
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "results",
  });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const out = ".local/qa-file-launch/" + engine;
  await mkdir(out, { recursive: true });
  const panel = page.getByRole("dialog", { name: "Запуск файла", exact: true });
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18893 });
    await page.route("**/api/projects/project/files?**", (r) =>
      r.fulfill({
        json: {
          entries: [
            {
              path: "dist/Demo.exe",
              name: "Demo.exe",
              kind: "file",
              size: 30,
              modifiedAt: Date.now(),
            },
          ],
          path: "dist",
          nextOffset: null,
          truncated: false,
        },
      }),
    );
    await page.route("**/api/projects/project/remote/**", (r) =>
      r.fulfill({ status: 503, json: { error: { message: "Fixture Remote unavailable" } } }),
    );
    await page.goto(origin);
    await page.getByRole("button", { name: "Чат", exact: true }).click();
    await page.getByRole("textbox", { name: "Сообщение Codex" }).fill("Launch source draft");
    await page
      .getByRole("button", { name: /^Результаты/ })
      .last()
      .click();
    await page.getByRole("button", { name: "Открыть Demo.exe", exact: true }).click();
    const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
    await viewer.getByRole("button", { name: "Запустить и показать", exact: true }).click();
    await expect(panel).toBeVisible();
    assert.equal(f.launches.filter((x) => x.q.op === "start").length, 0);
    await panel.getByRole("button", { name: "Открыть местоположение" }).click();
    const files = page.getByRole("dialog", { name: "Файлы проекта", exact: true });
    await expect(files.locator('[data-file-path="dist/Demo.exe"].selected')).toBeVisible();
    await expect(
      files.getByRole("button", { name: "Запустить и показать", exact: true }),
    ).toBeEnabled();
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"])
      for (const [width, height] of [
        [390, 844],
        [390, 400],
        [820, 1180],
        [1366, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        const box = await panel.boundingBox();
        assert(
          box.height < Math.min(height, 500),
          "Compact launcher must not stretch to the viewport",
        );
        assert(box.x >= 0 && box.x + box.width <= width + 1 && box.height <= height);
        assert.equal(await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
        await expect(panel.getByRole("button", { name: "Закрыть запуск" })).toBeInViewport();
        await panel.screenshot({ path: out + "/" + theme + "-" + width + "x" + height + ".png" });
      }
    await page.setViewportSize({ width: 390, height: 844 });
    let lost = false;
    await page.route("**/api/file-launches/*", async (r) => {
      if (r.request().method() === "PUT" && !lost) {
        lost = true;
        await r.fetch();
        await r.abort("failed");
      } else await r.continue();
    });
    await panel.getByRole("button", { name: "Запустить и показать", exact: true }).click();
    const remote = page.getByRole("dialog", { name: "Remote запущенного файла", exact: true });
    await expect(remote).toBeVisible({ timeout: 20000 });
    await page.keyboard.press("Escape");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("status")).toContainText("Процесс работает");
    assert.equal(f.launches.filter((x) => x.q.op === "start").length, 1);
    await panel.getByRole("button", { name: "Закрыть запуск" }).click();
    await viewer.getByRole("button", { name: "Закрыть просмотр" }).click();
    await page.getByRole("button", { name: "Чат", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Сообщение Codex" })).toHaveValue(
      "Launch source draft",
    );
    await page.reload();
    await page
      .getByRole("button", { name: /^Результаты/ })
      .last()
      .click();
    await page.getByRole("button", { name: "Открыть Demo.exe", exact: true }).click();
    await viewer.getByRole("button", { name: "Запустить и показать", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Процесс работает");
    await expect(remote).not.toBeVisible();
    assert.equal(f.launches.filter((x) => x.q.op === "start").length, 1);
    assert.equal(f.calls.filter((x) => x.method === "turn/start").length, 0);
    assert.deepEqual(errors, []);
    console.log(
      engine +
        ": Result and Files exact launch, reveal, lost ack, reload, Remote failure/return, draft continuity; 16 themed layouts passed",
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
