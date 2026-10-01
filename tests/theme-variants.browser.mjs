import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const families = [
  ["organizer", "organizerVariant", ["light", "dark"]],
  ["crt-green", "crtVariant", ["green", "dark", "light"]],
  ["hitech-2000s", "hitechVariant", ["light", "dark"]],
  ["classic-dark", "classicVariant", ["dark", "light"]],
];
const names = { light: "Светлый", dark: "Тёмный", green: "Зелёный" };
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18937",
    f = await handoffFixture(origin);
  const out = `.local/qa-theme-variants/${engine}`;
  await mkdir(out, { recursive: true });
  f.store.db
    .prepare("UPDATE threads SET origin='web', title='Проверка оформления' WHERE id=?")
    .run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "organizer",
    view: "chat",
    machineClients: { pc: "web" },
  });
  f.store.append(
    f.thread.id,
    "assistant.completed",
    {
      id: "answer",
      phase: "final_answer",
      text: "## Работа продолжается\n\nНастройки сохранены. Файлы и сообщения доступны в этом же окне.\n\n```ts\nconst ready = true;\n```\n\n| Состояние | Результат |\n| --- | --- |\n| Проверка | Успешно |",
    },
    "turn",
  );
  f.store.append(f.thread.id, "turn.completed", { id: "turn", status: "completed" }, "turn");
  const browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      serviceWorkers: "block",
    });
  const [name, value] = f.headers.cookie.split("=");
  const cookie = { name, value, url: origin, httpOnly: true, sameSite: "Strict" };
  await context.addCookies([cookie]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const button = (name) =>
    page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
  const settings = async () => {
    if (!(await button("Настройки").isVisible())) await button("Открыть проекты").click();
    await button("Настройки").click();
    await page.locator('.settings-browser[open] [data-category="appearance"]').click();
  };
  const close = async () => {
    await button("Закрыть настройки").click();
    if (await button("Закрыть проекты").isVisible()) await button("Закрыть проекты").click();
  };
  try {
    await f.app.listen({ port: 18937, host: "127.0.0.1" });
    for (const key of ["organizerVariant", "hitechVariant", "classicVariant"]) {
      const bad = await f.app.inject({
        method: "PATCH",
        url: "/api/preferences",
        headers: f.headers,
        payload: { [key]: "green" },
      });
      assert.equal(bad.statusCode, 400);
    }
    await page.goto(origin);
    await expect(page.locator("html")).toHaveAttribute("data-theme-variant", "light");
    await page.getByPlaceholder("Что нужно сделать?").fill("Черновик остаётся при смене варианта");
    for (const [family, key, variants] of families) {
      await settings();
      await page.locator(`.theme-option.${family} input`).check();
      await expect(page.locator("html")).toHaveAttribute("data-theme-variant", variants[0]);
      const caseColor = await page.locator("html").getAttribute("data-case-color");
      for (const variant of variants) {
        await page
          .locator(".theme-variant-options")
          .getByRole("button", { name: names[variant], exact: true })
          .click();
        await expect(page.locator(".theme-variant-picker")).toBeEnabled();
        await expect(page.locator("html")).toHaveAttribute("data-theme-variant", variant);
        assert.equal(await page.locator("html").getAttribute("data-case-color"), caseColor);
        await page.screenshot({ path: `${out}/${family}-${variant}-settings.png` });
        await close();
        for (const [width, height] of [
          [393, 852],
          [1366, 1024],
          [1600, 1000],
        ]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => document.fonts.ready);
          await expect(page.getByPlaceholder("Что нужно сделать?")).toHaveValue(
            "Черновик остаётся при смене варианта",
          );
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          assert.equal(
            await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
            variant === "light" ? "light" : "dark",
          );
          await page.screenshot({
            path: `${out}/${family}-${variant}-${width}.png`,
            animations: "disabled",
          });
        }
        await page.setViewportSize({ width: 393, height: 852 });
        await settings();
      }
      assert.equal(f.store.preferences()[key], variants.at(-1));
      await close();
    }
    // Each family's last choice survives family switches and a new device.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme-variant", "light");
    await settings();
    for (const [family, , variants] of families) {
      await page.locator(`.theme-option.${family} input`).check();
      await expect(page.locator("html")).toHaveAttribute("data-theme-variant", variants.at(-1));
    }
    // Rejected writes restore both current DOM and cached preference.
    await page.route("**/api/preferences", (r) =>
      r.request().method() === "PATCH"
        ? r.fulfill({ status: 503, json: { message: "Unavailable" } })
        : r.continue(),
    );
    await page
      .locator(".theme-variant-options")
      .getByRole("button", { name: "Тёмный", exact: true })
      .click();
    await expect(page.locator(".theme-variant-picker [role=alert]")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme-variant", "light");
    await page.unroute("**/api/preferences");
    const fresh = await browser.newContext({ serviceWorkers: "block" });
    try {
      await fresh.addCookies([cookie]);
      const other = await fresh.newPage();
      await other.goto(origin);
      await expect(other.locator("html")).toHaveAttribute("data-theme", "classic-dark");
      await expect(other.locator("html")).toHaveAttribute("data-theme-variant", "light");
    } finally {
      await fresh.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: nine variants, three viewports, legacy defaults, independent memory, Hub persistence, fresh device and rejected-save recovery passed`,
    );
  } catch (e) {
    await page.screenshot({ path: `${out}/failure.png` });
    throw e;
  } finally {
    await context.close();
    await browser.close();
    await f.close();
  }
}
