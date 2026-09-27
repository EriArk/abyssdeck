import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { communicationFixture } from "./communication-fixture.mjs";

const engine = process.env.BROWSER ?? "webkit",
  f = await communicationFixture();
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const ok = (r) => {
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
};
const errors = [];
try {
  const group = ok(
    await f.request(f.headers, "POST", "/api/team/conversations", {
      kind: "group",
      title: "Обсуждение большого проекта с длинным названием",
      members: [f.friend],
    }),
  );
  const path = `/api/team/conversations/${group.id}`,
    chat = path + "/chat";
  const first = ok(
    await f.request(f.friendHeaders, "POST", chat, { text: "Начало обсуждения", files: [] }),
  );
  const mention = ok(
    await f.request(f.friendHeaders, "POST", chat, {
      text: "Нужен бюджет на осень",
      files: [],
      mentions: [f.owner],
    }),
  );
  const insert = f.hub.registry.db.prepare(
    "INSERT INTO conversation_chat_messages(id,spaceId,authorId,text,createdAt) VALUES(?,?,?,?,?)",
  );
  for (let i = 0; i < 65; i++)
    insert.run(
      randomUUID(),
      group.id,
      f.friend,
      `Продолжение обсуждения ${i}. Подробности совместного проекта.`,
      Date.now(),
    );
  const presence = randomUUID();
  const heartbeat = () =>
    f.request(f.friendHeaders, "POST", "/api/team/communication/presence", {
      id: presence,
      active: true,
    });
  ok(await heartbeat());
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: f.base, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.base);
  await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
  await page.locator(".workspace-shortcuts .communication-launch").last().click();
  const win = page.locator(".communication-window");
  await win.getByRole("button", { name: "Люди", exact: true }).click();
  await expect(win.locator(".team-contact").filter({ hasText: "Друг" })).toContainText("В сети");
  await win.getByRole("button", { name: "Чаты", exact: true }).click();
  await win.locator(".communication-row").filter({ hasText: group.title }).click();
  const selected = win.locator('.space-chat-message[data-selected="true"]');
  await expect(selected).toHaveAttribute("data-message-seq", String(first.seq));
  assert.equal(
    ok(await f.request(f.headers, "GET", path)).unread,
    67,
    "opening first unread does not read all",
  );
  const composer = win.getByRole("textbox", { name: "Сообщение участникам", exact: true });
  await composer.fill("Черновик остаётся на месте");
  await win.getByRole("button", { name: "Первое непрочитанное упоминание" }).click();
  await expect(selected).toHaveAttribute("data-message-seq", String(mention.seq));
  await win.getByRole("button", { name: "Поиск по переписке", exact: true }).click();
  await win.getByRole("searchbox", { name: "Текст или имя файла" }).fill("БЮДЖЕТ");
  await win.getByRole("button", { name: "Найти в переписке" }).click();
  await expect(win.locator(".conversation-search-hit")).toHaveCount(1);
  await mkdir(".cache/communication-attention", { recursive: true });
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
    for (const [label, width, height] of [
      ["phone", 390, 844],
      ["keyboard", 390, 430],
      ["tablet", 768, 1024],
      ["wide", 1366, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.waitForTimeout(100);
      const box = await win.boundingBox(),
        close = await win.getByRole("button", { name: "Закрыть общение" }).boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.y >= -1 &&
          box.x + box.width <= width + 1 &&
          box.y + box.height <= height + 1,
        JSON.stringify({ theme, label, box }),
      );
      assert.ok(close.width >= 44 && close.height >= 44 && close.y + close.height <= height);
      assert.ok(await win.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
      const field = await composer.boundingBox();
      assert.ok(
        field.y >= 0 && field.y + field.height <= height,
        JSON.stringify({ theme, label, field }),
      );
      await page.screenshot({
        path: `.cache/communication-attention/${engine}-${theme}-${label}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await win.locator(".conversation-search-hit").click();
  await expect(selected).toHaveAttribute("data-message-seq", String(mention.seq));
  await expect(composer).toHaveValue("Черновик остаётся на месте");
  await win.getByRole("button", { name: "К последним", exact: true }).click();
  await expect(win.locator(".space-chat-message").last()).toContainText(
    "Продолжение обсуждения 64",
  );
  await expect.poll(async () => ok(await f.request(f.headers, "GET", path)).unread).toBe(0);
  await win.getByRole("button", { name: "Настройки разговора", exact: true }).click();
  const settings = page.locator(".conversation-members-window");
  await settings.getByRole("textbox", { name: "Название группы" }).fill("Готовим выпуск");
  ok(
    await f.request(f.headers, "POST", path + "/title", {
      title: "Название с другого устройства",
      version: 0,
    }),
  );
  await settings.getByRole("button", { name: "Сохранить название" }).click();
  await expect(settings.getByRole("alert")).toContainText("Группа изменилась");
  await expect(settings.locator(".notebook-heading small")).toHaveText(
    "Название с другого устройства",
  );
  assert.equal(ok(await f.request(f.headers, "GET", path)).title, "Название с другого устройства");
  await settings.getByRole("button", { name: "Сохранить название" }).click();
  await expect(settings.locator(".notebook-heading small")).toHaveText("Готовим выпуск");
  await settings.getByRole("button", { name: "Закрыть настройки разговора" }).click();
  await expect(composer).toHaveValue("Черновик остаётся на месте");
  await win.getByRole("button", { name: "Закрыть общение" }).click();
  const incoming = ok(
    await f.request(f.friendHeaders, "POST", chat, {
      text: "Упоминание из уведомлений",
      files: [],
      mentions: [f.owner],
    }),
  );
  await page
    .getByRole("button", { name: /Уведомления/ })
    .last()
    .click();
  const notice = page.locator(".communication-notice");
  await expect(notice).toContainText("Готовим выпуск");
  await notice.getByRole("button", { name: "Открыть", exact: true }).click();
  await expect(selected).toHaveAttribute("data-message-seq", String(incoming.seq));
  await expect(composer).toHaveValue("Черновик остаётся на месте");
  await win.getByRole("button", { name: "Закрыть общение" }).click();
  await notice.getByRole("button", { name: "Прочитано", exact: true }).click();
  await expect(notice).toHaveCount(0);
  assert.equal(ok(await f.request(f.headers, "GET", path)).unread, 0);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: search, exact unread/mention navigation, presence, rename, notification read and draft continuity; 16 themed layouts passed`,
  );
} finally {
  await browser.close();
  await f.close();
}
