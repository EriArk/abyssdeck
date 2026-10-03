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
  f.store.append(
    f.thread.id,
    "assistant.completed",
    {
      id: "terminal-link",
      text: "[Терминал сервера](codexweb://terminal/server)",
    },
    "turn",
  );
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
  const out = `${process.env.DEVICES_QA_OUTPUT ?? ".local/qa-devices"}/${engine}`;
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
    // Results have their own focused suite; this pass exercises Devices only.
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
    const terminalIdentity = await modal.locator(".device-terminal").count();
    let releases = 0;
    const countRelease = (request) => {
      if (request.url().includes("/release") && request.method() === "POST") releases++;
    };
    page.on("request", countRelease);
    await modal.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(composer).toBeEditable();
    assert.equal(releases, 0, "minimize never requests terminal release");
    assert.equal(f.processes.length, 1);
    assert.equal(f.processes[0].killed, false);
    await button("Открыть устройства").click();
    await expect(modal).toBeVisible();
    await expect(command).toHaveValue("printf old");
    assert.equal(await modal.locator(".device-terminal").count(), terminalIdentity);
    assert.equal(f.processes.length, 1, "restore reuses the same terminal");
    page.off("request", countRelease);
    await command.evaluate((e) => e.setSelectionRange(7, 10));
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { readText: async () => "hello\nprintf next" },
      }),
    );
    const beforePaste = f.processes[0].writes.join("");
    await button("Вставить").click();
    await expect(command).toHaveValue("printf hello\nprintf next");
    assert.equal(f.processes[0].writes.join(""), beforePaste, "paste must not execute");
    await button("Ввести").click();
    await expect
      .poll(() => f.processes[0].writes.join(""))
      .toContain("printf hello\rprintf next\r");
    await button("Ввести пароль").click();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { readText: async () => "PASTED-secret" },
      }),
    );
    await button("Вставить").click();
    await expect(password).toHaveValue("PASTED-secret");
    assert(!f.processes[0].writes.join("").includes("PASTED-secret"));
    assert(
      !(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).includes(
        "PASTED-secret",
      ),
    );
    await button("Отмена").click();
    await button("Ввести команду").click();
    await command.fill("retained");
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          readText: async () => {
            throw new DOMException("Denied", "NotAllowedError");
          },
        },
      }),
    );
    await button("Вставить").click();
    await expect(modal.getByRole("status")).toContainText("Зажми поле");
    await expect(command).toHaveValue("retained");
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          readText: () =>
            new Promise((resolve) => {
              window.finishPaste = resolve;
            }),
        },
      }),
    );
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
        `${theme} footer overflow`,
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
    await modal.getByRole("combobox", { name: "Устройство", exact: true }).selectOption("pc");
    await expect(modal.locator(".device-os")).toContainText("Windows 10");
    await button("Открыть терминал").click();
    await expect.poll(() => f.processes.length).toBe(2);
    assert(f.processes[1].args.includes("powershell.exe"));
    await button("Действия устройства").click();
    await button("Перезагрузка").click();
    await expect(modal.locator(".device-action-dialog")).toContainText("Перезагрузить · ПК");
    await button("Отмена").click();
    assert.equal(f.processes.length, 2);
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await expect(modal.locator(".device-mobile-tabs")).toBeVisible();
    await button("Терминал").click();
    await expect(modal.locator(".device-system")).not.toBeVisible();
    f.processes[1].output(
      Array.from({ length: 180 }, (_, i) => `history-line-${String(i).padStart(3, "0")}\r\n`).join(
        "",
      ),
    );
    const terminalRows = modal.locator(".xterm-rows");
    await expect(terminalRows).toContainText("history-line-179");
    const beforeSwipe = f.processes[1].writes.join("");
    const screenBox = await modal.locator(".xterm-screen").boundingBox();
    const x = screenBox.x + screenBox.width / 2,
      y = screenBox.y + 30;
    if (engine === "chromium") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let delta = 20; delta <= 160; delta += 20)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + delta, id: 1 }],
        });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    } else {
      // WebKit Playwright has no native swipe injection; exercise the same DOM
      // handlers, without claiming physical Safari gesture acceptance.
      await modal.locator(".xterm-screen").evaluate(
        (element, { x, y }) => {
          for (const [type, offset] of [
            ["touchstart", 0],
            ["touchmove", 160],
            ["touchend", 160],
          ]) {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(event, "touches", {
              value:
                type === "touchend" ? [] : [{ identifier: 1, clientX: x, clientY: y + offset }],
            });
            element.dispatchEvent(event);
          }
        },
        { x, y },
      );
    }
    await expect(button("К последнему выводу")).toBeVisible();
    await expect(terminalRows).not.toContainText("history-line-179");
    const oldOutput = await terminalRows.innerText();
    f.processes[1].output("new-output-while-reading\r\n");
    await page.waitForTimeout(150);
    assert.equal(
      await terminalRows.innerText(),
      oldOutput,
      "incoming output must preserve reading position",
    );
    assert.equal(
      f.processes[1].writes.join(""),
      beforeSwipe,
      "scrolling must never send terminal input",
    );
    for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.screenshot({ path: `${out}/phone-scroll-${theme}.png` });
    }
    await button("К последнему выводу").click();
    await expect(terminalRows).toContainText("new-output-while-reading");
    await expect(button("К последнему выводу")).toHaveCount(0);
    assert.equal(f.processes[1].writes.join(""), beforeSwipe);
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
    await expect(modal).toBeHidden();
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("open-device-terminal", { detail: "not-owned" })),
    );
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
