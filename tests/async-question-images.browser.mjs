import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

await mkdir(".local/qa-question-images", { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18969",
    f = await handoffFixture(origin);
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
    machineClients: { pc: "web" },
  });
  const turn = "question-images",
    question =
      "Odin после сбоя GPU и удалённой команды перезагрузки не возвращается в сеть. Если он сейчас рядом, можешь перезапустить его долгим нажатием Power? Flip работает; доступные проверки на нём продолжаю.";
  for (let i = 0; i < 6; i++)
    f.store.result(f.thread.id, turn, `image-${i}`, "image", `Снимок ${i}`, {
      url: `/api/test-image/${i}`,
    });
  f.store.append(
    f.thread.id,
    "assistant.completed",
    {
      id: "question",
      phase: "final_answer",
      text: question,
      questions: [{ title: question, options: null }],
    },
    turn,
  );
  const browser = await type.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18969 });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage(),
      requests = [],
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/test-image/*", (route) => {
      requests.push(route.request().url());
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>',
      });
    });
    await page.goto(origin);
    const q = page.locator('[data-message="question"]');
    await expect(q.locator(".async-questions fieldset")).toHaveCount(1);
    await expect(q.locator(".image-gallery, .message-generated-image")).toHaveCount(0);
    await expect(q.getByRole("textbox")).toHaveCount(1);
    assert.equal(requests.length, 0, "a question never loads unrelated whole-turn images");
    await q.screenshot({ path: `.local/qa-question-images/${engine}-question.png` });
    f.store.append(
      f.thread.id,
      "assistant.completed",
      { id: "answer", phase: "final_answer", text: "Работа завершена, снимки готовы." },
      turn,
    );
    await page.reload();
    const answer = page.locator('[data-message="answer"]');
    await expect(answer.getByRole("group", { name: "Галерея изображений" })).toContainText(
      "1 из 6",
    );
    await expect(answer.locator("img")).toHaveCount(1);
    await expect
      .poll(() => answer.locator("img").evaluate((e) => e.naturalWidth))
      .toBeGreaterThan(0);
    await expect(q.locator(".image-gallery")).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: exact IMG_0824 question has one answer field and no whole-turn gallery; final answer retains all six images`,
    );
  } finally {
    await context.close();
    await browser.close();
    await f.close();
  }
}
