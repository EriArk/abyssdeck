import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "codex-questions-"));
try {
  await build({
    configFile: false,
    root: resolve("apps/web"),
    plugins: [react()],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "error",
    build: {
      outDir: dir,
      emptyOutDir: true,
      lib: {
        entry: resolve("apps/web/tests/fixtures/codex-questions.tsx"),
        name: "Questions",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  const js = await readFile(join(dir, "fixture.js"), "utf8"),
    css = (
      await Promise.all(
        (
          await readdir(dir)
        )
          .filter((f) => f.endsWith(".css"))
          .map((f) => readFile(join(dir, f), "utf8")),
      )
    ).join("\n");
  await mkdir(".local/qa-codex-questions", { recursive: true });
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const posts = [],
        errors = [];
      let fresh = false,
        reads = 0,
        releasePatch,
        queue = [];
      const model = (id) => ({
        id,
        name: id,
        efforts: ["medium", "high"],
        defaultEffort: "high",
        supportsImages: true,
      });
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error(e.message);
      });
      await page.route("https://questions.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname,
          method = route.request().method();
        if (path === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><html data-theme="classic-dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
          });
        if (path === "/fixture.js")
          return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: js });
        if (path === "/fixture.css")
          return route.fulfill({ contentType: "text/css; charset=utf-8", body: css });
        if (path.startsWith("/fonts/"))
          return route.fulfill({
            body: await readFile(resolve("apps/web/public" + path)),
            contentType: "font/woff2",
          });
        if (path.endsWith("/capabilities")) {
          reads++;
          return route.fulfill({
            json: {
              models: [model("gpt-6-astra"), ...(fresh ? [model("gpt-6.1-sol")] : [])],
              defaults: { model: "gpt-6-astra", effort: "high", mode: "default" },
              modes: ["default", "plan"],
              warnings: [],
            },
          });
        }
        if (path.endsWith("/settings") && method === "PATCH") {
          posts.push({ path, body: route.request().postDataJSON() });
          await new Promise((r) => (releasePatch = r));
          return route.fulfill({ json: { ok: true } });
        }
        if (path.endsWith("/queue") && method === "GET")
          return route.fulfill({ json: { available: true, canSteer: false, items: queue } });
        if (path.endsWith("/question-reply") && method === "POST") {
          const body = route.request().postDataJSON();
          posts.push({ path, body });
          const item = {
            id: body.clientId,
            text: body.text,
            revision: "r",
            state: "steered",
            attachments: [],
            otherInputs: 0,
          };
          queue.push(item);
          return route.fulfill({ json: { delivery: "steered" } });
        }
        if (path.includes("/queue/") && method === "POST") {
          posts.push({ path, body: route.request().postDataJSON() });
          return route.fulfill({
            status: 504,
            json: { error: { message: "Lost confirmation", code: "CODEX_REQUEST_TIMEOUT" } },
          });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto("https://questions.test/");
      await expect(
        page.getByRole("radio", { name: "Да, Калькулятор виден", exact: true }),
      ).toBeChecked();
      assert.equal(posts.length, 0, "preselection never submits");
      await page.screenshot({
        path: `.local/qa-codex-questions/${name}-choices-phone.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1366, height: 1024 });
      await page.screenshot({
        path: `.local/qa-codex-questions/${name}-choices-tablet.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("radio", { name: "Свой ответ", exact: true }).check();
      await page.getByRole("textbox", { name: /Свой ответ:/ }).fill("Вижу на основном экране");
      await page.getByRole("button", { name: "Переоткрыть", exact: true }).click();
      await expect(page.getByRole("textbox", { name: /Свой ответ:/ })).toHaveValue(
        "Вижу на основном экране",
      );
      fresh = true;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByRole("option", { name: "gpt-6.1-sol", exact: true })).toHaveCount(1);
      await page.getByRole("combobox", { name: "Модель Codex" }).selectOption("gpt-6.1-sol");
      await expect.poll(() => typeof releasePatch).toBe("function");
      const before = reads;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect.poll(() => reads).toBeGreaterThan(before);
      await expect(page.getByRole("combobox", { name: "Модель Codex" })).toHaveValue("gpt-6.1-sol");
      await expect(page.getByRole("combobox", { name: "Модель Codex" })).toBeDisabled();
      releasePatch();
      await expect(page.getByRole("combobox", { name: "Модель Codex" })).toBeEnabled();
      await page.getByRole("button", { name: "Ответить", exact: true }).click();
      await expect(page.locator(".async-questions [role=status]")).toHaveText("Ответ передан");
      const adds = posts.filter((p) => p.path.endsWith("/question-reply"));
      assert.equal(adds.length, 1);
      assert(adds[0].body.text.includes("call_test"));
      assert(adds[0].body.text.includes("Вижу на основном экране"));
      assert.equal(adds[0].body.expectedTurnId, "turn_test");
      assert.equal(
        posts.filter((p) => p.path.includes("/queue/")).length,
        0,
        "answer delivery is one Hub operation, without manual Steer",
      );
      await expect(page.locator(".queue-heading")).toHaveCount(0);
      await expect(page.locator(".queue-text")).toHaveCount(0);
      assert(
        !(await page.locator("main").innerText()).includes("send_user_message_question_reply"),
      );
      await page.getByRole("button", { name: "Переоткрыть", exact: true }).click();
      await expect(page.getByRole("button", { name: "Ответить", exact: true })).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "Черновик сообщения" })).toHaveValue(
        "Сохрани основной черновик",
      );
      await page.getByRole("button", { name: "Другой вопрос", exact: true }).click();
      await expect(page.getByRole("button", { name: "Ответить", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Ответ с компьютера", exact: true }).click();
      await expect(page.getByRole("button", { name: "Ответить", exact: true })).toHaveCount(0);
      assert(
        !(await page.locator("main").innerText()).includes("send_user_message_question_reply"),
      );
      assert.equal(posts.filter((p) => p.path.endsWith("/question-reply")).length, 1);
      await page.getByRole("button", { name: "Вопрос для плана", exact: true }).click();
      const plan = page.locator(".approval");
      await expect(plan.getByRole("button", { name: "Ответить", exact: true })).toBeDisabled();
      await plan.getByRole("radio", { name: "B", exact: true }).check();
      await plan.getByRole("textbox", { name: "Свой ответ: Детали плана?" }).fill("Сначала проект");
      await plan.getByRole("button", { name: "Ответить", exact: true }).click();
      await expect(page.getByLabel("Ответ режима плана")).toHaveText(
        JSON.stringify({
          id: "plan_request",
          answers: { choice: ["B"], free: ["Сначала проект"] },
        }),
      );
      assert.equal(
        posts.filter((p) => p.path.endsWith("/question-reply")).length,
        1,
        "plan answers use native request response, never async envelopes or queue",
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `.local/qa-codex-questions/${name}-answered.png`,
        fullPage: true,
      });
      console.log(
        name +
          ": questions, exact reply, retained draft, lost confirmation, and model refresh passed",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
