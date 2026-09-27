import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const engine = process.env.BROWSER ?? "chromium",
  origin = "http://127.0.0.1:18946";
const f = await handoffFixture(origin);
f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
f.store.setPreferences({
  projectId: "project",
  threadId: f.thread.id,
  view: "chat",
  theme: "crt-green",
});
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
await mkdir(".local/qa-comfort", { recursive: true });
let olderCodex = 0,
  olderGpt = 0;
const message = (n) => ({
  id: "m" + n,
  role: n % 2 ? "assistant" : "user",
  phase: "final_answer",
  complete: true,
  text: `Сообщение ${n}\n\n` + "Длинная строка для проверки читаемости и переходов. ".repeat(12),
  files: [],
  createdAt: "2026-09-27T00:00:00Z",
  turnId: "turn" + n,
});
try {
  await f.app.listen({ host: "127.0.0.1", port: 18946 });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/threads/*/history*", (route) => {
    const before = new URL(route.request().url()).searchParams.has("before");
    if (before) olderCodex++;
    return route.fulfill({
      json: {
        thread: f.thread,
        messages: before
          ? [message(0), message(1)]
          : [
              message(2),
              { ...message(22), phase: "commentary" },
              message(3),
              message(4),
              message(5),
            ],
        approvals: [],
        nextBefore: before ? null : "cursor",
        hasMore: !before,
        lastSeq: 0,
      },
    });
  });
  await page.route("**/api/gpt/**", (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path === "/api/gpt/status")
      return route.fulfill({ json: { configured: true, canSend: true, state: "healthy" } });
    if (path === "/api/gpt/models")
      return route.fulfill({
        json: {
          models: [{ id: "Latest", label: "Latest" }],
          efforts: [{ id: "2", label: "High" }],
          currentModel: "Latest",
          currentEffort: "2",
        },
      });
    if (path === "/api/gpt/jobs")
      return route.fulfill({
        json: {
          items: [
            {
              id: "layout-job",
              nativeId: "qa-gpt",
              status: "running",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              text: "",
              files: [],
              assets: [],
              answer: "",
              progress: [
                {
                  id: "step",
                  activity: "code",
                  text: "Выполняет команду с очень длинным названием",
                },
              ],
              model: "Latest",
              effort: "2",
              error: "",
            },
          ],
          stamp: 1,
        },
      });
    if (path.endsWith("/messages")) {
      const before = url.searchParams.has("before");
      if (before) olderGpt++;
      return route.fulfill({
        json: {
          items: (before ? [0, 1] : [2, 3, 4, 5]).map(message),
          nextBefore: before ? null : "cursor",
          revision: "rev",
          prefix: "prefix",
          notModified: false,
          retainOlder: true,
        },
      });
    }
    return route.fulfill({
      json: {
        items: path === "/api/gpt/conversations" ? [{ id: "qa-gpt", title: "GPT проверка" }] : [],
        conversations: [],
        projects: [],
        nextOffset: null,
        blocked: false,
      },
    });
  });
  await page.goto(origin);
  const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
  await composer.fill("Сохранить этот черновик\nвторая строка");
  await composer.blur();
  const nav = page.locator(".chat-pane .message-navigation");
  const align = async (scope, id) =>
    page.locator(scope).evaluate((el, id) => {
      const target = el.querySelector(`[data-chat-message="${id}"]`);
      el.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 16;
      el.dispatchEvent(new Event("scroll"));
    }, id);
  const at = async (scope, id) =>
    expect
      .poll(() =>
        page
          .locator(`${scope} [data-chat-message="${id}"]`)
          .evaluate((el) =>
            Math.abs(
              16 -
                Math.round(
                  el.getBoundingClientRect().top -
                    el.closest(".chat-scroll,.gpt-message-scroll").getBoundingClientRect().top,
                ),
            ),
          ),
      )
      .toBeLessThanOrEqual(2);
  await expect(page.locator('[data-chat-message="m3"]')).toBeVisible();
  await align(".chat-scroll", "m3");
  await nav.getByRole("button", { name: "Предыдущее сообщение" }).click();
  await at(".chat-scroll", "m2");
  await nav.getByRole("button", { name: "Предыдущее сообщение" }).click();
  await at(".chat-scroll", "m1");
  assert.equal(olderCodex, 1);
  await nav.getByRole("button", { name: "Следующее сообщение" }).click();
  await at(".chat-scroll", "m2");
  await nav.getByRole("button", { name: "Следующее сообщение" }).click();
  await at(".chat-scroll", "m3");
  await nav.getByRole("button", { name: "В конец чата" }).click();
  await expect
    .poll(() =>
      page
        .locator(".chat-scroll")
        .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThan(2);
  await expect(composer).toHaveValue("Сохранить этот черновик\nвторая строка");
  f.sessions.emit(
    "event",
    f.store.append(
      f.thread.id,
      "assistant.delta",
      { id: "stream-test", text: "Новый текст ответа. ".repeat(300) },
      "stream-turn",
    ),
  );
  await expect(page.locator('[data-message="stream-test"]')).toBeAttached();
  await expect
    .poll(() =>
      page
        .locator(".chat-scroll")
        .evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThan(2);
  await align(".chat-scroll", "m3");
  f.sessions.emit(
    "event",
    f.store.append(
      f.thread.id,
      "assistant.delta",
      { id: "stream-test", text: "Продолжение. ".repeat(150) },
      "stream-turn",
    ),
  );
  await expect(page.locator('[data-message="stream-test"]')).toContainText("Продолжение.");
  await at(".chat-scroll", "m3");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Поиск и команды", exact: true });
  await palette.getByRole("combobox").fill("Настройки");
  await page.keyboard.press("Enter");
  const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
  await settings.locator('[data-category="appearance"]').click();
  const scale = settings.getByRole("region", { name: "Размер текста и интерфейса" }),
    text = scale.getByRole("group", { name: "Текст", exact: true }),
    ui = scale.getByRole("group", { name: "Интерфейс", exact: true });
  const font = () =>
    page
      .locator('[data-chat-message="m3"] .message-body')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const normal = await font();
  await text.getByRole("button", { name: "90%", exact: true }).click();
  await expect.poll(font).toBeCloseTo(normal * 0.9, 1);
  await ui.getByRole("button", { name: "90%", exact: true }).click();
  await expect.poll(() => f.store.preferences().uiScale).toBe(0.9);
  await scale.getByRole("button", { name: "Сбросить масштаб" }).click();
  await expect.poll(font).toBeCloseTo(normal, 1);
  await expect.poll(() => f.store.preferences().uiScale).toBe(1);

  await text.getByRole("button", { name: "140%", exact: true }).click();
  await expect.poll(font).toBeCloseTo(normal * 1.4, 1);
  await at(".chat-scroll", "m3");
  const width = () =>
      settings
        .getByRole("button", { name: "Закрыть настройки" })
        .evaluate((el) => el.getBoundingClientRect().width),
    originalWidth = await width();
  await ui.getByRole("button", { name: "120%", exact: true }).click();
  await expect.poll(width).toBeGreaterThan(originalWidth);
  await expect.poll(font).toBeCloseTo(normal * 1.4, 1);
  await expect.poll(() => f.store.preferences().uiScale).toBe(1.2);
  for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    for (const [label, w, h] of [
      ["phone", 390, 844],
      ["keyboard", 390, 400],
      ["tablet", 820, 1024],
      ["wide", 1366, 1024],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await scale.scrollIntoViewIfNeeded();
      const close = await settings.getByRole("button", { name: "Закрыть настройки" }).boundingBox();
      assert(
        close &&
          close.x >= 0 &&
          close.y >= 0 &&
          close.x + close.width <= w + 1 &&
          close.y + close.height <= h + 1,
        JSON.stringify({ theme, label, close }),
      );
      assert(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: `.local/qa-comfort/${engine}-${theme}-${label}.png` });
    }
  }
  await settings.getByRole("button", { name: "Закрыть настройки" }).click();
  await expect(composer).toHaveValue("Сохранить этот черновик\nвторая строка");
  f.sessions.emit("event", f.store.append(f.thread.id, "turn.started", {}, "layout-turn"));
  await expect(page.getByRole("button", { name: "Ход работы", exact: true })).toBeVisible();
  const inspectRow = async (row, progress, name) => {
    for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [390, 400],
        [820, 1024],
        [1366, 1024],
      ]) {
        await page.setViewportSize({ width, height });
        const key = await row.locator(".message-navigation button").first().boundingBox(),
          status = await progress.boundingBox();
        assert(
          key && status && Math.abs(key.y - status.y) < 10,
          JSON.stringify({ name, theme, width, key, status }),
        );
        assert(key.x >= status.x + status.width - 1);
        assert(key.width < 44 && key.width >= 32);
        assert(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
        await page.screenshot({
          path: `.local/qa-comfort/${engine}-${name}-${theme}-${width}-${height}.png`,
        });
      }
    }
  };
  await inspectRow(
    page.locator(".chat-pane .chat-status-row"),
    page.getByRole("button", { name: "Ход работы", exact: true }),
    "codex-status",
  );
  await page.getByRole("button", { name: "Ход работы", exact: true }).click();
  await expect(page.locator(".turn-details")).toBeVisible();
  await page.getByRole("button", { name: "Ход работы", exact: true }).click();
  for (const [width, height] of [
    [390, 844],
    [390, 400],
    [320, 568],
    [820, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    const box = await nav.boundingBox(),
      field = await composer.boundingBox();
    assert(
      box && box.y >= 0 && box.y + box.height <= field.y + 1,
      JSON.stringify({ width, height, box, field }),
    );
    await page.screenshot({ path: `.local/qa-comfort/${engine}-chat-${width}-${height}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.reload();
  await expect(composer).toBeVisible();
  await expect.poll(font).toBeCloseTo(normal * 1.4, 1);
  await page.keyboard.press("Control+Alt+g");
  await expect(page.locator(".gpt-workspace")).toBeVisible();
  const gptRow = page.getByRole("button", { name: /GPT проверка/ }).first();
  await expect(gptRow).toBeVisible();
  await gptRow.click();
  await expect(page.locator('.gpt-message-scroll [data-chat-message="m3"]')).toBeVisible();
  await align(".gpt-message-scroll", "m2");
  await at(".gpt-message-scroll", "m2");
  const gnav = page.locator(".gpt-chat .message-navigation");
  await gnav.getByRole("button", { name: "Предыдущее сообщение" }).click();
  await at(".gpt-message-scroll", "m1");
  assert.equal(olderGpt, 1);
  await gnav.getByRole("button", { name: "Следующее сообщение" }).click();
  await at(".gpt-message-scroll", "m2");
  await expect(page.getByRole("button", { name: "Ход ответа GPT", exact: true })).toBeVisible();
  await inspectRow(
    page.locator(".gpt-status-row"),
    page.getByRole("button", { name: "Ход ответа GPT", exact: true }),
    "gpt-status",
  );
  await page.getByRole("button", { name: "Ход ответа GPT", exact: true }).click();
  const details = page.getByRole("region", { name: "Этапы GPT", exact: true });
  await expect(details).toBeVisible();
  const detailsBox = await details.boundingBox(),
    rowBox = await page.locator(".gpt-status-row").boundingBox();
  assert(Math.abs(detailsBox.width - rowBox.width) < 2);
  await page.screenshot({ path: `.local/qa-comfort/${engine}-gpt-status-expanded.png` });
  assert.deepEqual(errors, []);
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
  console.log(
    `${engine}: scales, persistence, draft, canonical paged Codex/GPT navigation and compact shared progress/navigation rows across all themes passed`,
  );
} finally {
  await browser.close();
  await f.close();
}
