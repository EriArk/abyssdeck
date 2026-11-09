import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { saveChatLog } from "../apps/hub/dist/chat-log.js";
import { handoffFixture } from "./handoff-fixture.mjs";

await mkdir(".local/qa-server-archive", { recursive: true });
for (const type of [chromium, webkit]) {
  const origin = "http://127.0.0.1:18939",
    f = await handoffFixture(origin);
  const lost = {
    id: "lost-project",
    name: "Исчезнувший проект с длинным названием",
    machineId: "pc",
    workingDirectory: "C:/Lost",
    enabled: true,
    recoverySourceId: "old-project",
    sourceId: "recreated-linux-group",
  };
  f.store.db
    .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
    .run(lost.id, "pc", "old-project", JSON.stringify(lost));
  // Both groups exist natively after automatic recovery, but neither has been
  // used on the replacement PC. One has retained text; the other is empty.
  const empty = {
    ...lost,
    id: "empty-recovered-project",
    name: "Пустой восстановленный проект",
    sourceId: "recreated-empty-group",
  };
  f.store.db
    .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
    .run(empty.id, "pc", empty.sourceId, JSON.stringify(empty));
  f.sessions.catalog.refresh = async () => {};
  const old = f.store.createThread("project", "lost-native", "Старая переписка");
  const absent = f.store.createThread(lost.id, "lost-project-native", "Чат исчезнувшего проекта");
  const older = f.store.createThread("project", "lost-native-2", "Ещё одна старая переписка");
  for (const thread of [old, older, absent]) {
    f.store.db.prepare("UPDATE threads SET historyMode='saved' WHERE id=?").run(thread.id);
    saveChatLog(
      f.store,
      [
        {
          id: "saved-" + thread.id,
          threadId: thread.id,
          role: "assistant",
          phase: "final",
          text: "Сохранённый ответ доступен",
          firstSeq: 1,
          lastSeq: 1,
          turnId: "old-turn",
        },
      ],
      1000000,
    );
  }
  f.store.setPreferences({ projectId: "project", threadId: f.thread.id, view: "chat" });
  const browser = await type.launch();
  try {
    await f.app.listen({ port: 18939, host: "127.0.0.1" });
    for (const [theme, width, height] of [
      ["crt-green", 390, 700],
      ["hitech-2000s", 768, 1024],
      ["organizer", 1024, 768],
      ["classic-dark", 1366, 900],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      const [name, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
      f.store.setPreferences({ theme, projectId: "project", threadId: f.thread.id });
      const page = await context.newPage();
      await page.goto(origin);
      const editor = page.getByRole("textbox", { name: "Сообщение Codex" });
      await expect(editor).toBeVisible();
      await editor.fill("Сохрани мой рабочий черновик");
      const open = async () => {
        if (
          width >= 1100 &&
          !(await page.locator(".workspace").getAttribute("class")).includes("nav-collapsed")
        )
          return;
        const button = page.getByRole("button", { name: "Открыть проекты", exact: true });
        if (await button.isVisible()) await button.click();
      };
      await open();
      const archive = page.locator(".server-archive").filter({ visible: true }),
        toggle = archive.getByRole("button", { name: "Серверный архив", exact: true });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(`[data-thread-id="${old.id}"]`)).toHaveCount(0);
      await expect(page.locator(`[data-project-id="${lost.id}"]`)).toHaveCount(0);
      await expect(page.locator(`[data-project-id="${empty.id}"]`)).toHaveCount(0);
      await expect(
        page.locator(".navigation-places").getByText(old.title, { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-project-id="project"]').filter({ visible: true }),
      ).toBeVisible();
      const archiveReads = [];
      const observeArchiveRead = (request) => {
        if (/\/api\/projects\/[^/]+\/threads$/.test(new URL(request.url()).pathname))
          archiveReads.push(request.url());
      };
      page.on("request", observeArchiveRead);
      await toggle.click();
      const savedProject = archive.locator('[data-project-id="project"]');
      await expect(savedProject).toHaveAttribute("aria-expanded", "false");
      await expect(savedProject.locator(".folder-icon")).toBeVisible();
      await expect(archive.locator(`[data-thread-id="${old.id}"]`)).toHaveCount(0);
      assert.equal(archiveReads.length, 0, "Opening archive does not refresh all native projects");
      page.off("request", observeArchiveRead);
      await savedProject.click();
      await expect(savedProject).toHaveAttribute("aria-expanded", "true");
      await expect(archive.locator(`[data-thread-id="${old.id}"]`)).toBeVisible();
      await expect(archive.locator(`[data-thread-id="${older.id}"]`)).toBeVisible();
      await expect(
        archive.locator(
          ".entity-trigger, .activity-badge, .nav-new-thread:not(.server-archive-toggle)",
        ),
      ).toHaveCount(0);
      await savedProject.click();
      await expect(archive.locator(`[data-thread-id="${old.id}"]`)).toHaveCount(0);
      await savedProject.click();
      await expect(archive.locator(`[data-project-id="${lost.id}"]`)).toBeVisible();
      await expect(archive.locator(`[data-project-id="${empty.id}"]`)).toBeVisible();
      await expect(archive.locator(".spinner")).toHaveCount(0);
      await page.screenshot({
        path: `.local/qa-server-archive/${type.name()}-${theme}-${width}.png`,
      });
      const mutations = f.calls.filter((c) =>
        ["thread/start", "thread/resume", "turn/start"].includes(c.method),
      ).length;
      await archive.locator(`[data-thread-id="${old.id}"]`).click();
      await expect(
        page.getByText("Серверный архив · Только чтение.", { exact: false }),
      ).toBeVisible();
      await expect(page.getByText("Сохранённый ответ доступен", { exact: true })).toBeVisible();
      await expect(editor).not.toBeVisible();
      assert.equal(
        f.calls.filter((c) => ["thread/start", "thread/resume", "turn/start"].includes(c.method))
          .length,
        mutations,
      );
      await open();
      const liveProject = page
        .locator('.nav-projects [data-project-id="project"]')
        .filter({ visible: true });
      await expect(liveProject).not.toHaveClass(/selected/);
      await expect(savedProject).toHaveClass(/selected/);
      await liveProject.click();
      await expect(editor).toHaveValue("Сохрани мой рабочий черновик");
      await open();
      await archive.locator(`[data-project-id="${lost.id}"]`).click();
      await expect(
        page.getByText("Серверный архив · Только чтение.", { exact: false }),
      ).toBeVisible();
      await expect(editor).not.toBeVisible();
      await open();
      await liveProject.click();
      await expect(editor).toHaveValue("Сохрани мой рабочий черновик");
      await open();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(archive.locator(`[data-thread-id="${old.id}"]`)).toHaveCount(0);
      await context.close();
    }
    console.log(
      `${type.name()}: archive separation, read-only history, live draft and four responsive themes passed`,
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
