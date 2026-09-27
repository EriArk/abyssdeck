import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const engine = process.env.BROWSER ?? "chromium",
  origin = "http://127.0.0.1:18945";
const f = await handoffFixture(origin);
f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
f.sessions.config.projects[0].name = "Длинное название проекта · Команда";
f.store.setPreferences({
  projectId: "project",
  threadId: f.thread.id,
  view: "chat",
  theme: "crt-green",
});
const browser = await (engine === "webkit" ? webkit : chromium).launch(),
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: "block",
  });
await mkdir(".local/qa-navigation", { recursive: true });
try {
  await f.app.listen({ host: "127.0.0.1", port: 18945 });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.route("**/api/gpt/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/gpt/status")
      return route.fulfill({ json: { configured: true, canSend: true, state: "healthy" } });
    if (path === "/api/gpt/models")
      return route.fulfill({
        json: {
          models: [{ id: "Latest", label: "Latest" }],
          efforts: [{ id: "2", label: "High" }],
          currentModel: "Latest",
          currentEffort: "2",
        },
      });
    return route.fulfill({
      json: { items: [], conversations: [], projects: [], nextOffset: null, blocked: false },
    });
  });
  await page.goto(origin);
  const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
  await composer.fill("Исходный черновик вторая строка");
  await expect.poll(() => f.store.preferences().shortcuts ?? {}).toEqual({});
  const key = async (code, extras = {}) =>
    page.evaluate(
      ({ code, extras }) => {
        const e = new KeyboardEvent("keydown", {
          code,
          key: code === "KeyK" ? "л" : "x",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
          ...extras,
        });
        document.activeElement.dispatchEvent(e);
        return e.defaultPrevented;
      },
      { code, extras },
    );
  await expect.poll(async () => key("KeyK")).toBe(true);
  const palette = page.getByRole("dialog", { name: "Поиск и команды", exact: true }),
    search = palette.getByRole("combobox");
  await expect(search).toBeFocused();
  await search.fill("Длинное");
  await expect(palette.getByRole("option", { name: /Длинное.*Проект · Codex/ })).toBeVisible();
  await palette
    .getByRole("button", { name: "Закрепить: Длинное название проекта · Команда", exact: true })
    .first()
    .click();
  await expect.poll(() => f.store.preferences().navigationPlaces?.pinned.length).toBe(1);
  await palette.getByRole("option", { name: /Длинное.*Проект · Codex/ }).click();
  const home = page.locator(".project-overview-modal");
  await expect(home).toBeVisible();
  await home.getByRole("button", { name: "Закрыть обзор проекта" }).click();
  await composer.focus();
  await key("KeyK");
  await page.keyboard.press("Escape");
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("Исходный черновик вторая строка");
  for (const extras of [{ repeat: true }, { isComposing: true }])
    assert.equal(await key("KeyK", extras), false);
  assert.equal(await key("KeyS"), false);
  assert.equal(await key("KeyK", { ctrlKey: false }), false);
  await composer.evaluate((el) => (el.dataset.helpKeys = "remote"));
  assert.equal(await key("KeyK"), false);
  await composer.evaluate((el) => delete el.dataset.helpKeys);
  assert.equal(await key("KeyG", { altKey: true }), true);
  await expect(page.locator(".gpt-workspace")).toBeVisible();
  await page.locator("body").click({ position: { x: 2, y: 2 }, force: true });
  assert.equal(await key("KeyG", { altKey: true }), true);
  await expect(composer).toHaveValue("Исходный черновик вторая строка");
  await key("KeyK");
  await search.fill("Настройки");
  await search.press("Enter");
  const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
  await settings.locator('[data-category="appearance"]').click();
  const shortcuts = settings.getByRole("region", { name: "Горячие клавиши" });
  const row = shortcuts.locator(".shortcut-row").filter({ hasText: "Поиск и команды" });
  await row.getByRole("button").first().click();
  await page.keyboard.press("Control+r");
  await expect(shortcuts.getByRole("alert")).toContainText("оставлено");
  await page.keyboard.press("Control+Alt+g");
  await expect(shortcuts.getByRole("alert")).toContainText("уже назначено");
  await page.keyboard.press("Control+Shift+k");
  await expect.poll(() => f.store.preferences().shortcuts?.palette).toBe("Primary+Shift+KeyK");
  await settings.getByRole("button", { name: "Закрыть настройки" }).click();
  await composer.focus();
  assert.equal(await key("KeyK"), false);
  assert.equal(await key("KeyK", { shiftKey: true }), true);
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(composer).toBeVisible();
  await expect.poll(async () => key("KeyK", { shiftKey: true })).toBe(true);
  await expect(palette).toBeVisible();
  await search.fill("Длинное");
  await expect(palette.getByRole("option", { name: /Длинное.*Проект · Codex/ })).toBeVisible();
  for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    for (const [label, width, height] of [
      ["phone", 390, 844],
      ["keyboard", 390, 400],
      ["tablet", 820, 900],
      ["desktop", 1366, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      const box = await palette.boundingBox(),
        close = await palette
          .getByRole("button", { name: "Закрыть поиск и команды" })
          .boundingBox();
      assert(
        box.x >= 0 &&
          box.x + box.width <= width + 1 &&
          box.y >= 0 &&
          box.y + box.height <= height + 1,
        JSON.stringify({ theme, width, height, box }),
      );
      assert(close.y >= 0 && close.y + close.height <= height);
      assert(await palette.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: `.local/qa-navigation/${engine}-${theme}-${label}.png` });
    }
  }
  await search.focus();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
  const places = page
    .getByRole("region", { name: "Недавнее и закреплённое" })
    .filter({ visible: true });
  await expect(places.getByRole("button", { name: /Длинное.*Проект · Codex/ })).toBeVisible();
  f.sessions.catalog.library.save("project", "project", { deleted: true });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("library-changed", {
        detail: { client: "codex", kind: "project", id: "project", name: "", action: "delete" },
      }),
    ),
  );
  await expect(places).toHaveCount(0);
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: commands, physical Russian keys, draft/client continuity, protected focus, shortcut conflicts/persistence, private pins/revocation and 16 themed layouts passed`,
  );
} finally {
  await context.close();
  await browser.close();
  await f.close();
}
