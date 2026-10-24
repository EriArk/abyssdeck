import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

const origin = "http://127.0.0.1:18968";
await mkdir(".local/qa-results-chat", { recursive: true });
for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const f = await handoffFixture(origin);
  const browser = await engine.launch();
  try {
    f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
    f.sessions.catalog.syncThreads = async () => {};
    const a = f.thread;
    const b = f.store.createThread("project", "native-b", "Second chat");
    const empty = f.store.createThread("project", "native-empty", "Empty chat");
    const ids = { [a.id]: [], [b.id]: [] };
    for (const [thread, prefix, count] of [
      [a, "A", 23],
      [b, "B", 2],
    ]) {
      for (let i = 0; i < count; i++)
        ids[thread.id].push(
          f.store.result(
            thread.id,
            "same-turn",
            "file-" + i,
            "artifact",
            i === 0 ? "shared.txt" : `${prefix}-${i}.txt`,
            { sourcePath: `C:/Project/${prefix}/file-${i}.txt`, url: "/fixture-file.txt" },
          ),
        );
      f.store.result(thread.id, "same-turn", "request", "reasoning-request", `${prefix} request`, {
        text: `${prefix} request`,
      });
      for (let i = 0; i < 2; i++)
        f.store.result(thread.id, "same-turn", "image-" + i, "image", `${prefix}-image-${i}.png`, {
          url: "/fixture-image.png",
        });
    }
    const png = await readFile("polish/05-files/preview-toolbar/crt-green-1366.png");
    // Backend identity remains exact even for identical turn IDs and filenames.
    for (const thread of [a, b]) {
      const page = (
        await f.app.inject({
          url: `/api/threads/${thread.id}/results?category=files`,
          headers: f.headers,
        })
      ).json();
      assert(page.items.every((r) => r.threadId === thread.id));
      const other = thread.id === a.id ? b : a;
      assert.equal(
        (
          await f.app.inject({
            url: `/api/threads/${thread.id}/results/${ids[other.id][0]}`,
            headers: f.headers,
          })
        ).statusCode,
        404,
      );
    }
    await f.app.listen({ host: "127.0.0.1", port: 18968 });
    for (const width of [390, 1024]) {
      f.store.setPreferences({
        projectId: "project",
        threadId: a.id,
        view: "chat",
        theme: "crt-green",
        machineClients: { pc: "web" },
      });
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        serviceWorkers: "block",
      });
      const [cookieName, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name: cookieName, value, url: origin, httpOnly: true }]);
      const page = await context.newPage();
      await page.route("**/fixture-image.png", (route) =>
        route.fulfill({ contentType: "image/png", body: png }),
      );
      const requests = [];
      page.on("request", (r) => requests.push(new URL(r.url()).pathname));
      await page.goto(origin);
      const composer = page.getByRole("textbox", { name: "Сообщение Codex" });
      await expect(composer).toBeVisible();
      await composer.fill("A draft");
      const results = page.locator(".results-pane");
      const showResults = async () => {
        await page
          .getByRole("button", { name: /^Результаты/ })
          .filter({ visible: true })
          .first()
          .click();
        await expect(results).toBeVisible();
      };
      const select = async (id) => {
        console.log(name, width, "select", id);
        const button = page.getByRole("button", { name: "Открыть проекты", exact: true });
        if (await button.isVisible()) await button.click();
        await page.locator(`[data-thread-id="${id}"]`).filter({ visible: true }).first().click();
        await expect.poll(() => f.store.preferences().threadId).toBe(id);
        await showResults();
      };
      await showResults();
      console.log(name, width, "initial files");
      await expect(results.locator(".result-feed-files [data-result]")).toHaveCount(20);
      await results.getByRole("button", { name: "Загрузить ещё результаты", exact: true }).click();
      await expect(results.locator(".result-feed-files [data-result]")).toHaveCount(23);
      await select(b.id);
      await expect(results.locator(".result-feed-files [data-result]")).toHaveCount(2);
      await expect(results.getByRole("checkbox")).toHaveCount(0);
      await expect(results.locator(".result-feed-caption")).toContainText("2");
      await expect(results.locator(".result-source-path").first()).toContainText("C:/Project/B/");
      await results.getByRole("button", { name: "Найти файл в результатах", exact: true }).click();
      const search = page.getByRole("dialog", { name: "Поиск файлов в результатах" });
      await search.getByRole("searchbox", { name: "Название файла" }).fill("shared.txt");
      await expect(
        search.getByRole("button", { name: "Открыть shared.txt", exact: true }),
      ).toHaveCount(1);
      await search.getByRole("button", { name: "Закрыть поиск результатов" }).click();
      await results.getByRole("button", { name: "Изображения", exact: true }).click();
      await expect(results.locator(".result-picture")).toHaveCount(2);
      await results.getByRole("button", { name: "Открыть снимок", exact: true }).first().click();
      await expect(page.locator(".image-gallery-navigation")).toContainText("1 из 2");
      await page.getByRole("button", { name: "Следующее изображение", exact: true }).click();
      await expect(page.locator(".image-gallery-navigation")).toContainText("2 из 2");
      await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
      await results.getByRole("button", { name: "Рассуждения", exact: true }).click();
      console.log(name, width, "reasoning");
      await expect(results.getByText("B request", { exact: true }).first()).toBeVisible();
      await expect(results.getByText("A request", { exact: true })).toHaveCount(0);
      await select(empty.id);
      await expect(results.locator("[data-result]")).toHaveCount(0);
      await expect(results.getByText("Пока нет результатов.", { exact: true })).toBeVisible();

      // A late page from the previous chat cannot enter the next chat's feed.
      let release, requested;
      const held = new Promise((r) => {
        release = r;
      });
      const waiting = new Promise((r) => {
        requested = r;
      });
      const routeUrl = `${origin}/api/threads/${a.id}/results?category=files`;
      await page.route(routeUrl, async (route) => {
        requested();
        await held;
        await route.fulfill({ json: f.store.results(a.id, undefined, "files") });
      });
      await select(a.id);
      await Promise.race([
        waiting,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Held result request was not observed")), 10000),
        ),
      ]);
      await select(b.id);
      release();
      await page.waitForTimeout(300);
      await expect(results.locator(".result-feed-files [data-result]")).toHaveCount(2);
      await expect(results.locator(".result-source-path").first()).toContainText("C:/Project/B/");
      await page.unroute(routeUrl);
      await select(a.id);
      await page
        .getByRole("button", { name: "Чат", exact: true })
        .filter({ visible: true })
        .first()
        .click();
      await expect(composer).toHaveValue("A draft");
      assert(
        !requests.some((url) => /\/api\/projects\/[^/]+\/results/.test(url)),
        "chat Results never requests the project feed",
      );
      assert(requests.includes(`/api/threads/${b.id}/results/search`));
      await page.screenshot({ path: `.local/qa-results-chat/${name}-${width}.png` });
      await context.close();
      console.log(name, width, "per-chat results PASS");
    }
  } finally {
    await browser.close();
    await f.close();
  }
}
