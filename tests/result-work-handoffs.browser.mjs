import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { Artifacts } from "../apps/hub/dist/artifacts.js";
import { communicationFixture } from "./communication-fixture.mjs";

const engine = process.env.BROWSER ?? "webkit",
  f = await communicationFixture();
const r = f.runtimes.get("owner"),
  browser = await (engine === "webkit" ? webkit : chromium).launch();
r.sessions.catalog.history = async (t) => ({ ...r.store.history(t.id), nextBefore: null });
r.store.setPreferences({
  projectId: "owner-project",
  threadId: r.thread.id,
  view: "chat",
  theme: "crt-green",
});
const artifact = new Artifacts(r.sessions.config.hub.resultsPath, r.store).putFile(
  r.thread.id,
  null,
  "exact-input.md",
  "private/exact-input.md",
  "text/markdown",
  Buffer.from("# Exact input\r\n"),
);
const resultId = r.store.result(
  r.thread.id,
  null,
  "handoff-ui",
  "file",
  "exact-input.md",
  artifact,
);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
const [name, value] = f.headers.cookie.split("=");
await context.addCookies([{ name, value, url: f.base, httpOnly: true, sameSite: "Strict" }]);
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir(".local/qa-result-work", { recursive: true });
try {
  await page.goto(f.base);
  const compose = page.locator(".composer textarea:not([aria-hidden])").first();
  await compose.fill("Мой исходный черновик");
  await page
    .getByRole("button", { name: /^Результаты/ })
    .last()
    .click();
  const card = page.locator(`[data-result="${resultId}"]`);
  const share = page.locator(".result-share-window"),
    intake = page.locator(".intake-window");
  const choose = async (kind) => {
    await card.getByRole("button", { name: "Отправить", exact: true }).click();
    await share.getByText("Работа и разбор задач", { exact: true }).click();
    await share.getByRole("button", { name: "Выбрать проект", exact: true }).click();
    const project = share
      .locator(".result-work-choice")
      .filter({ has: page.getByText("Altar", { exact: true }) });
    await project.getByRole("button", { name: kind, exact: true }).click();
  };
  const captureKeys = [];
  await page.route("**/api/team/result-snapshots", async (route) => {
    captureKeys.push(route.request().headers()["idempotency-key"]);
    if (captureKeys.length === 1)
      return route.fulfill({
        status: 410,
        json: { error: { code: "RESULT_COPY_EXPIRED", message: "Временная копия очищена" } },
      });
    return route.fallback();
  });
  await card.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(share.getByRole("alert")).toContainText("Временная копия очищена");
  await share.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect.poll(() => captureKeys.length).toBe(2);
  assert.notEqual(
    captureKeys[0],
    captureKeys[1],
    "only a confirmed expired capture gets a new preparation key",
  );
  await expect(share.getByRole("alert")).toHaveCount(0);
  await share.getByRole("button", { name: "Закрыть отправку", exact: true }).click();
  await choose("Разбор задач");
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"])
    for (const [width, height] of [
      [390, 844],
      [390, 500],
      [820, 1180],
      [1366, 1024],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await share.locator(".result-work-choice").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const box = await share.boundingBox();
      assert(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width + 1 &&
          box.y + box.height <= height + 1,
        JSON.stringify(box),
      );
      assert(await share.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({
        path: `.local/qa-result-work/${engine}-share-${theme}-${width}-${height}.png`,
      });
    }
  await page.setViewportSize({ width: 390, height: 844 });
  await share.getByRole("button", { name: "Отправить", exact: true }).click();
  await share.getByRole("button", { name: "Открыть разбор", exact: true }).click();
  await intake
    .getByRole("textbox", { name: "Сообщение для разбора", exact: true })
    .fill("Изучи этот материал");
  await intake.getByRole("button", { name: "Прикрепить", exact: true }).click();
  await expect(intake.locator(".attachment-list")).toContainText("exact-input.md");
  await expect(
    intake.getByRole("textbox", { name: "Сообщение для разбора", exact: true }),
  ).toHaveValue("Изучи этот материал");
  const controls = await intake
    .locator(".window-heading-controls > button")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y));
  assert(
    Math.max(...controls) - Math.min(...controls) < 2,
    "nested Intake header controls stay in one row",
  );
  const editor = intake.getByRole("textbox", { name: "Сообщение для разбора", exact: true });
  await expect(editor).toBeInViewport();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `.local/qa-result-work/${engine}-intake.png` });
  await intake.getByRole("button", { name: "Закрыть разбор", exact: true }).click();
  await share.getByRole("button", { name: "Готово", exact: true }).click();
  await choose("Рабочий чат");
  await share.getByRole("button", { name: "Отправить", exact: true }).click();
  await share.getByRole("button", { name: "Открыть рабочий чат", exact: true }).click();
  await page.getByRole("button", { name: "Чат", exact: true }).last().click();
  await page
    .locator(".work-result-handoffs")
    .getByRole("button", { name: "Прикрепить", exact: true })
    .click();
  await expect(compose).toHaveValue("Мой исходный черновик");
  await expect(page.locator(".composer .attachment-list")).toContainText("exact-input.md");
  await page.reload();
  await expect(page.locator(".composer .attachment-list")).toContainText("exact-input.md");
  // An attachment finishing in a previous destination must not lock the next chat.
  const captured = (
    await f.request(f.headers, "POST", "/api/team/result-snapshots", {
      client: "codex",
      threadId: r.thread.id,
      resultId,
    })
  ).json();
  const targets = (await f.request(f.headers, "GET", "/api/team/result-work-targets")).json().items;
  const workTargets = targets.filter((t) => t.kind === "work");
  const sourceTarget = workTargets.find((t) => t.projectId === "owner-project");
  const otherTarget = workTargets.find((t) => t.projectId === "owner-extra");
  assert(sourceTarget && otherTarget);
  const stage = async (target) => {
    const reply = await f.request(f.headers, "POST", "/api/team/result-work-handoffs", {
      snapshotId: captured.id,
      destination: { kind: "work", projectId: target.projectId },
      binding: target.binding,
    });
    assert.equal(reply.statusCode, 200, reply.body);
    return reply.json();
  };
  const sourceHandoff = await stage(sourceTarget);
  await stage(otherTarget);
  const navigate = async (target) => {
    await page.evaluate(
      (t) =>
        window.dispatchEvent(
          new CustomEvent("open-delivery-target", {
            detail: {
              client: "codex",
              kind: "thread",
              id: t.threadId,
              threadId: t.threadId,
              projectId: t.projectId,
              title: t.title,
              availability: "available",
            },
          }),
        ),
      target,
    );
    await expect(page.locator(".composer textarea:not([aria-hidden])").first()).toBeVisible();
  };
  await page.reload();
  const attach = () =>
    page.locator(".work-result-handoffs").getByRole("button", { name: "Прикрепить", exact: true });
  await expect(attach()).toBeEnabled();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const pattern = `**/api/team/result-work-handoffs/${sourceHandoff.id}/attachment`;
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    started();
    await held;
    await route.fulfill({ response });
  });
  try {
    await attach().click();
    await ready;
    await navigate(otherTarget);
    await expect(attach()).toBeEnabled();
    const otherCompose = page.locator(".composer textarea:not([aria-hidden])").first();
    await otherCompose.fill("Отдельный черновик другого проекта");
    release();
    await page.unroute(pattern);
    await expect(attach()).toBeEnabled();
    await expect(page.locator(".composer .attachment-list")).toHaveCount(0);
    await attach().click();
    await expect(page.locator(".composer .attachment-list")).toContainText("exact-input.md");
    await expect(otherCompose).toHaveValue("Отдельный черновик другого проекта");
    await navigate(sourceTarget);
    await expect(compose).toHaveValue("Мой исходный черновик");
    await expect(page.locator(".composer .attachment-list")).toContainText("exact-input.md");
  } finally {
    release();
  }
  assert.equal(r.nativeCalls.filter((c) => c.method === "turn/start").length, 0);
  assert.deepEqual(errors, []);
  console.log(
    engine +
      ": Work/Intake exact staging, delayed cross-chat attachment, mounted drafts, reload, no automatic sends; 16 themed layouts passed",
  );
} catch (e) {
  console.log(await page.locator("body").ariaSnapshot());
  await page.screenshot({ path: ".local/qa-result-work/failure.png" });
  throw e;
} finally {
  await context.close();
  await browser.close();
  await f.close();
}
