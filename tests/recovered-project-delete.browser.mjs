import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { HubError } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";
await mkdir(".local/qa-project-delete", { recursive: true });
for (const type of [chromium, webkit]) {
  const origin = "http://127.0.0.1:18941",
    f = await handoffFixture(origin);
  f.sessions.catalog.refresh = async () => {};
  const p = {
    ...f.sessions.project("project"),
    sourceId: "native-project",
    recoverySourceId: "old-project",
  };
  f.store.db
    .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
    .run(p.id, p.machineId, p.sourceId, JSON.stringify(p));
  const saved = f.store.createThread(p.id, "lost-native-thread", "Сохранённая переписка");
  f.store.db.prepare("UPDATE threads SET historyMode='saved' WHERE id=?").run(saved.id);
  const request = f.rpc.request.bind(f.rpc);
  f.rpc.request = async (method, params) => {
    if (params?.threadId === saved.codexThreadId)
      throw new HubError(404, "THREAD_NOT_LOADED", "Диалог не загружен в Codex.");
    return request(method, params);
  };
  f.store.setPreferences({
    theme: "crt-green",
    projectId: p.id,
    threadId: f.thread.id,
    machineClients: { pc: "web" },
  });
  const browser = await type.launch();
  try {
    await f.app.listen({ port: 18941, host: "127.0.0.1" });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
    const page = await context.newPage();
    await page.goto(origin);
    await expect(page.getByRole("textbox", { name: "Сообщение Codex" })).toBeVisible();
    await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
    await page
      .getByRole("button", { name: "Действия: Project", exact: true })
      .filter({ visible: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Удалить проект?" })).toBeVisible();
    await page.screenshot({ path: ".local/qa-project-delete/" + type.name() + "-confirm.png" });
    await dialog.getByRole("button", { name: "Удалить", exact: true }).click();
    await page.screenshot({ path: ".local/qa-project-delete/" + type.name() + "-after.png" });
    await expect(page.locator("dialog.entity-dialog")).toHaveCount(0);
    await expect(page.locator('.nav-projects [data-project-id="project"]')).toHaveCount(0);
    assert.equal(f.store.thread(saved.id).projectId, "unassigned-pc");
    assert.equal(f.store.thread(saved.id).historyMode, "saved");
    assert.equal(f.calls.filter((c) => c.method === "project/delete").length, 1);
    assert(
      !f.calls.some(
        (c) =>
          c.method === "thread/delete" || c.method === "turn/start" || c.method.startsWith("fs/"),
      ),
    );
    console.log(
      type.name() +
        ": confirmed project deletion succeeds with saved recovery history; chats retained",
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
