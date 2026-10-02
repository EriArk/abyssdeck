import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "codex-copy-"));
try {
  await build({
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    root: resolve("apps/web"),
    plugins: [react()],
    logLevel: "error",
    build: {
      outDir: dir,
      emptyOutDir: true,
      lib: {
        entry: resolve("apps/web/tests/fixtures/gpt-outbox.tsx"),
        name: "GptOutboxFixture",
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

  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => localStorage.setItem("gpt-conversation", "current-chat"));
      const base = {
        nativeId: "current-chat",
        text: "Earlier accepted message",
        model: "Latest",
        effort: "2",
        files: [],
        error: "",
        answer: "",
        assets: [],
        updatedAt: Date.now(),
      };
      const jobs = [
        { ...base, id: "earlier", createdAt: Date.now() - 2000, status: "unknown" },
        {
          ...base,
          id: "follower",
          text: "Queued follower",
          createdAt: Date.now() - 1000,
          status: "queued",
        },
      ];
      let history = [];
      let cancelled = 0,
        seen = 0;
      await page.route("https://progress.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/fixture.js")
          return route.fulfill({ contentType: "application/javascript", body: js });
        if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
        if (path === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
          });
        let json = { items: [], conversations: [], nextOffset: null };
        if (path.endsWith("/cancel")) {
          cancelled++;
          return route.fulfill({ status: 500, json: {} });
        }
        if (path.endsWith("/seen")) {
          seen++;
          return route.fulfill({ json: {} });
        }
        if (path === "/api/gpt/status")
          json = { configured: true, canSend: true, state: "healthy" };
        if (path === "/api/gpt/models")
          json = {
            models: [{ id: "Latest", label: "Latest" }],
            efforts: [{ id: "2", label: "High" }],
            currentModel: "Latest",
            currentEffort: "2",
          };
        if (path === "/api/gpt/jobs")
          json = {
            items: jobs,
            stamp: Date.now(),
            live: {
              jobId: "earlier",
              items: [
                {
                  id: "live",
                  kind: "commentary",
                  text: "Earlier response is still writing",
                  activity: "tool",
                },
              ],
            },
          };
        if (path === "/api/gpt/attention")
          json = { items: [{ conversationId: "unread-chat", completedId: "unseen-final" }] };
        const conversations = [
          { id: "current-chat", title: "Current chat", projectId: "project-gpt", updatedAt: 1 },
          {
            id: "unread-chat",
            title: "Unread finished chat",
            projectId: "project-gpt",
            updatedAt: 2,
          },
        ];
        if (path === "/api/gpt/projects")
          json = { items: [{ id: "project-gpt", name: "Audit project" }], conversations };
        if (path === "/api/gpt/conversations") json = { items: conversations, nextOffset: null };
        if (path === "/api/workspace/overview")
          json = { threads: [], tasks: [], plans: [], results: [], pins: [], notes: [] };
        if (path === "/api/workspace/navigation") json = { shortcuts: {}, pinned: [], recent: [] };
        if (path.endsWith("/messages"))
          json = {
            nativeId: "current-chat",
            title: "Current chat",
            items: history,
            nextBefore: null,
          };
        return route.fulfill({ json });
      });
      await page.goto("https://progress.test");
      const progress = page.locator(".gpt-status-row .gpt-progress-panel");
      await expect(progress).toContainText("Earlier response is still writing");
      await expect(
        progress.getByRole("button", { name: "Остановить GPT", exact: true }),
      ).toHaveCount(0);
      await progress.getByRole("button", { name: "Ход ответа GPT", exact: true }).click();
      await expect(progress.locator(".gpt-progress-details")).toContainText(
        "Earlier response is still writing",
      );
      await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
      const drawer = page.locator(".project-sheet");
      await drawer.getByRole("button", { name: "Audit project", exact: true }).click();
      await drawer.getByRole("button", { name: "Обзор проекта", exact: true }).click();
      const row = page
        .locator(".project-overview-modal .overview-row")
        .filter({ hasText: "Unread finished chat" });
      await expect(
        row.getByRole("img", { name: "Завершено, не просмотрено: 1", exact: true }),
      ).toBeVisible();
      assert.equal(cancelled, 0);
      assert.equal(seen, 0, "opening overview never marks an unopened answer read");
      // A stopped response with only a recent tool step must not return as
      // external activity when the durable outbox no longer calls it running.
      const now = Date.now();
      history = [
        { id: "exact-user", role: "user", text: base.text, files: [], createdAt: now / 1000 },
        {
          id: "tool-step",
          role: "assistant",
          phase: "commentary",
          complete: false,
          activity: "tool",
          text: "Working with tools",
          files: [],
          createdAt: now / 1000,
        },
      ];
      for (const status of ["idle", "cancelled", "completed"]) {
        jobs.splice(
          0,
          jobs.length,
          {
            ...base,
            id: "earlier",
            userMessageId: "exact-user",
            createdAt: now,
            status,
          },
          {
            ...base,
            id: "follower",
            text: "Queued follower",
            createdAt: now + 1,
            status: "cancelled",
          },
        );
        await page.reload();
        await expect(page.getByText(base.text, { exact: true }).first()).toBeVisible();
        await expect(progress).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Отправить GPT", exact: true }),
        ).toBeVisible();
      }
      history.push({ ...history[0], id: "new-user" }, { ...history[1], id: "new-tool" });
      await page.reload();
      await expect(progress).toBeVisible();
      assert.equal(cancelled, 0, "readback never issues Stop");
      assert.deepEqual(errors, []);
      console.log(
        `${name}: earlier uncertain live response wins over queued followers; project overview preserves unread marker`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
