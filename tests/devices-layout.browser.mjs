import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { devicesFixture } from "./devices-fixture.mjs";

const origin = "http://127.0.0.1:18883";
const out = process.env.DEVICES_LAYOUT_OUTPUT ?? ".local/qa-devices-layout";
await mkdir(out, { recursive: true });
for (const type of [chromium, webkit]) {
  if (process.env.DEVICES_LAYOUT_ENGINE && process.env.DEVICES_LAYOUT_ENGINE !== type.name())
    continue;
  const f = await devicesFixture(origin);
  console.log(type.name(), "fixture ready");
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.sessions.config.devices.push({
    id: "workspace",
    name: "Моё серверное окружение с длинным названием",
    platform: "linux",
    shell: "powershell",
    ssh: { target: "unused", configFile: "/private/ssh/config" },
    power: false,
    mounts: false,
  });
  const preferences = {
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    machineClients: { pc: "web" },
  };
  f.store.setPreferences(preferences);
  const browser = await type.launch();
  console.log(type.name(), "browser ready");
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
    hasTouch: true,
    serviceWorkers: "block",
  });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage();
  console.log(type.name(), "page ready");
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const modal = page.locator(".devices-workspace");
  const button = (name) =>
    modal.getByRole("button", { name, exact: true }).filter({ visible: true });
  const device = modal.getByRole("combobox", { name: "Устройство", exact: true });
  const session = modal.getByRole("combobox", { name: "Сессия терминала", exact: true });
  const command = modal.getByRole("textbox", { name: "Команда терминала" });
  async function shot(name, description) {
    if (type !== chromium) return;
    await modal.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
    await writeFile(
      `${out}/${name}.md`,
      `# ${description}\n\n![${description}](${name}.png)\n\nРабочие React-компоненты на изолированных демонстрационных устройствах и PTY. Chromium, ${page.viewportSize().width} × ${page.viewportSize().height}. Реальные команды и SSH не использовались; это не проверка физического устройства.\n`,
    );
  }
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18883 });
    await page.goto(origin);
    console.log(type.name(), "app ready");
    await page
      .getByRole("button", { name: "Открыть устройства", exact: true })
      .filter({ visible: true })
      .click();
    await expect(modal.locator(".device-os")).toContainText("Ubuntu");
    await button("Открыть терминал").click();
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    const firstSession = await session.inputValue();
    await button("Ввести команду").click();
    await command.fill("server draft");
    await button("Новый терминал").click();
    await expect.poll(() => f.processes.length).toBe(2);
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    await button("Ввести команду").click();
    await expect(command).toHaveValue("");
    await command.fill("second draft");
    const secondSession = await session.inputValue();
    await session.selectOption(firstSession);
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    await button("Ввести команду").click();
    await expect(command).toHaveValue("server draft");
    await device.selectOption("pc");
    await button("Открыть терминал").click();
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    await button("Ввести команду").click();
    await expect(command).toHaveValue("");
    await command.fill("pc draft");
    await device.selectOption("server");
    await expect(session).toHaveValue(firstSession);
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    await button("Ввести команду").click();
    await expect(command).toHaveValue("server draft");
    await button("Ввести пароль").click();
    await modal.getByLabel("Пароль терминала", { exact: true }).fill("PRIVATE-DEMO");
    await device.selectOption("pc");
    await device.selectOption("server");
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    await button("Ввести пароль").click();
    await expect(modal.getByLabel("Пароль терминала", { exact: true })).toHaveValue("");
    await button("Отмена").click();
    assert(
      !JSON.stringify(await page.evaluate(() => [localStorage, sessionStorage])).includes(
        "PRIVATE-DEMO",
      ),
    );
    assert(
      f.processes.every((p) => !p.writes.length),
      "navigation and drafts never send input",
    );
    await button("Другие клавиши").click();
    await button("Esc").click();
    await expect.poll(() => f.processes[0].writes.join("")).toBe("\u001b");
    await button("Другие клавиши").click();
    await button("Действия устройства").click();
    await button("Перезагрузка").click();
    await expect(page.locator(".device-action-dialog")).toContainText("Перезагрузить · Сервер");
    await page
      .getByRole("button", { name: "Отмена", exact: true })
      .filter({ visible: true })
      .click();
    assert.equal(f.processes.length, 3);
    await button("Действия терминала").click();
    await button("Завершить терминал").click();
    await expect(page.locator(".device-action-dialog")).toContainText("Завершить терминал");
    await page
      .getByRole("button", { name: "Отмена", exact: true })
      .filter({ visible: true })
      .click();
    assert(!f.processes[0].killed);
    await session.selectOption(secondSession);
    await button("Действия терминала").click();
    await button("Завершить терминал").click();
    await page.getByRole("button", { name: "Завершить", exact: true }).click();
    await expect.poll(() => f.processes[1].killed).toBe(true);
    assert(!f.processes[0].killed && !f.processes[2].killed);
    await session.selectOption(firstSession);
    await button("Свернуть сведения").click();
    await expect(modal.locator(".device-system")).toBeHidden();
    await button("Показать сведения").click();
    const divider = modal.getByRole("separator", { name: "Ширина сведений об устройстве" });
    await divider.focus();
    const beforeWidth = Number(await divider.getAttribute("aria-valuenow"));
    await page.keyboard.press("ArrowRight");
    await expect(divider).toHaveAttribute("aria-valuenow", String(beforeWidth + 16));
    for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
      console.log(type.name(), "layout", theme);
      await page.setViewportSize({ width: 1366, height: 1024 });
      f.store.setPreferences({ ...preferences, theme });
      await page.reload();
      await page
        .getByRole("button", { name: "Открыть устройства", exact: true })
        .filter({ visible: true })
        .click();
      await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
      for (const [width, height] of [
        [1366, 1024],
        [768, 1024],
        [390, 844],
        [320, 700],
        [390, 430],
      ]) {
        await page.setViewportSize({ width, height });
        if (width <= 700 && height > 560) await button("Терминал").click();
        await expect(modal.locator(".device-terminal-keys")).toBeVisible();
        await expect
          .poll(() => modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
          .toBe(true);
        for (const selector of [
          ".devices-heading",
          ".device-picker",
          ".device-console-heading",
          ".device-terminal-keys",
        ]) {
          const box = await modal
            .locator(selector)
            .evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));
          assert(box.scroll <= box.width + 1, `${theme} ${width}: ${selector} overflow`);
        }
        const keys = await modal.locator(".device-terminal-keys").boundingBox();
        assert(keys.y + keys.height <= height + 1);
        if (width === 1366 || (width === 390 && height === 844))
          await shot(`${theme}-${width}`, `${theme} · ${width === 1366 ? "Планшет" : "Телефон"}`);
        if (height === 430) {
          await button("Ввести команду").click();
          const box = await button("Ввести").boundingBox();
          assert(box.y + box.height <= height + 1);
          await shot(`${theme}-keyboard`, `${theme} · Ввод при открытой клавиатуре`);
          await button("Отмена").click();
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await button("Система").click();
      await shot(`${theme}-system`, `${theme} · Системная сводка на телефоне`);
      await button("Действия устройства").click();
      await shot(`${theme}-menu`, `${theme} · Действия устройства`);
      await page.keyboard.press("Escape");
      await expect(modal).toBeVisible();
      await device.selectOption("workspace");
      await expect(modal.locator(".device-os")).toContainText("Ubuntu");
      await button("Действия устройства").click();
      await expect(modal.locator(".device-menu-items")).toContainText(
        "нет дополнительных действий",
      );
      await page.keyboard.press("Escape");
      await device.selectOption("server");
      await expect(modal.locator(".device-layout")).toHaveAttribute("data-page", "info");
    }
    await button("Справка и клавиши").click();
    await expect(page.locator(".workspace-help")).toContainText("Команды и пароли в терминале");
    assert.deepEqual(errors, []);
    console.log(
      type.name(),
      "Devices layout: 20 theme/viewport cases, session/draft isolation, keys, confirmations, splitter, menus, help passed",
    );
  } catch (error) {
    console.error(error);
    if (await modal.count())
      console.log(
        await modal.evaluate((el) => ({
          box: el.getBoundingClientRect().toJSON(),
          css: getComputedStyle(el).containerType,
          page: el.querySelector(".device-layout")?.dataset.page,
          theme: document.documentElement.dataset.theme,
        })),
      );
    await page.screenshot({ path: ".local/devices-layout-failure.png" });
    throw error;
  } finally {
    await browser.close();
    await f.close();
  }
}
