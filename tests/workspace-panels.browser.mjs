import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const output = ".local/qa-workspace-panels";
await mkdir(output, { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18973";
  const f = await handoffFixture(origin);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
    machineClients: { pc: "web" },
  });
  const browser = await type.launch();
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18973 });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 1000 },
      serviceWorkers: "block",
    });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    const composer = page.getByRole("textbox", { name: "Сообщение Codex", exact: true });
    await composer.fill("Черновик при движении панелей");
    await composer.blur();
    for (const client of ["Codex", "GPT"]) {
      if (client === "GPT")
        await page.getByRole("button", { name: "Переключиться на GPT" }).click();
      const root = page.locator(
        client === "GPT" ? ".gpt-workspace" : ".workspace:not(.gpt-workspace)",
      );
      await expect(root).toBeVisible();
      for (const side of ["left", "right"]) {
        const pane = root.locator(
          side === "left" ? ":scope > .desktop-nav" : ":scope > .workspace-content > .support-pane",
        );
        const button = root.getByRole("button", {
          name: side === "left" ? "Открыть проекты" : "Скрыть правую панель",
          exact: true,
        });
        await expect(pane).toBeVisible();
        await page.waitForTimeout(800);
        const before = (await pane.boundingBox()).width;
        await button.evaluate((node) => node.click());
        const samples = await pane.evaluate(async (node) => {
          const widths = [];
          const start = performance.now();
          while (performance.now() - start < 320) {
            widths.push(node.getBoundingClientRect().width);
            await new Promise(requestAnimationFrame);
          }
          return widths;
        });
        assert(
          samples.some((width) => width > 5 && width < before - 5),
          `${client} ${side} has intermediate widths: ${samples}`,
        );
        await expect(pane).toBeHidden();
        assert(await pane.evaluate((n) => n.inert), "collapsed content cannot take focus");
        const reveal = root.getByRole("button", {
          name: side === "left" ? "Открыть проекты" : "Показать правую панель",
          exact: true,
        });
        await reveal.click();
        await expect.poll(async () => (await pane.boundingBox()).width).toBeGreaterThan(before - 2);
        // Repeated state changes keep the latest choice and do not recreate panes.
        await root
          .locator(side === "left" ? ".menu-button" : ".wide-pane-control")
          .evaluate(async (node) => {
            node.click();
            await new Promise((r) => setTimeout(r, 60));
            node.click();
          });
        await expect(pane).toBeVisible();
        await page.waitForTimeout(300);
        assert.equal(await pane.evaluate((n) => n.inert), false);
      }
      const divider = root.getByRole("separator", { name: "Ширина результатов" });
      await divider.focus();
      const width = Number(await divider.getAttribute("aria-valuenow"));
      await page.keyboard.press("ArrowLeft");
      await expect(divider).toHaveAttribute("aria-valuenow", String(width + 2));
      assert.equal(await divider.evaluate((n) => getComputedStyle(n).backgroundImage), "none");
      await divider.blur();
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        await page.screenshot({
          path: `${output}/${engine}-${client}-${theme}.png`,
          animations: "disabled",
        });
      }
    }
    await page.getByRole("button", { name: "Переключиться на Codex" }).click();
    await expect(composer).toHaveValue("Черновик при движении панелей");
    await page.getByRole("button", { name: "Файлы проекта", exact: true }).click();
    const files = page.getByRole("dialog", { name: "Файлы проекта", exact: true });
    await expect(files).toBeVisible();
    await page.waitForTimeout(200);
    const box = await files.boundingBox();
    await files.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await expect(files).toBeHidden();
    await page.getByRole("button", { name: /Восстановить: Файлы/ }).click();
    await expect(files).toBeVisible();
    assert.deepEqual(await files.boundingBox(), box, "animation never changes saved geometry");
    await files
      .getByRole("button", { name: "Закрыть файлы", exact: true })
      .evaluate((n) => n.click());
    assert(
      await files.evaluate((n) => n.getAnimations().some((a) => a.playState === "running")),
      "close animates before unmount",
    );
    await expect(files).toBeHidden();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
    await expect(page.locator(".desktop-nav")).toBeHidden();
    assert.equal(await page.locator(".workspace").getAttribute("data-panels-moving"), null);
    await page.getByRole("button", { name: "Скрыть правую панель", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
    await expect(page.locator(".project-sheet")).toBeVisible();
    assert.equal(await page.locator(".project-sheet").evaluate((n) => n.inert), false);
    await page.getByRole("button", { name: "Закрыть проекты", exact: true }).click();
    await page
      .locator(".mobile-tabs")
      .getByRole("button", { name: "Результаты", exact: true })
      .click();
    await expect(page.locator(".support-pane")).toBeVisible();
    assert.equal(await page.locator(".support-pane").evaluate((n) => n.inert), false);
    for (const [size, viewport] of [
      ["phone", { width: 390, height: 844 }],
      ["tablet-keyboard", { width: 820, height: 520 }],
    ]) {
      await page.setViewportSize(viewport);
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        await page.screenshot({
          path: `${output}/${engine}-${size}-${theme}.png`,
          animations: "disabled",
        });
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: PASS panel motion, rapid toggles, focus, resize, themes, window lifecycle, draft and reduced motion`,
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
