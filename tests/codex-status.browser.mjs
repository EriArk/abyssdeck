import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18934",
    f = await handoffFixture(origin);
  await f.release();
  await f.sessions.resume(f.thread.id);
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    view: "chat",
    theme: "classic-dark",
    machineClients: { pc: "web" },
  });
  const event = (type, payload, turn = "current-turn") =>
    f.sessions.emitEvent(f.thread.id, type, payload, turn);
  event(
    "assistant.completed",
    { id: "old-progress", text: "Earlier progress", phase: "commentary" },
    "old-turn",
  );
  event("user.message", { id: "current-user", text: "Continue the task" });
  event("assistant.completed", {
    id: "current-progress",
    text: "Current progress",
    phase: "commentary",
  });
  const status = (value, turn, source = "hub", message) => {
    f.store.setStatus(f.thread.id, value, turn);
    f.store.db.prepare("UPDATE threads SET activitySource=? WHERE id=?").run(source, f.thread.id);
    event(
      "session.state",
      {
        status: value,
        activeTurnId: turn,
        activitySource: source,
        ...(message ? { message } : {}),
      },
      turn,
    );
  };
  status("running", "current-turn");
  const browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      hasTouch: true,
      serviceWorkers: "block",
    });
  try {
    await f.app.listen({ port: 18934, host: "127.0.0.1" });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
    const page = await context.newPage(),
      errors = [],
      writes = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/(turns|queue)(\/|$)/.test(new URL(r.url()).pathname))
        writes.push(r.url());
    });
    // Read recovery cannot invent a native outcome in this fixture.
    await page.route("**/api/threads/*/resume", (route) =>
      route.fulfill({ json: f.store.thread(f.thread.id) }),
    );
    await page.goto(origin);
    const control = page.locator(".turn-status"),
      old = page.locator('[data-message="old-progress"]'),
      current = page.locator('[data-message="current-progress"]');
    const editor = page.getByRole("textbox", { name: "Сообщение Codex" });
    await editor.fill("Preserve this draft");
    await expect(control.locator(".spinner")).toHaveCount(1);
    await expect(old.locator(".message-meta")).toContainText("Ход работы");
    await expect(current.locator(".message-meta")).toContainText("В работе");
    status("unknown", "current-turn", "external");
    await expect(control).toContainText("Состояние работы не подтверждено");
    await expect(control.locator(".spinner")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Остановить Codex", exact: true })).toHaveCount(
      0,
    );
    await expect(current.locator(".message-meta")).toContainText("Ход работы");
    await expect(page.locator(".connection-recovery")).toBeVisible();
    await control.getByRole("button", { name: "Ход работы", exact: true }).click();
    await expect(page.locator("#turn-details")).toBeVisible();
    status("idle", null, "hub", "Связь восстановлена. Проверь последний результат.");
    await expect(control).toContainText("Codex сейчас не работает");
    await expect(control.locator(".spinner")).toHaveCount(0);
    await expect(page.locator(".connection-recovery")).toHaveCount(0);
    await expect(page.locator('hr[aria-label="Конец задачи"]')).toHaveCount(1); // Only the earlier turn has a boundary.
    await mkdir(`.local/qa-codex-status/${engine}`, { recursive: true });
    await page.screenshot({ path: `.local/qa-codex-status/${engine}/idle-without-final.png` });
    status("running", "current-turn");
    await expect(control.locator(".spinner")).toHaveCount(1);
    await expect(current.locator(".message-meta")).toContainText("В работе");
    event("assistant.completed", { id: "final", text: "Task finished", phase: "final_answer" });
    status("completed", null);
    await expect(control).toHaveCount(0);
    await expect(page.locator('[data-message="final"]')).toContainText("Task finished");
    await expect(page.locator('hr[aria-label="Конец задачи"]')).toHaveCount(2);
    status("idle", null);
    await expect(control).toHaveCount(0);
    await expect(editor).toHaveValue("Preserve this draft");
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: live running/unknown/idle/final status, historical commentary, draft and no sends passed`,
    );
  } finally {
    await context.close();
    await browser.close();
    await f.close();
  }
}
