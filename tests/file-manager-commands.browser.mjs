import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const output = ".local/qa-file-commands";
await mkdir(output, { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const root = await mkdtemp(join(tmpdir(), "file-commands-"));
  const origin = "http://127.0.0.1:18972",
    f = await handoffFixture(origin);
  f.sessions.config.machines[0].type = "local-linux";
  f.sessions.config.projects[0].workingDirectory = root;
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
    machineClients: { pc: "web" },
  });
  await mkdir(join(root, "target"));
  await writeFile(
    join(root, "README.md"),
    "# Project\n\nA real working file, with a large preview beside a narrow file list.\n",
  );
  await writeFile(join(root, "target/README.md"), "original destination");
  const browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 1366, height: 1024 },
      serviceWorkers: "block",
    });
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18972 });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage(),
      errors = [];
    await page.emulateMedia({ reducedMotion: "reduce" });
    page.on("pageerror", (e) => errors.push(e.message));
    // local-linux download uses POSIX paths. On a Windows fixture host only,
    // supply these fixture bytes; all mutation, collision and receipt APIs stay real.
    if (process.platform === "win32")
      await page.route("**/api/projects/project/files/content?*", async (route) => {
        const path = new URL(route.request().url()).searchParams.get("path");
        assert.equal(path, "README.md");
        await route.fulfill({
          body: await readFile(join(root, path)),
          contentType: "text/markdown",
        });
      });
    await page.route("**/api/projects/project/files/saved?*", (route) =>
      route.fulfill({
        json: { url: "/api/projects/project/files/content?path=README.md", name: "README.md" },
      }),
    );
    await page.goto(origin);
    await page
      .getByRole("textbox", { name: "Сообщение Codex", exact: true })
      .fill("Сохранить черновик");
    await page.getByRole("button", { name: "Файлы проекта", exact: true }).click();
    const files = page.getByRole("dialog", { name: "Файлы проекта", exact: true });
    const action = page.getByRole("dialog", { name: "Действия с файлами", exact: true });
    const batch = page.getByRole("dialog", { name: "Групповая операция", exact: true });
    const folder = async (path) => {
      await files.getByRole("button", { name: "Ввести путь", exact: true }).click();
      await files.getByLabel("Путь в проекте").fill(path);
      await files.getByRole("button", { name: "Открыть папку", exact: true }).click();
    };
    const menu = async (path, command) => {
      await files.getByRole("button", { name: `Действия: ${path}`, exact: true }).click();
      await action.getByRole("button", { name: command, exact: true }).click();
    };
    await files.getByRole("button", { name: /^README.md/ }).click();
    await expect(files.locator(".readable-file")).toContainText("A real working file");
    await expect(
      files.getByRole("button", { name: "Сохранённый результат", exact: true }),
    ).toBeVisible();
    for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      for (const [width, height] of [
        [1366, 1024],
        [768, 1024],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await expect(
          files.getByRole("button", { name: "Закрыть файлы", exact: true }),
        ).toBeVisible();
        assert.equal(await files.locator(":scope > .project-tool-actions").count(), 0);
        const rail = files.getByRole("group", { name: "Действия и вид файла" });
        await expect(rail.locator(".file-text-tools")).toHaveCount(1);
        const buttons = await rail.locator("button").evaluateAll((items) =>
          items.map((item) => {
            const r = item.getBoundingClientRect();
            return { y: r.y, height: r.height, width: r.width };
          }),
        );
        await page.screenshot({ path: `${output}/${engine}-rail-${theme}-${width}.png` });
        assert.ok(buttons.length === 6 || buttons.length === 7); // Speech is absent when the browser has no supported engine.
        assert.ok(
          Math.max(...buttons.map((b) => b.y)) - Math.min(...buttons.map((b) => b.y)) < 2,
          JSON.stringify({ theme, width, buttons }),
        );
        assert.ok(buttons.every((b) => b.height >= 44 && b.width >= 44));
        assert.ok((await rail.boundingBox()).height < 65);
        await page.screenshot({ path: `${output}/${engine}-locked-${theme}-${width}.png` });
      }
    }
    await files.getByRole("button", { name: "Исходный текст", exact: true }).click();
    await expect(files.locator(".readable-file .file-text")).toContainText("# Project");
    await files.getByRole("button", { name: "Перенос строк", exact: true }).click();
    await expect(files.locator(".readable-file .file-text")).toHaveAttribute("data-wrap", "false");
    await files.getByRole("button", { name: "Сохранённый результат", exact: true }).click();
    await expect(page.locator(".file-viewer-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
    await expect(files.locator(".readable-file .file-text")).toHaveAttribute("data-wrap", "false");
    await files.getByRole("button", { name: "Исходный текст", exact: true }).click();
    await files.getByRole("button", { name: "Разблокировать файлы", exact: true }).click();
    await files.getByRole("button", { name: "Закрыть файл", exact: true }).click();
    // Create a directory, rename it, then use its ordinary per-item menu to copy.
    await files.getByRole("button", { name: "Новая папка", exact: true }).click();
    await action.getByRole("textbox", { name: "Имя файла или папки" }).fill("created");
    await action.getByRole("button", { name: "Создать", exact: true }).click();
    await menu("created", "Переименовать");
    await action.getByRole("textbox", { name: "Имя файла или папки" }).fill("renamed");
    await action.getByRole("button", { name: "Переименовать", exact: true }).click();
    await files.getByRole("button", { name: /^README.md/ }).click({ button: "right" });
    await action.getByRole("button", { name: "Копировать", exact: true }).click();
    await folder("target");
    await files.getByRole("button", { name: /^Вставить сюда/ }).click();
    await batch.getByRole("button", { name: "Выполнить", exact: true }).click();
    await expect(batch).toContainText("уже существует");
    assert.equal(await readFile(join(root, "target/README.md"), "utf8"), "original destination");
    await batch.getByRole("button", { name: "Сохранить оба", exact: true }).click();
    await batch.getByRole("button", { name: "Выполнить", exact: true }).click();
    await expect(batch.getByRole("region", { name: "README.md", exact: true })).toContainText(
      "Готово",
    );
    await batch.getByRole("button", { name: "Завершить", exact: true }).click();
    assert.equal(
      await readFile(join(root, "target/README (копия).md"), "utf8"),
      await readFile(join(root, "README.md"), "utf8"),
    );
    await folder("");
    await menu("renamed", "Вырезать");
    await folder("target");
    await files.getByRole("button", { name: /^Вставить сюда/ }).click();
    await batch.getByRole("button", { name: "Выполнить", exact: true }).click();
    await expect(batch.getByRole("region", { name: "renamed", exact: true })).toContainText(
      "Готово",
    );
    await batch.getByRole("button", { name: "Завершить", exact: true }).click();
    await menu("renamed", "Удалить");
    await action.getByRole("button", { name: "Удалить", exact: true }).click();
    await expect(files.getByRole("button", { name: "Действия: renamed", exact: true })).toHaveCount(
      0,
    );
    await folder("");
    await files.getByRole("button", { name: /^README.md/ }).click();
    for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      for (const [width, height] of [
        [1366, 1024],
        [768, 1024],
        [390, 844],
        [390, 430],
      ]) {
        await page.setViewportSize({ width, height });
        await expect(files.getByRole("button", { name: "Новая папка", exact: true })).toBeVisible();
        if (width > 600) {
          await files.locator(":scope > header").focus();
          await page.keyboard.press("Home");
        }
        await expect
          .poll(async () => {
            const bounds = await files.boundingBox();
            return bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1;
          })
          .toBe(true);
        await page.screenshot({
          path: `${output}/${engine}-preview-${theme}-${width}-${height}.png`,
        });
      }
    }
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Сообщение Codex", exact: true })).toHaveValue(
      "Сохранить черновик",
    );
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: PASS compact commands, mkdir/rename, single copy collision, cut/paste/delete, preview layouts and draft`,
    );
  } finally {
    await browser.close();
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
}
