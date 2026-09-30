import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "gpt-job-recovery-"));
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
        entry: resolve("apps/web/tests/fixtures/pinned-navigation.tsx"),
        name: "JobRecovery",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  const js = await readFile(join(dir, "fixture.js"), "utf8");
  const css = (
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
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.clock.install();
      await page.addInitScript(() => localStorage.setItem("gpt-conversation", "alpha"));
      const warning = "Проверки этого чата остановлены после повторных ошибок.";
      const job = (id) => ({
        id: "job-" + id,
        nativeId: id,
        status: "unknown",
        text: "Question " + id,
        answer: "",
        files: [],
        assets: [],
        progress: [],
        model: "latest",
        effort: "",
        error: warning,
        createdAt: 1000,
        updatedAt: 10,
      });
      const jobs = { alpha: job("alpha"), beta: job("beta") };
      const reads = [],
        writes = [];
      let holdNext = false,
        release;
      await page.route("https://jobs.test/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (path === "/")
          return route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
          });
        if (path === "/fixture.js")
          return route.fulfill({ contentType: "text/javascript", body: js });
        if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
        if (path.startsWith("/fonts/"))
          return route.fulfill({
            contentType: "font/woff2",
            body: await readFile(resolve("apps/web/public" + path)),
          });
        if (path === "/api/workspace/navigation")
          return route.fulfill({ json: { pinned: [], recent: [], shortcuts: {} } });
        if (request.method() !== "GET") writes.push(path);
        let data = { items: [], conversations: [], nextOffset: null };
        if (path === "/api/gpt/status")
          data = { configured: true, canSend: true, state: "healthy" };
        if (path === "/api/gpt/models")
          data = { models: [{ id: "latest", label: "Latest" }], efforts: [] };
        if (path === "/api/gpt/conversations")
          data = {
            items: ["alpha", "beta"].map((id) => ({ id, title: "Chat " + id, updatedAt: 1 })),
            nextOffset: null,
          };
        if (path.endsWith("/messages"))
          data = {
            items: [
              {
                id: "canonical-final",
                role: "assistant",
                complete: true,
                text: "A final answer is visible",
                files: [],
                createdAt: 2,
              },
            ],
            revision: "canonical",
            nextBefore: null,
          };
        if (path === "/api/gpt/jobs") {
          const scope = url.searchParams.get("nativeId"),
            after = Number(url.searchParams.get("after"));
          reads.push({ scope, after });
          // Simulate a delta that missed a status already available on the Hub.
          data = { items: after ? [] : [jobs[scope] ?? jobs.alpha], stamp: 100 };
          if (holdNext) {
            holdNext = false;
            await new Promise((resolve) => {
              release = resolve;
            });
          }
        }
        if (path.endsWith("/resolve")) {
          jobs.beta = {
            ...jobs.beta,
            status: "completed",
            error: "",
            answer: "Confirmed answer",
            updatedAt: 30,
          };
          data = { job: jobs.beta };
        }
        return route.fulfill({ json: data });
      });
      await page.goto("https://jobs.test/?gpt");
      const warningCard = page.locator(".gpt-job-error");
      await expect(warningCard).toContainText(warning);
      await expect(page.getByText("A final answer is visible", { exact: true })).toBeVisible();
      const textarea = page.locator(".gpt-input-row textarea");
      await textarea.fill("Preserve my draft");
      assert.equal(reads[0].after, 0);

      // Resume while a delta is still in flight: one follow-up snapshot must run.
      holdNext = true;
      await page.clock.fastForward(1200);
      await expect.poll(() => typeof release).toBe("function");
      assert.equal(reads.at(-1).after, 100);
      jobs.alpha = {
        ...jobs.alpha,
        status: "completed",
        error: "",
        answer: "Confirmed answer",
        updatedAt: 20,
      };
      const beforeResume = reads.length;
      await page.evaluate(() => {
        window.dispatchEvent(new Event("pageshow"));
        window.dispatchEvent(new Event("online"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      assert.equal(reads.length, beforeResume);
      release();
      await page.clock.runFor(100);
      await expect(warningCard).toHaveCount(0);
      assert.equal(reads.length, beforeResume + 1);
      assert.equal(reads.at(-1).after, 0);
      await expect(textarea).toHaveValue("Preserve my draft");
      assert.deepEqual(writes, []);

      const choose = async (id) => {
        await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
        await page.getByRole("button", { name: "Chat " + id, exact: true }).click();
        await expect.poll(() => reads.at(-1).scope).toBe(id);
        assert.equal(reads.at(-1).after, 0);
      };
      await choose("beta");
      // Seeing an unrelated/completed history answer must never erase uncertainty.
      await expect(warningCard).toContainText(warning);
      await choose("alpha");
      await expect(warningCard).toHaveCount(0);
      await expect(textarea).toHaveValue("Preserve my draft");
      await choose("beta");
      await expect(warningCard).toContainText(warning);
      const beforeFocus = reads.length;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => reads.length).toBeGreaterThan(beforeFocus);
      assert.equal(reads.at(-1).after, 0);
      await expect(warningCard).toContainText(warning);
      assert.deepEqual(writes, []);

      // Explicit confirmation consumes its own response; no later poll is needed.
      await page.getByRole("button", { name: "Проверено", exact: true }).click();
      await expect(warningCard).toHaveCount(0);
      assert.deepEqual(writes, ["/api/gpt/jobs/job-beta/resolve"]);
      assert.deepEqual(errors, []);
      console.log(
        `${name}: coalesced recovery, authoritative scope reopen, real uncertainty retained, immediate explicit confirmation, draft preserved, no automatic mutations`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
