import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { gptOperationInput } from "../apps/hub/dist/gpt-operations.js";
import { handoffFixture } from "./handoff-fixture.mjs";

for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18926",
    f = await handoffFixture(origin),
    browser = await type.launch(),
    context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      hasTouch: true,
      serviceWorkers: "block",
    });
  try {
    await f.app.listen({ port: 18926, host: "127.0.0.1" });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
    await context.addInitScript(() => {
      localStorage.setItem("codex-client", "gpt");
      localStorage.setItem("gpt-conversation", "chat");
      localStorage.setItem(
        "gpt-edit:chat:u",
        JSON.stringify({
          id: "rejected-reopen",
          nativeId: "chat",
          messageId: "u",
          currentNode: "old-branch",
          action: "edit",
          text: "Сохранённый текст после отказа",
          model: "Latest",
          effort: "2",
          submitted: true,
          attempted: true,
        }),
      );
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let messages = [
        { id: "u", role: "user", text: "Исходное сообщение", files: [], createdAt: 1 },
        { id: "a", role: "assistant", text: "Исходный ответ", files: [], createdAt: 2 },
      ],
      ops = [
        {
          id: "rejected-reopen",
          nativeId: "chat",
          messageId: "u",
          state: "failed",
          action: "edit",
          text: "Сохранённый текст после отказа",
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: "older-completion",
          nativeId: "chat",
          messageId: "u",
          state: "completed",
          action: "edit",
          text: "Old draft",
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: "unrelated",
          nativeId: "other-chat",
          messageId: "old",
          state: "unknown",
          action: "edit",
          text: "Saved",
          error: "Unrelated uncertainty",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      requests = [],
      revision = 1,
      failAck = true;
    let holdNext = false,
      refuseNext = true,
      loseBeforeAcceptance = true;
    const attempts = [];
    const held = Promise.withResolvers(),
      release = Promise.withResolvers();
    await page.route("**/api/gpt/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      const json = (value) => route.fulfill({ json: value });
      if (path === "/api/gpt/status")
        return json({ configured: true, canSend: true, state: "healthy" });
      if (path === "/api/gpt/models")
        return json({
          models: [{ id: "Latest", label: "Latest" }],
          efforts: [{ id: "2", label: "High" }],
          currentModel: "Latest",
          currentEffort: "2",
        });
      if (path === "/api/gpt/conversations")
        return json({
          items: [{ id: "chat", title: "Проверка веток", updatedAt: 1 }],
          nextOffset: null,
        });
      if (path.endsWith("/messages"))
        return json({
          items: messages,
          nextBefore: null,
          revision: String(revision).repeat(64),
          prefix: "",
          notModified: false,
          retainOlder: false,
        });
      if (path.endsWith("/action"))
        return json({
          currentNode: "a",
          message: messages.find((m) => m.id === path.split("/").at(-2)),
        });
      if (path.endsWith("/versions"))
        return url.searchParams.has("targetMessageId")
          ? json({
              currentNode: "a2",
              messages: [
                { id: "u", role: "user", text: "Исходное сообщение", files: [], createdAt: 1 },
                { id: "a", role: "assistant", text: "Исходный ответ", files: [], createdAt: 2 },
              ],
              hasOlder: false,
            })
          : json({
              currentNode: "a2",
              items: [
                {
                  nodeId: "u2",
                  messageId: "u2",
                  text: "Исправленное сообщение",
                  current: true,
                  createdAt: 3,
                },
                {
                  nodeId: "u",
                  messageId: "u",
                  text: "Исходное сообщение",
                  current: false,
                  createdAt: 1,
                },
              ],
            });
      if (path === "/api/gpt/native-operations") {
        if (request.method() === "GET") {
          const id = url.searchParams.get("nativeId");
          assert(
            id || url.searchParams.get("newChat") === "1",
            "operation reads must name the selected scope",
          );
          // Deliberately stale list: only the exact receipt GET knows this refusal.
          const items = id
            ? ops.filter(
                (o) => o.id !== "rejected-reopen" && (o.nativeId === id || o.resultNativeId === id),
              )
            : [];
          if (holdNext) {
            holdNext = false;
            held.resolve();
            await release.promise;
            return json({ items, blocked: true });
          }
          return json({
            items,
            blocked: items.some((o) => ["unknown", "running"].includes(o.state)),
            sendBlocked: items.some((o) => o.state === "running"),
          });
        }
        attempts.push(request.headers()["idempotency-key"]);
        if (refuseNext) {
          refuseNext = false;
          return route.fulfill({
            status: 409,
            json: { error: { code: "GPT_BUSY", message: "Busy before acceptance" } },
          });
        }
        if (loseBeforeAcceptance) {
          loseBeforeAcceptance = false;
          return route.abort("failed");
        }
        const input = request.postDataJSON(),
          id = request.headers()["idempotency-key"];
        gptOperationInput.parse(input);
        assert.equal(input.attempted, undefined);
        assert.equal(input.submitted, undefined);
        requests.push({ id, input });
        if (!ops.some((op) => op.id === id))
          ops.unshift({
            ...input,
            id,
            state: "unknown",
            error: "Подтверждение потеряно",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        if (failAck) {
          failAck = false;
          return route.abort("failed");
        }
        return json({ id });
      }
      if (/\/native-operations\/[^/]+$/.test(path) && request.method() === "GET") {
        const op = ops.find((op) => op.id === path.split("/").at(-1));
        return op
          ? json({ id: op.id, nativeId: op.nativeId, state: op.state })
          : route.fulfill({
              status: 404,
              json: { error: { code: "GPT_OPERATION_MISSING", message: "No accepted receipt" } },
            });
      }
      if (path.endsWith("/check")) {
        ops[0].state = "completed";
        revision++;
        if (ops[0].action === "fork") ops[0].resultNativeId = "new-branch";
        else
          messages = [
            { ...messages[0], id: "u2", text: ops[0].text },
            { ...messages[1], id: "a2", text: "Новый ответ" },
          ];
        return json({ ok: true });
      }
      return json({ items: [], conversations: [], nextOffset: null, stamp: Date.now() });
    });
    await page.goto(origin);
    await expect(page.getByRole("textbox", { name: "Сообщение GPT" })).toBeVisible();
    await page.getByRole("textbox", { name: "Сообщение GPT" }).fill("Отдельный черновик");
    await page.getByRole("button", { name: "Изменить сообщение GPT", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Изменить сообщение GPT" }),
      editor = modal.getByRole("textbox", { name: "Изменённое сообщение" });
    await expect(editor).toBeEnabled();
    await expect(editor).toHaveValue("Сохранённый текст после отказа");
    assert.equal(requests.length, 0);
    await editor.fill("Исправленное сообщение\nВторая строка");
    await modal.getByRole("button", { name: "Сохранить и отправить", exact: true }).click();
    await expect(modal.getByRole("alert")).toContainText("Busy before acceptance");
    await expect(editor).toBeEnabled();
    await modal.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await page.getByRole("button", { name: "Изменить сообщение GPT", exact: true }).click();
    await expect(editor).toHaveValue("Исправленное сообщение\nВторая строка");
    await modal.getByRole("button", { name: "Сохранить и отправить", exact: true }).click();
    await expect(editor).toBeDisabled();
    await expect(
      modal.getByRole("button", { name: "Проверить отправку", exact: true }),
    ).toBeEnabled();
    await modal.getByRole("button", { name: "Закрыть", exact: true }).first().click();
    await page.getByRole("button", { name: "Изменить сообщение GPT", exact: true }).click();
    await expect(editor).toBeEnabled();
    await expect(editor).toHaveValue("Исправленное сообщение\nВторая строка");
    await mkdir(`.local/qa-gpt-operations/${engine}`, { recursive: true });
    for (const theme of ["classic-dark", "organizer", "crt-green", "hitech-2000s"]) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      for (const width of [320, 393, 1366]) {
        await page.setViewportSize({ width, height: width < 1100 ? 852 : 1024 });
        const rect = await modal.boundingBox();
        assert(rect.x >= 0 && rect.x + rect.width <= width + 1);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `.local/qa-gpt-operations/${engine}/${theme}-${width}.png` });
      }
    }
    await modal.getByRole("button", { name: "Сохранить и отправить", exact: true }).click();
    await expect(editor).toBeDisabled();
    await modal.getByRole("button", { name: "Проверить отправку", exact: true }).click();
    await expect(modal).not.toBeVisible();
    assert.equal(requests.length, 1);
    assert.equal(
      attempts.at(-1),
      attempts.at(-2),
      "lost pre-acceptance attempt retains id across reopening",
    );
    await expect(page.getByRole("button", { name: "Отправить GPT", exact: true })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Изменить сообщение GPT", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Сообщение GPT" })).toHaveValue(
      "Отдельный черновик",
    );
    await page.getByRole("button", { name: "Проверить историю", exact: true }).click();
    await expect(page.locator('[data-message="u2"]')).toContainText("Исправленное сообщение");
    await expect(page.getByRole("button", { name: "Отправить GPT", exact: true })).toBeEnabled();
    assert.equal(requests.length, 1);
    await page.getByRole("button", { name: "Изменить сообщение GPT", exact: true }).click();
    await page.getByRole("button", { name: "Версии сообщения", exact: true }).click();
    const versions = page.getByRole("dialog", { name: "Версии сообщения", exact: true });
    await versions.getByRole("button", { name: /Версия 2/ }).click();
    await expect(versions.getByLabel("Просмотр версии")).toContainText("Исходный ответ");
    assert.equal(requests.length, 1);
    await versions.getByRole("button", { name: "Продолжить в новом чате" }).click();
    const fork = page.getByRole("dialog", { name: "Продолжить версию GPT" });
    await fork
      .getByRole("textbox", { name: "Первое сообщение новой ветки" })
      .fill("Продолжим старую версию");
    await fork.getByRole("button", { name: "Создать чат и отправить" }).click();
    await page.getByRole("button", { name: "Проверить историю", exact: true }).click();
    await page.getByRole("button", { name: "Открыть новую ветку", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("gpt-conversation")))
      .toBe("new-branch");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].input.action, "fork");
    assert.equal(requests[1].input.targetMessageId, "u");
    holdNext = true;
    await held.promise;
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Новый чат GPT", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Сообщение GPT" }).fill("Черновик нового чата");
    release.resolve();
    await expect(page.getByRole("button", { name: "Отправить GPT", exact: true })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "Сообщение GPT" })).toHaveValue(
      "Черновик нового чата",
    );
    await expect(page.getByText("Unrelated uncertainty", { exact: true })).toHaveCount(0);
    assert.equal(requests.length, 2);
    assert.deepEqual(errors, []);
    console.log(
      engine +
        ": GPT edit draft, exact retry, unknown outcome, branch refresh and four-theme phone/tablet geometry passed",
    );
  } finally {
    await context.close();
    await browser.close();
    await f.close();
  }
}
