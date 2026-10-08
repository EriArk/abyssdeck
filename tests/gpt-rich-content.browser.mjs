import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "gpt-rich-"));
const evidence = resolve(process.env.GPT_RICH_EVIDENCE || ".tmp/gpt-rich-evidence");
const samples = process.env.GPT_RICH_SAMPLES
  ? JSON.parse(await readFile(process.env.GPT_RICH_SAMPLES, "utf8"))
  : [];
await mkdir(evidence, { recursive: true });
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
        entry: resolve("apps/web/tests/fixtures/gpt-rich-content.tsx"),
        name: "Rich",
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
        .filter((p) => p.endsWith(".css"))
        .map((p) => readFile(join(dir, p), "utf8")),
    )
  ).join("\n");
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 820, 1366]) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
          serviceWorkers: "block",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "clipboard", {
            value: {
              writeText: async (text) => {
                window.copiedText = text;
              },
            },
          });
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        let reads = 0,
          pause = false,
          staleCard = false;
        const pending = [];
        await page.route("https://rich.test/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/")
            return route.fulfill({
              contentType: "text/html",
              body: '<!doctype html><meta charset="utf-8"><div id="root"></div><link rel="stylesheet" href="/fixture.css"><script src="/fixture.js"></script>',
            });
          if (path === "/fixture.js")
            return route.fulfill({ contentType: "application/javascript", body: js });
          if (path === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
          if (path.endsWith("/results")) {
            reads++;
            if (pause) await new Promise((done) => pending.push(done));
            return route
              .fulfill({
                json: {
                  items: staleCard
                    ? [
                        {
                          id: "reasoning-request",
                          turnId: "request",
                          type: "reasoning",
                          title: "Write the next chapter",
                          createdAt: new Date(1000).toISOString(),
                          payload: { text: "Write the next chapter", steps: [] },
                        },
                      ]
                    : [],
                  nextBefore: null,
                  counts: {
                    all: 0,
                    files: 0,
                    images: 0,
                    links: 0,
                    demos: 0,
                    reasoning: 0,
                    work: 0,
                  },
                },
              })
              .catch(() => {});
          }
          return route.fulfill({ status: 404, body: "Missing fixture route" });
        });
        await page.goto("https://rich.test/");
        await expect(page.getByTestId("rich").locator("strong").first()).toHaveText(
          "1. Arcade / AbyssTail Arcade",
        );
        await expect(page.getByTestId("rich").locator("pre")).toHaveCount(1);
        await expect(page.getByTestId("rich").locator("pre")).toContainText("Keep this code");
        await expect(page.getByTestId("rich").locator("table")).toHaveCount(1);
        await expect(page.getByTestId("user")).toContainText(
          "<box><text>User code stays literal</text></box>",
        );
        await expect(page.getByTestId("steps").locator("strong")).toHaveText("Searching");
        await expect(page.getByTestId("steps").locator("ul li")).toHaveCount(2);
        await expect(page.getByTestId("rich").locator(".gpt-rich-list li")).toHaveCount(2);
        await expect(page.getByTestId("rich")).toContainText("Play Example Game with friends.");
        await expect(
          page.getByTestId("rich").getByRole("link", { name: "Game details" }),
        ).toHaveAttribute("href", "https://example.com/game");
        await expect(page.getByTestId("unsafe").locator("[data-layout=box]")).not.toHaveAttribute(
          "onclick",
        );
        assert.equal(await page.evaluate(() => window.pwned), undefined);
        assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
        await page.getByRole("button", { name: "Queue request", exact: true }).click();
        await expect(page.locator('[data-result="reasoning-request"]')).toHaveCount(0);
        pause = true;
        staleCard = true;
        await page.getByRole("button", { name: "Confirm request", exact: true }).click();
        await expect(page.locator('[data-result="reasoning-request"]')).toHaveCount(1);
        await expect(page.locator('[data-result="reasoning-request"]')).toContainText(
          "Write the next chapter",
        );
        const before = reads;
        await page.waitForTimeout(800);
        assert.ok(reads - before <= 1, "no extra polling for immediate cards");
        await page.getByRole("button", { name: "Canonical history", exact: true }).click();
        await expect(page.locator('[data-result="reasoning-request"]')).toHaveCount(1);
        await page.getByRole("button", { name: "Public summary event", exact: true }).click();
        const card = page.locator('[data-result="reasoning-request"]');
        await card.locator("summary").first().click();
        await expect(card).toContainText("Reviewing the repository and documentation");
        pause = false;
        for (const done of pending.splice(0)) done();
        await expect(card).toContainText("Reviewing the repository and documentation");
        await page.getByTestId("live-chat").getByRole("button", { name: "Ход ответа GPT" }).click();
        await expect(page.getByTestId("live-chat")).toContainText(
          "Reviewing the repository and documentation",
        );
        await page.getByRole("button", { name: "Local stream ended" }).click();
        await page
          .getByTestId("live-chat")
          .getByRole("button", { name: "Этапы ответа", exact: true })
          .click();
        await expect(page.getByTestId("live-chat")).toContainText(
          "Reviewing the repository and documentation",
        );
        await expect(page.getByTestId("memory")).not.toContainText("<MemoryCite");
        await expect(page.getByTestId("memory")).toContainText("Память");
        const writing = page.getByTestId("writing");
        await expect(writing.locator(".gpt-writing-block")).toHaveCount(1);
        await expect(writing).not.toContainText("<WritingBlock");
        await expect(writing.locator("strong")).toHaveText("Good news");
        await expect(writing).toContainText("No specific date promised.");
        await writing.getByRole("button", { name: "Копировать текст блока", exact: true }).click();
        assert.equal(
          await page.evaluate(() => window.copiedText),
          "Heyo! 😁 No worries!\n\n**Good news** — the book server software is nearly finished.\n\nI'll share an update here as soon as it's ready! 😁",
        );
        await writing.screenshot({ path: join(evidence, `${name}-writing-${width}.png`) });
        await expect(page.getByLabel("Draft")).toHaveValue("Keep my draft");
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          "no document overflow",
        );
        await page.getByTestId("rich").screenshot({ path: join(evidence, `${name}-${width}.png`) });
        for (const [index, sample] of samples.entries()) {
          await page.evaluate(
            (value) => window.dispatchEvent(new CustomEvent("native-sample", { detail: value })),
            sample,
          );
          await expect(page.getByTestId("rich").locator(".gpt-rich").first()).toBeVisible();
          await expect(page.getByTestId("rich")).not.toContainText(
            /<(?:box|row|grid|list|caption|Entity|Link|Cite|AsyncImage)\b/,
          );
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          if (width === 390)
            await page
              .getByTestId("rich")
              .screenshot({ path: join(evidence, `${name}-native-${index}.png`) });
        }
        assert.deepEqual(errors, []);
        pause = false;
        for (const done of pending) done();
        await context.close();
        console.log(
          `${name} ${width}: rich layout, literal code, public steps, immediate request and draft passed`,
        );
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
