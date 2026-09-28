import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { devicesFixture } from "./devices-fixture.mjs";

const origin = "http://127.0.0.1:18873";
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const f = await devicesFixture(origin);
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "classic-dark",
    machineClients: { pc: "web" },
  });
  f.store.append(
    f.thread.id,
    "activity.command",
    { itemId: "check", output: "All tests passed\n  exact spacing\n" },
    "turn",
  );
  f.store.result(f.thread.id, "turn", "check", "check", "Проверка завершена", {
    command: "pnpm test",
    exitCode: 0,
  });
  f.store.append(f.thread.id, "assistant.completed", {
    id: "terminal-link",
    text: "[Терминал сервера](codexweb://terminal/server)",
  }, "turn");
  const browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 1366, height: 1024 },
      hasTouch: true,
      serviceWorkers: "block",
    });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const button = (name) =>
    page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
  const out = `.local/qa-devices/${engine}`;
  await mkdir(out, { recursive: true });
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18873 });
    await page.goto(origin);
    const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
    await composer.fill("Draft stays here");
    await composer.evaluate((e) => e.blur());
    let outputReads = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/output")) outputReads++;
    });
    assert.equal(outputReads, 0);
    await page.getByRole("navigation", { name: "Категории результатов" }).getByRole("button", { name: /^Работа/ }).click();
    const output = page.locator(".command-output").first();
    await expect(output).toBeVisible();
    assert.equal(await output.getAttribute("open"), null);
    await output.locator("summary").click();
    await expect(output.locator("pre")).toHaveText("All tests passed\n  exact spacing\n");
    assert.equal(outputReads, 1);
    await button("Открыть устройства").click();
    const modal = page.getByRole("dialog", { name: "Устройства", exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.locator(".device-os")).toContainText("Ubuntu Linux");
    assert.equal(f.processes.length, 0);
    await button("Открыть терминал").click();
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    assert.equal(f.processes.length, 1);
    await button("Открыть клавиатуру").click();
    await page.keyboard.type("test");
    await page.keyboard.press("Enter");
    await expect.poll(() => f.processes[0].writes.join("")).toContain("test\r");
    await button("Ввести пароль").click();
    const password = modal.getByLabel("Пароль терминала", { exact: true });
    await password.fill("TEST-SECRET-only-in-pty");
    assert.equal(await password.getAttribute("type"), "password");
    await button("Ввести").click();
    await expect.poll(() => f.processes[0].writes.join("")).toContain("TEST-SECRET-only-in-pty\r");
    await expect(password).toHaveCount(0);
    const storage = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
    assert(!storage.includes("TEST-SECRET"));
    await button("Ввести команду").click();
    const command = modal.getByRole("textbox", { name: "Команда терминала" });
    await command.fill("printf old");
    await command.evaluate((e) => e.setSelectionRange(7, 10));
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { readText: async () => "hello\nprintf next" },
    }));
    const beforePaste = f.processes[0].writes.join("");
    await button("Вставить").click();
    await expect(command).toHaveValue("printf hello\nprintf next");
    assert.equal(f.processes[0].writes.join(""), beforePaste, "paste must not execute");
    await button("Ввести").click();
    await expect.poll(() => f.processes[0].writes.join("")).toContain("printf hello\rprintf next\r");
    await button("Ввести пароль").click();
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { readText: async () => "PASTED-secret" },
    }));
    await button("Вставить").click();
    await expect(password).toHaveValue("PASTED-secret");
    assert(!f.processes[0].writes.join("").includes("PASTED-secret"));
    assert(!(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).includes("PASTED-secret"));
    await button("Отмена").click();
    await button("Ввести команду").click();
    await command.fill("retained");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { readText: async () => { throw new DOMException("Denied", "NotAllowedError"); } },
    }));
    await button("Вставить").click();
    await expect(modal.getByRole("status")).toContainText("Зажми поле");
    await expect(command).toHaveValue("retained");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { readText: () => new Promise((resolve) => { window.finishPaste = resolve; }) },
    }));
    await button("Вставить").click();
    await command.fill("edited while waiting");
    await page.evaluate(() => window.finishPaste("stale clipboard"));
    await expect(command).toHaveValue("edited while waiting");
    await button("Вставить").click();
    await button("Отмена").click();
    await button("Ввести пароль").click();
    await page.evaluate(() => window.finishPaste("stale command"));
    await expect(password).toHaveValue("");
    await button("Отмена").click();
    for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/tablet-${theme}.png` });
      assert.equal(await modal.evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
      assert.equal(
        await page
          .locator(".navigation-system-row .nav-settings:visible")
          .first()
          .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
        false,
        theme + " footer overflow",
      );
    }
    await button("Закрыть устройства").click();
    await expect(composer).toHaveValue("Draft stays here");
    assert(!f.processes[0].killed);
    const writesBefore = f.processes[0].writes.join("");
    await button("Терминал сервера").click();
    await expect(modal.locator(".device-terminal-status")).toContainText("Подключено");
    assert.equal(f.processes.length, 1);
    assert.equal(f.processes[0].writes.join(""), writesBefore);
    await modal.getByRole("button", { name: "ПК Windows" }).click();
    await expect(modal.locator(".device-os")).toContainText("Windows 10");
    await button("Открыть терминал").click();
    await expect.poll(() => f.processes.length).toBe(2);
    assert(f.processes[1].args.includes("powershell.exe"));
    await button("Перезагрузка").click();
    await expect(modal.locator(".device-action-dialog")).toContainText("Перезагрузить · ПК");
    await button("Отмена").click();
    assert.equal(f.processes.length, 2);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect(modal.locator(".device-mobile-tabs")).toBeVisible();
    await button("Терминал").click();
    await expect(modal.locator(".device-system")).not.toBeVisible();
    await page.screenshot({ path: `${out}/phone-terminal.png` });
    await button("Система").click();
    await expect(modal.locator(".device-console")).not.toBeVisible();
    await page.screenshot({ path: `${out}/phone-system.png` });
    await button("Терминал").click();
    await page.setViewportSize({ width: 393, height: 430 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    const keys = await modal.locator(".device-terminal-keys").boundingBox();
    assert(keys.y + keys.height <= 431);
    await page.screenshot({ path: `${out}/phone-keyboard.png` });
    await button("Ввести пароль").click();
    await modal.getByLabel("Пароль терминала", { exact: true }).fill("CANCELLED-secret");
    await page.screenshot({ path: `${out}/phone-password.png` });
    const submit = await button("Ввести").boundingBox();
    assert(submit.y + submit.height <= 431);
    await button("Отмена").click();
    assert(!f.processes[1].writes.join("").includes("CANCELLED-secret"));
    await button("Закрыть устройства").click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("open-device-terminal", { detail: "not-owned" })));
    await expect(modal).toBeVisible();
    await expect(modal.locator(".device-error")).toBeVisible();
    assert.equal(f.processes.length, 2);
    assert.equal(
      f.calls.filter((c) => ["turn/start", "thread/start", "thread/resume"].includes(c.method))
        .length,
      0,
    );
    assert.equal(f.desktopCalls.length, 0);
    assert.deepEqual(errors, []);
    console.log(
      engine,
      "device selection, terminal input/reconnect, drafts, outputs, themes and phone passed",
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
