import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

await mkdir(".local/qa-window-dock", { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const root = await mkdtemp(join(tmpdir(), "window-dock-")),
    origin = "http://127.0.0.1:18971";
  await mkdir(join(root, "second"));
  const f = await handoffFixture(origin, undefined, {
    configure(config) {
      config.projects.push({
        id: "second",
        name: "Second project",
        machineId: "pc",
        workingDirectory: join(root, "second"),
        enabled: true,
      });
    },
  });
  f.sessions.config.machines[0].type = "local-linux";
  f.sessions.config.projects[0].workingDirectory = root;
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
    machineClients: { pc: "web" },
  });
  const content = "# Dock document\n\n" + "Text to keep the reading position.\n\n".repeat(90);
  await writeFile(join(root, "dock.md"), content);
  const browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 1366, height: 1000 },
      serviceWorkers: "block",
    });
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18971 });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/projects/*/files/content?*", (route) =>
      route.fulfill({ body: content, contentType: "text/markdown" }),
    );
    await page.goto(origin);
    const composer = page.getByRole("textbox", { name: "Сообщение Codex", exact: true });
    await composer.fill("Черновик до сворачивания");
    await composer.blur();
    const workspaceBefore = await page.locator(".workspace-content").boundingBox();
    await page.getByRole("button", { name: "Файлы проекта", exact: true }).click();
    const files = page.getByRole("dialog", { name: "Файлы проекта", exact: true });
    await expect(files.getByRole("button", { name: "Свернуть окно", exact: true })).toBeVisible();
    await files.locator(":scope > header").focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("ArrowRight");
    const original = await files.boundingBox();
    await files.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await expect(files).toBeHidden();
    await expect(page.locator(".window-dock")).toBeVisible();
    assert.equal(await page.locator("dialog[open]").count(), 0, "minimize releases native modal");
    await composer.fill("Работаем в чате, окно свёрнуто");
    assert.deepEqual(
      await page.locator(".workspace-content").boundingBox(),
      workspaceBefore,
      "dock never shifts chat",
    );
    await page.getByRole("button", { name: /Восстановить: Файлы/ }).click();
    await expect(files).toBeVisible();
    assert.deepEqual(await files.boundingBox(), original, "geometry retained");
    await files.getByRole("button", { name: /^dock.md/ }).click();
    await files.getByRole("button", { name: "Открыть файл", exact: true }).click();
    const viewer = page.getByRole("dialog", { name: "Просмотр файла", exact: true });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await expect(viewer).toBeHidden();
    await expect(files).toBeHidden();
    assert.equal(
      await page.locator("dialog[open]").count(),
      0,
      "whole nested group releases modality",
    );
    await page.getByRole("button", { name: /Восстановить: dock.md/ }).click();
    await expect(viewer).toBeVisible();
    await expect(files).toBeVisible();
    await viewer.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
    await expect(files).toBeVisible();
    await files.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await page.getByRole("button", { name: "Убрать док к перегородке" }).click();
    await page.getByRole("button", { name: /Развернуть док:/ }).click();
    // An ordinary launcher restores the same mounted tool.
    await page.getByRole("button", { name: "Файлы проекта", exact: true }).click();
    await expect(files).toBeVisible();
    assert.equal(await page.locator(".project-tool-window").count(), 1);
    await files.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await page.locator(".desktop-nav").locator('.nav-project[data-project-id="second"]').click();
    await page.getByRole("button", { name: /Восстановить: Файлы/ }).click();
    await expect(files).toHaveAttribute("data-window-source", "project");
    await expect(files.locator(":scope > header small")).toHaveText("Project");
    await files.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await page.locator(".desktop-nav").locator('.nav-project[data-project-id="project"]').click();
    await page.getByRole("button", { name: "Переключиться на GPT" }).click();
    await expect(page.locator(".gpt-workspace")).toBeVisible();
    await page.getByRole("button", { name: /Восстановить: Файлы/ }).click();
    await expect(files).toHaveAttribute("data-window-source", "project");
    await expect(files.getByRole("button", { name: /^dock.md/ })).toBeVisible();
    await files.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await page.getByRole("button", { name: "Переключиться на Codex" }).click();
    await expect(composer).toBeVisible();
    const dockFile = page.getByRole("button", { name: /Восстановить: Файлы/ });
    await dockFile.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 7 });
    await page.waitForTimeout(500);
    await dockFile.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 7 });
    await dockFile.dispatchEvent("click");
    await expect(files).toBeHidden();
    await expect(page.getByRole("tooltip")).toContainText("Project");
    await composer.focus();
    await composer.blur();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
    await settings.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await expect(settings).toBeHidden();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Закрыть настройки", exact: true }).click();
    for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.screenshot({
        path: ".local/qa-window-dock/" + engine + "-" + theme + ".png",
        animations: "disabled",
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(files).toBeVisible();
    await expect(page.locator(".window-dock")).toBeHidden();
    await expect(files.getByRole("button", { name: "Свернуть окно", exact: true })).toBeHidden();
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await expect(composer).toHaveValue("Работаем в чате, окно свёрнуто");
    // Regression: iPad keyboard updates layout and visual metrics out of phase.
    await page.setViewportSize({ width: 1366, height: 1000 });
    await composer.focus();
    await page.evaluate(() => {
      window.__dockLayoutHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 18 });
      Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 460 });
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue("--app-height")),
      )
      .toBe("460px");
    const layout = await page.locator(".workspace").boundingBox();
    assert(layout.height > 400, "workspace does not collapse to layout transient");
    await expect(composer).toBeVisible();
    await expect(composer).toBeInViewport();
    await page.screenshot({ path: `.local/qa-window-dock/${engine}-keyboard.png` });
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 0 });
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(60);
    assert.equal(
      await page.evaluate(() => document.documentElement.style.getPropertyValue("--app-height")),
      "460px",
      "zero restoring sample ignored",
    );
    await page.evaluate(() => {
      delete window.visualViewport.height;
      delete window.innerHeight;
      window.dispatchEvent(new Event("pageshow"));
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          parseFloat(document.documentElement.style.getPropertyValue("--app-height")),
        ),
      )
      .toBe(1000);
    if (errors.length) throw Error(JSON.stringify(errors));
    console.log(
      engine +
        ": PASS dock, nested modality, drafts, source state, responsive dock and keyboard viewport",
    );
  } finally {
    await browser.close();
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
}
