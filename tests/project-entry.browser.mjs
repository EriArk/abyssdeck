import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { issueFixture } from "./issue-drawer-fixture.mjs";

const engine = process.env.BROWSER ?? "chromium",
  origin = "http://127.0.0.1:18892";
const f = await issueFixture(origin),
  sha = "a".repeat(40);
f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
f.sessions.config.projects[0].name = "Очень длинное название проекта · Общий репозиторий команды";
f.intake.inspect = f.d.inspect;
f.intake.probe = async (_m, _cwd, q) => ({
  access: "write",
  repository: q.repository,
  repositoryId: 42,
  query: q.query,
  ...(q.query.kind === "evidence"
    ? {
        evidence: { source: q.query.source, text: "Commit evidence" },
        commit: {
          sha,
          message: "Exact commit",
          files: [{ path: "src/main.ts", additions: 1, deletions: 0, patch: "+fixed" }],
        },
      }
    : {
        record: {
          type: q.query.type,
          number: q.query.number,
          title: "Exact linked issue",
          body: "Read me",
          author: { id: 7, login: "actual-user" },
          state: "open",
          url: `https://github.com/me/first/issues/${q.query.number}`,
          comments: 0,
          labels: [],
          assignees: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        commentsPage: [],
      }),
});
f.answer(
  `[Коммит](https://github.com/me/first/commit/${sha}) и [задача](https://github.com/me/first/issues/12)`,
);
f.store.setPreferences({
  projectId: "project",
  threadId: f.thread.id,
  view: "chat",
  theme: "crt-green",
});
await mkdir(".local/qa-project-entry", { recursive: true });
const browser = await (engine === "webkit" ? webkit : chromium).launch(),
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: "block",
  });
try {
  await f.app.listen({ host: "127.0.0.1", port: 18892 });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(12000);
  await page.goto(origin);
  const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
  await composer.fill("Сохранить исходный черновик");
  const source = page.getByRole("dialog", { name: "GitHub · событие" });
  await page.getByRole("button", { name: "Коммит", exact: true }).click();
  await expect(source.getByText("Exact commit", { exact: true })).toBeVisible();
  assert.equal(context.pages().length, 1);
  await source.getByRole("button", { name: "Закрыть событие" }).click();
  await expect(composer).toHaveValue("Сохранить исходный черновик");
  await page.getByRole("button", { name: "Обзор текущего проекта" }).click();
  const home = page.locator(".project-overview-modal");
  for (const heading of ["Сейчас", "Дальше", "Проект"])
    await expect(home.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(home.locator(".overview-primary-actions button")).toHaveCount(2);
  assert.equal(
    await home
      .locator(".overview-primary-actions button")
      .evaluateAll((buttons) => buttons.some((b) => b.scrollWidth > b.clientWidth + 1)),
    false,
  );
  await home.getByRole("button", { name: "Создать Issue", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Подборка Issues", exact: true });
  await drawer.getByLabel("Название", { exact: true }).fill("Ручная задача");
  await drawer.getByLabel("Описание", { exact: true }).fill("Описание без GPT");
  await drawer.getByRole("button", { name: "Закрыть подборку" }).click();
  await expect(home).toBeVisible();
  await home.getByRole("button", { name: "Создать Issue", exact: true }).click();
  await expect(drawer.getByLabel("Название", { exact: true })).toHaveValue("Ручная задача");
  await drawer.getByRole("button", { name: "Проверить публикацию", exact: true }).click();
  await expect(drawer.getByText(/От GitHub: @actual-user/)).toBeVisible();
  assert.equal(f.operations.filter((q) => q.op === "apply").length, 0);
  await drawer.getByRole("button", { name: "Закрыть подборку" }).click();
  await home.getByRole("button", { name: "Создать Issue", exact: true }).click();
  await expect(drawer.getByText(/От GitHub: @actual-user/)).toBeVisible();
  await expect(drawer.getByLabel("Описание", { exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Отправить 1 Issues", exact: true }).click();
  await expect.poll(() => f.operations.filter((q) => q.op === "apply").length).toBe(1);
  await drawer.getByRole("button", { name: "Закрыть подборку" }).click();
  await expect(home).toBeVisible();
  // Layout and true native modal return at phone, keyboard, compact and wide sizes.
  for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const [size, width, height] of [
      ["phone", 390, 844],
      ["keyboard", 390, 440],
      ["compact", 820, 900],
      ["wide", 1366, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      await home.getByRole("button", { name: "Разобрать задачу", exact: true }).click();
      const intake = page.locator(".intake-window");
      await expect(intake).toBeVisible();
      await intake
        .getByRole("textbox", { name: "Сообщение для разбора" })
        .fill("Draft within nested intake");
      const box = await intake.getByRole("button", { name: "Закрыть разбор" }).boundingBox();
      assert(
        box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width &&
          box.y + box.height <= height,
      );
      assert(await intake.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: `.local/qa-project-entry/${engine}-${theme}-${size}.png` });
      await intake
        .getByRole("button", {
          name: "Назад: Проект · Очень длинное название проекта · Общий репозиторий команды",
        })
        .click();
      await expect(home).toBeVisible();
    }
  }
  await home.getByRole("button", { name: "Закрыть обзор проекта" }).click();
  await expect(composer).toHaveValue("Сохранить исходный черновик");
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: exact internal commit links, manual Issue review/publish, nested return/drafts and 16 themed layouts passed`,
  );
} finally {
  await context.close();
  await browser.close();
  await f.close();
}
