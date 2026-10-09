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
          if (path === "/rendered.svg")
            return route.fulfill({
              contentType: "image/svg+xml",
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="teal"/></svg>',
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
        const imageLayout = page.getByTestId("image-layout");
        const imagePlaceholder = imageLayout.locator(".gpt-rich-image-unavailable");
        await expect(imagePlaceholder).toContainText("Иллюстрация недоступна");
        const imageBox = await imagePlaceholder.boundingBox();
        const descriptionBox = await imageLayout.locator('[data-layout="box"]').boundingBox();
        assert.ok(imageBox.width <= 155.1, "missing image respects native maxWidth");
        assert.ok(Math.abs(imageBox.width / imageBox.height - 4 / 3) < 0.02, "native aspect ratio");
        assert.ok(descriptionBox.width >= 140, "missing image does not squeeze the description");
        assert.ok(
          descriptionBox.x >= imageBox.x + imageBox.width,
          "description stays beside image",
        );
        await imageLayout.screenshot({ path: join(evidence, `${name}-image-${width}.png`) });
        const corpus = page.getByTestId("corpus");
        await expect(corpus.getByText("Загрузка иллюстрации…", { exact: true })).toHaveCount(2);
        for (const entry of [page.getByTestId("corpus-chat"), page.getByTestId("corpus-steps")]) {
          const svg = entry.locator('svg[aria-label="Vocal game"]');
          await expect(svg.locator("line")).toHaveCount(6);
          await expect(svg.locator("text")).toHaveText("Score 400");
          assert.equal(await svg.evaluate((n) => n.namespaceURI), "http://www.w3.org/2000/svg");
          await expect(svg.locator("linearGradient")).toHaveCount(1);
          const paint = await svg.locator("linearGradient").getAttribute("id");
          await expect(svg.locator("rect")).toHaveAttribute("fill", "url(#" + paint + ")");
          await expect(entry).toContainText("Supported sibling after unknown widget");
          await expect(entry.locator(".gpt-rich-unsupported pre")).toHaveText(
            "<unknown-widget>Keep unsupported content</unknown-widget>",
          );
          await entry.getByRole("button", { name: /Context.txt/ }).click();
          await expect(corpus.locator("output")).toHaveText("/api/gpt/files/corpus");
        }
        const ids = await corpus
          .locator("linearGradient")
          .evaluateAll((nodes) => nodes.map((n) => n.id));
        assert.equal(new Set(ids).size, 2, "SVG references belong to the exact drawing");
        await corpus.getByRole("button", { name: "Resolve metadata" }).click();
        await expect(corpus.getByRole("img", { name: "Original photo" })).toHaveCount(2);
        await expect(corpus.getByRole("link", { name: "Original source" })).toHaveCount(2);
        assert.ok(
          await corpus
            .getByRole("img", { name: "Original photo" })
            .first()
            .evaluate((n) => n.complete && n.naturalWidth > 0),
        );
        await corpus.getByRole("button", { name: "Toggle corpus" }).click();
        await corpus.getByRole("button", { name: "Toggle corpus" }).click();
        await expect(corpus.getByRole("img", { name: "Original photo" })).toHaveCount(2);
        await corpus.screenshot({ path: join(evidence, name + "-corpus-" + width + ".png") });
        const bodyTemplate = page.getByTestId("body-template");
        await expect(bodyTemplate.locator('[data-layout="grid"]')).toHaveCount(3);
        await expect(bodyTemplate.locator('[data-layout="grid-item"]')).toHaveCount(15);
        await expect(bodyTemplate).not.toContainText(/\{@body|\{#each|\{t\.|\{c\}/);
        await expect(bodyTemplate).toContainText("Need for Speed");
        const diagramHeader = bodyTemplate.locator('[data-layout="row"]').first();
        const headerIcon = diagramHeader.locator('[data-icon="layers"]');
        await expect(headerIcon).toHaveCount(1);
        await expect(headerIcon.locator("svg path")).toHaveAttribute("d", /m12 3 10 6/);
        await expect(diagramHeader).toHaveCSS("flex-wrap", "nowrap");
        await expect(diagramHeader.locator("p")).toHaveCSS("margin-top", "0px");
        const iconBounds = await headerIcon.boundingBox(),
          textBounds = await diagramHeader.locator("p").boundingBox();
        assert.ok(
          iconBounds.x + iconBounds.width <= textBounds.x,
          "icon stays beside wrapped title",
        );
        assert.ok(
          iconBounds.y >= textBounds.y && iconBounds.y < textBounds.y + textBounds.height,
          "icon does not occupy a separate line",
        );
        const cells = bodyTemplate.locator('[data-layout="grid-item"] > [data-layout="box"]');
        await expect(cells.nth(2)).toHaveCSS("background-color", "rgba(74, 144, 113, 0.13)");
        await expect(cells.nth(2)).toHaveCSS("padding-left", "4px");
        await expect(cells.nth(2)).toHaveCSS("padding-top", "8px");
        await expect(cells.nth(2)).toHaveCSS("min-height", "42px");
        const firstRow = await cells.evaluateAll((nodes) =>
          nodes.slice(0, 5).map((n) => n.getBoundingClientRect().top),
        );
        assert.ok(
          firstRow.every((y) => y === firstRow[0]),
          "five explicit tabs stay in one row",
        );
        await bodyTemplate.screenshot({ path: join(evidence, `${name}-body-${width}.png`) });
        if (width === 390) {
          for (const theme of ["organizer", "classic-dark", "hitech-2000s"]) {
            await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
            assert.notEqual(
              await cells.nth(0).evaluate((n) => getComputedStyle(n).backgroundColor),
              await cells.nth(2).evaluate((n) => getComputedStyle(n).backgroundColor),
            );
            await bodyTemplate.screenshot({
              path: join(evidence, `${name}-body-${theme}-${width}.png`),
            });
          }
          await page.evaluate(() => (document.documentElement.dataset.theme = "crt-green"));
        }
        const each = page.getByTestId("each");
        await expect(each.locator('[data-layout="row"]')).toHaveCount(5);
        await expect(each).toContainText("Continue game");
        await expect(each).toContainText("Exit game");
        await expect(each).not.toContainText("{#each");
        await expect(each).not.toContainText("{item.");
        await expect(each.locator('[data-icon="users"]')).toHaveCount(1);
        await expect(each.locator('[data-icon="minimize-2"]')).toHaveCount(1);
        await each.screenshot({ path: join(evidence, `${name}-each-${width}.png`) });
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
        const citations = page.getByTestId("citations");
        await expect(citations.locator(".gpt-file-citation")).toHaveCount(3);
        await expect(citations).toContainText("Файл · стр. 285–288");
        await expect(citations.locator("code")).toHaveText('<FileCite ref="file_chapter"/>');
        await citations
          .getByRole("button", { name: "Chapter.md · стр. 167–171", exact: true })
          .click();
        await expect(page.getByTestId("opened-citation")).toHaveText(
          "/api/gpt/native-assets/chat/user/file_chapter",
        );
        await citations.screenshot({ path: join(evidence, `${name}-citations-${width}.png`) });
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
