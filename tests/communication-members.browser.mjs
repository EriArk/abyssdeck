import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { communicationFixture } from "./communication-fixture.mjs";

const engine = process.env.BROWSER ?? "webkit",
  f = await communicationFixture();
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const errors = [];
async function client(headers) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const [name, value] = headers.cookie.split("=");
  await context.addCookies([{ name, value, url: f.base, httpOnly: true, sameSite: "Strict" }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(f.base);
  return page;
}
async function open(page) {
  await page.bringToFront();
  await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
  await page.locator(".workspace-shortcuts .communication-launch").last().click();
  return page.locator(".communication-window");
}
try {
  f.hub.registry.db
    .prepare("INSERT INTO team_meta(key,value) VALUES(?,?)")
    .run(`onboarding:${f.third}`, "deferred");
  const title = "Обсуждение большого проекта с длинным названием и рабочими материалами";
  const created = await f.request(f.headers, "POST", "/api/team/conversations", {
    kind: "group",
    title,
    members: [f.friend],
  });
  assert.equal(created.statusCode, 200, created.body);
  const owner = await client(f.headers),
    win = await open(owner);
  await win.locator(".communication-row").filter({ hasText: title }).click();
  const composer = win.getByRole("textbox", { name: "Сообщение участникам", exact: true });
  await composer.fill("Сохранённый черновик под настройками");
  await win.getByRole("button", { name: "Настройки разговора", exact: true }).click();
  const settings = owner.locator(".conversation-members-window");
  await settings.getByRole("button", { name: "Пригласить участника", exact: true }).click();
  await settings.getByRole("button", { name: "Третий", exact: true }).click();
  await settings.getByRole("button", { name: "Отправить приглашение", exact: true }).click();
  await expect(settings.getByRole("region", { name: "Ожидающие приглашения" })).toContainText(
    "Третий",
  );
  await mkdir(".cache/group-members", { recursive: true });
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
    for (const [label, width, height] of [
      ["phone", 390, 844],
      ["keyboard", 390, 430],
      ["tablet", 768, 1024],
      ["wide", 1366, 1024],
    ]) {
      await owner.setViewportSize({ width, height });
      await owner.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await owner.waitForTimeout(120);
      const box = await settings.boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.x + box.width <= width + 1 &&
          box.y >= -1 &&
          box.y + box.height <= height + 1,
        JSON.stringify({ label, theme, box }),
      );
      assert.ok(Math.abs(box.x - (width - box.x - box.width)) < 2);
      const close = await settings
        .getByRole("button", { name: "Закрыть настройки разговора" })
        .boundingBox();
      assert.ok(
        close.width >= 44 && close.height >= 44 && close.y >= 0 && close.y + close.height <= height,
      );
      assert.ok(await settings.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
      await owner.screenshot({ path: `.cache/group-members/${engine}-${theme}-${label}.png` });
    }
  }
  await owner.setViewportSize({ width: 390, height: 844 });
  await settings.getByRole("button", { name: "Закрыть настройки разговора" }).click();
  await expect(composer).toHaveValue("Сохранённый черновик под настройками");
  const third = await client(f.thirdHeaders),
    thirdWin = await open(third);
  await expect(thirdWin.locator(".group-invitation")).toContainText(title);
  await thirdWin.getByRole("button", { name: "Вступить", exact: true }).click();
  await expect(
    thirdWin.getByRole("textbox", { name: "Сообщение участникам", exact: true }),
  ).toBeVisible();
  await thirdWin.getByRole("button", { name: "Настройки разговора", exact: true }).click();
  await expect(
    third
      .locator(".conversation-members-window")
      .getByRole("button", { name: "Пригласить участника" }),
  ).toHaveCount(0);
  await third
    .locator(".conversation-members-window")
    .getByRole("button", { name: "Покинуть разговор", exact: true })
    .click();
  await expect(third.locator(".conversation-members-window")).toHaveCount(0);
  await expect(thirdWin.locator(".communication-row").filter({ hasText: title })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: invitation acceptance, group settings, leave, draft continuity and 16 themed layouts passed`,
  );
} finally {
  await browser.close();
  await f.close();
}
