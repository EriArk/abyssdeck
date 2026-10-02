import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const out = ".local/qa-window-geometry";
await mkdir(out, { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const root = await mkdtemp(join(tmpdir(), "window-geometry-")),
    origin = "http://127.0.0.1:18970";
  const f = await handoffFixture(origin);
  f.sessions.config.machines[0].type = "local-linux";
  f.sessions.config.projects[0].workingDirectory = root;
  f.sessions.config.projects[0].name = "Проект с очень длинным названием для проверки заголовка";
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
    machineClients: { pc: "web" },
  });
  await writeFile(
    join(root, "example.md"),
    "# Документ\n\nТекст и исходный чат сохраняются при изменении окна.\n\n".repeat(30),
  );
  const browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      hasTouch: true,
      serviceWorkers: "block",
    });
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18970 });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/projects/project/files/content?*", async (route) =>
      route.fulfill({
        body: await readFile(join(root, "example.md")),
        contentType: "text/markdown",
      }),
    );
    await page.goto(origin);
    const composer = page.getByLabel("Сообщение Codex", { exact: true });
    await composer.fill("Черновик под окнами");
    await composer.blur();
    const openFiles = () =>
      page.getByRole("button", { name: "Файлы проекта", exact: true }).click();
    await openFiles();
    const files = page.getByRole("dialog", { name: "Файлы проекта", exact: true });
    const header = files.locator(":scope > header");
    await expect(files).toHaveAttribute("data-window-movable", "true");
    const box = () => files.boundingBox();
    const same = async (locator, expected) => {
      await expect
        .poll(async () => {
          const actual = await locator.boundingBox();
          return Math.max(
            ...["x", "y", "width", "height"].map((k) => Math.abs(actual[k] - expected[k])),
          );
        })
        .toBeLessThan(2);
    };
    const saved = () =>
      page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([k]) => k.includes("codex-window:v1:")),
        ),
      );
    const drag = async (locator, dx, dy, cancel = false) => {
      const b = await locator.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 4 });
      if (cancel) await page.keyboard.press("Escape");
      await page.mouse.up();
    };
    const initial = await box();
    await drag(header, 30, 20);
    const moved = await box();
    assert(
      Math.abs(moved.x - initial.x - 30) < 2 && Math.abs(moved.y - initial.y - 20) < 2,
      "header drag moves window",
    );
    await drag(header, -50, -20, true);
    await same(files, moved);
    await expect(files).toBeVisible();
    for (const direction of ["e", "s", "w", "n", "ne", "nw", "sw", "se"]) {
      const before = await box();
      await drag(
        files.locator(`.window-resize-grip[data-direction="${direction}"]`),
        direction.includes("w") ? 12 : -12,
        direction.includes("n") ? 12 : -12,
      );
      const after = await box();
      if (/[ew]/.test(direction)) assert(after.width < before.width - 8, `${direction} width`);
      if (/[ns]/.test(direction)) assert(after.height < before.height - 8, `${direction} height`);
    }
    const preferred = await box(),
      storage = await saved();
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await openFiles();
    await same(files, preferred);
    await files.getByRole("button", { name: /^example.md/ }).click();
    assert(
      (await files.locator(".file-browser-detail").boundingBox()).width >
        (await files.locator(".file-browser-main").boundingBox()).width,
      "preview gets more room than file list",
    );
    await files.getByRole("button", { name: "Открыть файл", exact: true }).click();
    const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
    const viewerHeader = viewer.locator(":scope > header");
    await expect(viewer).toHaveAttribute("data-window-movable", "true");
    await viewerHeader.focus();
    await viewerHeader.press("Shift+ArrowLeft");
    await viewerHeader.press("ArrowRight");
    const viewerBox = await viewer.boundingBox();
    await viewer.getByRole("button", { name: "Развернуть окно", exact: true }).click();
    await expect(viewer).toHaveAttribute("data-window-movable", "false");
    assert((await viewer.boundingBox()).width > viewerBox.width);
    await viewer.getByRole("button", { name: "Восстановить окно", exact: true }).click();
    await same(viewer, viewerBox);
    await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
    await same(files, preferred);
    assert.equal(
      Object.entries(await saved()).find(([k]) => k.endsWith(":project-files"))[1],
      Object.values(storage)[0],
    );
    // Saved wide geometry survives phone/keyboard constraints, theme switches and restoration.
    for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      for (const [width, height] of [
        [1440, 1000],
        [768, 600],
        [390, 844],
        [390, 430],
      ]) {
        await page.setViewportSize({ width, height });
        await expect(files).toHaveAttribute("data-window-movable", String(width > 600));
        await expect
          .poll(
            async () => {
              const b = await box();
              return (
                b.x >= -1 && b.y >= -1 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1
              );
            },
            { message: `visible ${theme} ${width}x${height}` },
          )
          .toBe(true);
        const close = files.getByRole("button", { name: "Закрыть файлы", exact: true });
        await expect(close).toBeInViewport();
        await page.screenshot({
          path: `${out}/${engine}-${theme}-${width}x${height}.png`,
          animations: "disabled",
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await same(files, preferred);
    // Narrow resizable desktop window switches the file preview into a usable single pane.
    await header.focus();
    for (let i = 0; i < 28; i++) await header.press("Shift+ArrowLeft");
    assert.equal(
      await files.locator(".file-browser-detail").evaluate((el) => getComputedStyle(el).position),
      "absolute",
    );
    assert.equal(
      await files
        .locator(".file-browser-detail")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
    );
    await header.press("Home");
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await expect(composer).toHaveValue("Черновик под окнами");
    await openFiles();
    await same(files, initial);
    // Reload restores a committed placement, not the clamped phone size.
    await header.focus();
    await header.press("ArrowLeft");
    const reloadBox = await box();
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await page.reload();
    await openFiles();
    await same(files, reloadBox);
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
    await expect(settings).toHaveAttribute("data-window-movable", "true");
    const beforeSettings = await settings.boundingBox();
    await settings.locator(".settings-heading").focus();
    await settings.locator(".settings-heading").press("Shift+ArrowLeft");
    assert((await settings.boundingBox()).width < beforeSettings.width);
    if (engine === "chromium") {
      const cdp = await context.newCDPSession(page);
      const b = await settings.locator(".settings-heading").boundingBox();
      const x = b.x + b.width / 2,
        y = b.y + b.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - 80, y: y + 15 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(settings).toBeVisible();
      assert(
        (await settings.boundingBox()).x < beforeSettings.x - 60,
        "touch drag does not become close swipe",
      );
      await cdp.detach();
    }
    await settings.getByRole("button", { name: "Закрыть настройки", exact: true }).click();
    assert(!f.calls.some((c) => c.method === "turn/start"));
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: eight resize handles, drag/cancel, keyboard, persistence/reload, nested/fullscreen viewer, settings, narrow preview and four themes passed`,
    );
  } finally {
    await context.close();
    await browser.close();
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
}
