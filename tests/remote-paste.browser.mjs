import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

for (const engine of [chromium, webkit]) {
  const origin = "http://127.0.0.1:18947",
    f = await handoffFixture(origin);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
  });
  const browser = await engine.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  try {
    await f.app.listen({ port: 18947, host: "127.0.0.1" });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/\/api\/projects(?:\?|$)/, async (route) => {
      const response = await route.fetch(),
        data = await response.json();
      for (const p of data.projects) p.remoteAvailable = true;
      await route.fulfill({ response, json: data });
    });
    await page.goto(origin);
    await page.locator(".workspace").waitFor();
    await page.addScriptTag({ url: `${origin}/vendor/guacamole-1.6.0.min.js` });
    await page.evaluate(() => {
      window.keys = [];
      window.clipboardMode = "normal";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          readText: () =>
            window.clipboardMode === "reject"
              ? Promise.reject(Error("denied"))
              : window.clipboardMode === "late"
                ? new Promise((resolve) => {
                    window.resolveClipboard = resolve;
                  })
                : Promise.resolve("Привет, Remote!\nLine 2 🖥"),
        },
      });
      Guacamole.WebSocketTunnel = class {};
      Guacamole.Client = class {
        constructor() {
          window.client = this;
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#1e3338";
          ctx.fillRect(0, 0, 1280, 720);
          ctx.fillStyle = "#d0e0e5";
          ctx.font = "30px sans-serif";
          ctx.fillText("Remote desktop · test session", 120, 160);
          this.display = {
            getElement: () => canvas,
            getWidth: () => 1280,
            getHeight: () => 720,
            scale: () => {},
            showCursor: () => {},
            flatten: () => canvas,
            flush: (fn) => fn(),
          };
        }
        getDisplay() {
          return this.display;
        }
        sendMouseState() {}
        sendKeyEvent(pressed, key) {
          window.keys.push([pressed, key]);
        }
        connect() {
          setTimeout(() => {
            this.onstatechange?.(3);
            this.onsync?.();
          }, 0);
        }
        disconnect() {}
      };
    });
    await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
    await page
      .getByRole("button", { name: "Открыть Remote", exact: true })
      .filter({ visible: true })
      .click();
    const remote = page.getByRole("dialog", { name: "Remote ПК", exact: true });
    await expect(remote.getByText("Подключено", { exact: true })).toBeVisible();
    const open = async () =>
      remote.getByRole("button", { name: "Вставить текст", exact: true }).click();
    const panel = remote.getByRole("group", { name: "Вставка текста" });
    const field = panel.getByRole("textbox");
    await open();
    await field.fill("local only");
    assert.equal((await page.evaluate(() => window.keys)).filter((p) => p[0] === 1).length, 0);
    await field.fill("");
    await panel.getByRole("button", { name: "Из буфера" }).click();
    await expect(field).toHaveValue("Привет, Remote!\nLine 2 🖥");
    await mkdir(".local/qa-remote-paste", { recursive: true });
    for (const width of [393, 1194]) {
      await page.setViewportSize({ width, height: 852 });
      for (const theme of ["crt-green", "hitech-2000s", "organizer"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await expect(panel.getByRole("button", { name: "Вставить", exact: true })).toBeVisible();
        assert(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
        await page.screenshot({
          path: `.local/qa-remote-paste/${engine.name()}-${width}-${theme}.png`,
        });
      }
    }
    await page.evaluate(() => {
      window.keys = [];
    });
    await panel.getByRole("button", { name: "Вставить", exact: true }).click();
    await expect(panel).toHaveCount(0);
    const keys = await page.evaluate(() => window.keys.filter((k) => k[0] === 1).map((k) => k[1]));
    assert.equal(
      keys.map((k) => (k === 0xff0d ? "\n" : String.fromCodePoint(k & 0xffffff))).join(""),
      "Привет, Remote!\nLine 2 🖥",
    );
    await open();
    await page.evaluate(() => {
      window.clipboardMode = "reject";
    });
    await panel.getByRole("button", { name: "Из буфера" }).click();
    await expect(panel.getByRole("alert")).toContainText("меню устройства");
    await page.evaluate(() => {
      window.clipboardMode = "late";
    });
    await panel.getByRole("button", { name: "Из буфера" }).click();
    await field.fill("new edit");
    await page.evaluate(() => window.resolveClipboard("stale"));
    await expect(field).toHaveValue("new edit");
    await panel.getByRole("button", { name: "Из буфера" }).click();
    await panel.getByRole("button", { name: "Закрыть вставку текста" }).click();
    await page.evaluate(() => window.resolveClipboard("private late text"));
    await open();
    await expect(field).toHaveValue("");
    await page.evaluate(() => {
      window.keys = [];
    });
    await field.fill("x".repeat(8000));
    await panel.getByRole("button", { name: "Вставить", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.keys.length)).toBeGreaterThan(0);
    await panel.getByRole("button", { name: "Закрыть вставку текста" }).click();
    const sent = await page.evaluate(() => window.keys.length);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.keys.length), sent);
    assert(sent < 16000);
    assert.deepEqual(errors, []);
    console.log(
      `${engine.name()}: clipboard fallback, exact Unicode, cancellation, stale reads and phone/tablet layouts passed`,
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
