import assert from "node:assert/strict";
import { chromium, expect, webkit } from "@playwright/test";
import { devicesFixture } from "./devices-fixture.mjs";

const origin = "http://127.0.0.1:18873";
const signal = (p, phase) => {
  const s = (p.args.join(" ").match(/[A-Za-z0-9+/]{100,}={0,2}/g) || [])
    .map((x) => Buffer.from(x, "base64").toString())
    .find((x) => x.includes("__cw_token="));
  const t = s.match(/__cw_token='([a-f0-9]{48})'/)[1];
  p.output(`\x1b]777;codexweb;${t};${phase};234;456;0\x07`);
};
for (const type of [chromium, webkit]) {
  const f = await devicesFixture(origin, { devices: { terminalProbe: async () => "idle" } });
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "classic-dark",
    machineClients: { pc: "web" },
  });
  f.store.append(f.thread.id, "assistant.completed", {id: "terminal-link", text: "[Терминал сервера](codexweb://terminal/server)"}, "turn");
const browser = await type.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    serviceWorkers: "block",
  });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18873 });
    await page.goto(origin);
    const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
    await composer.fill("Сохранённый черновик");
    const button = (name) =>
      page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
    const open = async () => {
      await button("Терминал сервера").click();
      
      await expect(page.locator(".device-terminal-status")).toContainText("Подключено");
    };
    await open();
    const p = f.processes[0];
    signal(p, "prompt");
    await button("Ввести команду").click();
    await page.getByRole("textbox", { name: "Команда терминала" }).fill("sudo example\n");
    await button("Ввести").click();
    await expect.poll(() => p.writes.join("")).toBe("sudo example\r");
    signal(p, "busy");
    await button("Закрыть устройства").click();
    await expect(page.locator(".devices-workspace")).toHaveCount(0);
    assert(!p.killed, "running work survives close");
    await expect(composer).toHaveValue("Сохранённый черновик");
    // Reopening an active terminal revokes the pending close before any completion.
    await button("Терминал сервера").click();
    await expect(page.locator(".device-terminal-status")).toContainText("Подключено");
    signal(p, "prompt");
    await page.waitForTimeout(1700);
    assert(!p.killed);
    await button("Закрыть устройства").click();
    await expect.poll(() => p.killed).toBe(true);
    // Merely losing a viewer is not an explicit request to release the session.
    await open();
    const q = f.processes[1];
    signal(q, "prompt");
    await page.close();
    await new Promise((r) => setTimeout(r, 100));
    assert(!q.killed);
    assert.deepEqual(errors, []);
    console.log(
      type.name() + " terminal close, reopen, active work, pasted newline and disconnect passed",
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
