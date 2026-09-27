import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const engine = process.env.BROWSER ?? "webkit",
  origin = "http://127.0.0.1:18961";
const f = await handoffFixture(origin);
f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
f.store.setPreferences({ projectId: "project", threadId: f.thread.id, view: "chat" });
const ids = [];
for (let i = 0; i < 55; i++)
  ids.push(
    f.store.result(
      f.thread.id,
      null,
      "specimen-" + i,
      "file",
      `Образец-${String(i).padStart(2, "0")}.zip`,
      {},
    ),
  );
const foreign = f.store.createThread("foreign", "foreign-native", "Чужой проект");
f.store.result(foreign.id, null, "foreign", "file", "Образец-другого-проекта.zip", {});
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
try {
  await f.app.listen({ host: "127.0.0.1", port: 18961 });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
  await composer.fill("Черновик не трогать");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const e = new KeyboardEvent("keydown", {
          code: "KeyK",
          key: "k",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });
        document.activeElement.dispatchEvent(e);
        return e.defaultPrevented;
      }),
    )
    .toBe(true);
  const palette = page.getByRole("dialog", { name: "Поиск и команды", exact: true });
  await expect(palette.getByRole("option", { name: "Планы Действие", exact: true })).toBeVisible();
  await palette.getByRole("combobox").fill("Образец");
  await expect(palette.getByRole("option", { name: /Образец-\d/ })).toHaveCount(20);
  await expect(palette.getByText("Образец-другого-проекта.zip", { exact: true })).toHaveCount(0);
  await palette.getByRole("option", { name: /Продолжить поиск по содержимому/ }).click();
  const search = page.getByRole("dialog", { name: "Поиск по содержимому", exact: true });
  await expect(search.getByRole("combobox", { name: "Где искать" })).toHaveValue("project");
  await expect(search.locator(".content-search-result")).toHaveCount(40);
  await search.getByRole("button", { name: "Искать дальше", exact: true }).click();
  await expect(search.locator(".content-search-result")).toHaveCount(55);
  await search.getByRole("combobox", { name: "Что искать" }).selectOption("files");
  await expect(search.locator(".content-search-result")).toHaveCount(0);
  await search.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(search.locator(".content-search-result")).toHaveCount(40);
  // A slow old query must not populate a newly edited input.
  let release, started;
  const held = new Promise((r) => {
      release = r;
    }),
    seen = new Promise((r) => {
      started = r;
    });
  await page.route("**/api/workspace/search?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("q") !== "slow") return route.continue();
    started();
    await held;
    await route
      .fulfill({
        json: {
          items: [
            {
              target: {
                kind: "note",
                client: "codex",
                id: "stale",
                title: "СТАРАЯ ВЫДАЧА",
                availability: "unknown",
              },
              snippet: "stale",
            },
          ],
          nextOffset: null,
          scanned: 1,
          coverage: "old",
        },
      })
      .catch(() => {});
  });
  const query = search.getByRole("searchbox", { name: "Искать в тексте" });
  await query.fill("slow");
  await search.getByRole("button", { name: "Найти", exact: true }).click();
  await seen;
  await query.fill("Образец");
  release();
  await search.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(search.locator(".content-search-result")).toHaveCount(40);
  await expect(search.getByText("СТАРАЯ ВЫДАЧА")).toHaveCount(0);
  await mkdir(".local/qa-project-search", { recursive: true });
  for (const [theme, width, height] of [
    ["organizer", 390, 430],
    ["crt-green", 390, 844],
    ["hitech-2000s", 768, 1024],
    ["classic-dark", 1366, 1024],
  ]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await page.setViewportSize({ width, height });
    const box = await search.boundingBox(),
      close = await search
        .getByRole("button", { name: "Закрыть поиск", exact: true })
        .boundingBox();
    assert(
      box.x >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y >= 0 &&
        box.y + box.height <= height + 1,
      JSON.stringify(box),
    );
    assert(close.y >= 0 && close.y + close.height <= height);
    assert(await search.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    await page.screenshot({ path: `.local/qa-project-search/${engine}-${theme}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await query.fill("Образец-00");
  await search.getByRole("button", { name: "Найти", exact: true }).click();
  await search.getByRole("button", { name: /Образец-00.zip/ }).click();
  await expect(search).toHaveCount(0);
  await expect(page.locator(`[data-result="${ids[0]}"]`).filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Чат", exact: true }).click();
  await expect(composer).toHaveValue("Черновик не трогать");
  assert(!f.calls.some((x) => x.method === "turn/start"));
  assert.deepEqual(errors, []);
  console.log(
    `${engine}: project-scoped palette, complete pagination, type filters, stale query rejection, exact result navigation and draft; four themed layouts passed`,
  );
} finally {
  await context.close();
  await browser.close();
  await f.close();
}
