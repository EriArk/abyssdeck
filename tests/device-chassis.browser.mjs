import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const out = ".local/qa-device-chassis";
await mkdir(out, { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const root = await mkdtemp(join(tmpdir(), "chassis-")),
    origin = "http://127.0.0.1:18968";
  const f = await handoffFixture(origin);
  f.sessions.config.machines[0].type = "local-linux";
  f.sessions.config.projects[0].workingDirectory = root;
  f.sessions.config.projects[0].name = "Проект с длинным названием — документы и материалы";
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
    machineClients: { pc: "web" },
  });
  await writeFile(
    join(root, "example.md"),
    "# Просмотр документа\n\nТекст остаётся на экране при изменении ширины.\n\n## Следующий раздел\n\nПроверка общего просмотрщика.",
  );
  const browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 1366, height: 1024 },
      hasTouch: true,
      serviceWorkers: "block",
    });
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18968 });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Layout fixture: serve exact local bytes without invoking the Linux transfer helper on Windows.
    await page.route("**/api/projects/project/files/content?*", async (route) => {
      assert.equal(new URL(route.request().url()).searchParams.get("path"), "example.md");
      await route.fulfill({
        body: await readFile(join(root, "example.md")),
        contentType: "text/markdown",
      });
    });
    await page.goto(origin);
    const composer = page.getByLabel("Сообщение Codex", { exact: true });
    await composer.fill("Мой черновик сохраняется");
    await composer.blur();
    const resultsHandle = page.getByRole("separator", { name: "Ширина результатов", exact: true });
    const resultsPane = page.locator(".support-pane");
    const beforeResults = (await resultsPane.boundingBox()).width;
    const grab = await resultsHandle.boundingBox();
    await page.mouse.move(grab.x + 2, grab.y + 100);
    await page.mouse.down();
    await page.mouse.move(grab.x - 18, grab.y + 100, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => Math.abs((await resultsPane.boundingBox()).width - beforeResults - 20))
      .toBeLessThan(3);
    const resize = async (container, pane, direction = "ArrowRight") => {
      const divider = container.locator(".panel-divider:visible").last();
      await expect(divider).toBeVisible();
      const before = (await pane.boundingBox()).width;
      await divider.focus();
      await divider.press(direction);
      await expect.poll(async () => (await pane.boundingBox()).width).toBeGreaterThan(before + 10);
    };
    const shot = async (area) => {
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
          document.documentElement.dataset.caseColor = "red";
        }, theme);
        for (const width of [390, 768, 1366]) {
          await page.setViewportSize({ width, height: 1024 });
          await page.evaluate(() => window.dispatchEvent(new Event("resize")));
          if (width === 390) await expect(page.locator(".panel-divider:visible")).toHaveCount(0);
          await page.screenshot({
            path: `${out}/${engine}-${area}-${theme}-${width}.png`,
            animations: "disabled",
          });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
            `${area} root overflow`,
          );
        }
      }
    };
    await shot("chat");
    await page.getByRole("button", { name: "Файлы проекта", exact: true }).click();
    const files = page.getByRole("dialog", { name: "Файлы проекта", exact: true });
    await files.getByRole("button", { name: /^example.md/ }).click();
    await expect(files.locator(".file-document")).toContainText("Просмотр документа");
    await resize(files, files.locator(".file-browser-detail"), "ArrowLeft");
    const wrap = files.getByRole("button", { name: "Перенос строк", exact: true });
    await expect(wrap).toHaveAttribute("title", "Перенос строк");
    assert((await wrap.boundingBox()).width <= 46, "compact preview tool");
    await shot("files");
    await files.getByRole("button", { name: "Открыть файл", exact: true }).click();
    const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Свойства файла", exact: true }).click();
    await resize(viewer, viewer.locator(".file-viewer-properties"), "ArrowLeft");
    await shot("viewer");
    await viewer.getByRole("button", { name: "Справка и клавиши", exact: true }).click();
    const help = page.getByRole("dialog", { name: "Справка и клавиши", exact: true });
    await resize(help, help.locator(".help-index"));
    await help.getByRole("button", { name: "Закрыть справку", exact: true }).click();
    await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
    await resize(settings, settings.locator(".settings-overview"));
    await settings.getByRole("button", { name: "Закрыть настройки", exact: true }).click();
    await page
      .locator(".workspace-shortcuts:visible")
      .getByRole("button", { name: "Заметки", exact: true })
      .click();
    const notes = page.locator('dialog[data-workspace-module="notes"]');
    await resize(notes, notes.locator(".notebook-list"));
    await page.keyboard.press("Escape");
    await expect(composer).toHaveValue("Мой черновик сохраняется");
    assert(!f.calls.some((c) => c.method === "turn/start"));
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: real file preview, nested viewer, settings and notes resizing; theme screenshots and parent draft passed`,
    );
  } finally {
    await context.close();
    await browser.close();
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
}
