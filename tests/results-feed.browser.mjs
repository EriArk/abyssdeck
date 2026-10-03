import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "results-feed-"));
const evidence = ".local/qa-results-feed";
await mkdir(evidence, { recursive: true });
let server;
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
        entry: resolve("apps/web/tests/fixtures/results-feed.tsx"),
        name: "Fixture",
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
          .filter((n) => n.endsWith(".css"))
          .map((n) => readFile(join(dir, n), "utf8")),
      )
    ).join("\n");
  const pictures = [
    await readFile("polish/05-files/preview-toolbar/crt-green-1366.png"),
    await readFile("polish/05-files/preview-toolbar/organizer-1366.png"),
  ];
  const common = { threadId: "chat", turnId: "turn", createdAt: "2026-10-03T12:00:00Z" };
  const make = (id, type, title, payload) => ({ ...common, id, type, title, payload });
  const items = [
    make("file", "file", "Инструкция по интерфейсу.md", {
      url: "/api/gpt/assets/file-md",
      mime: "text/markdown",
      bytes: 3400,
    }),
    make("image", "image", "Зелёная тема.png", {
      url: "/api/gpt/assets/file-image",
      mime: "image/png",
      bytes: pictures[0].length,
    }),
    make("image2", "image", "Органайзер.png", {
      url: "/api/gpt/assets/file-image2",
      mime: "image/png",
      bytes: pictures[1].length,
    }),
    make("link", "link", "Обсуждение интерфейса", {
      url: "https://example.org/issue",
      excerpt: "Описание и источник обсуждения",
    }),
    make("demo", "preview", "Эскиз результатов", {
      url: "/api/previews/demo",
      excerpt: "Интерактивное предложение",
    }),
    make("reasoning", "reasoning", "Проверить интерфейс и сохранить снимки", {
      codexTurn: true,
      revision: 1,
      text: "Проверить интерфейс и сохранить снимки",
    }),
  ];
  const category = {
    file: "files",
    image: "images",
    link: "links",
    preview: "demos",
    reasoning: "reasoning",
  };
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const json = (value) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    if (url.pathname.endsWith("/results"))
      return json({
        items: items
          .filter((i) => category[i.type] === url.searchParams.get("category"))
          .map((i) =>
            url.pathname.includes("/gpt/") && i.type === "reasoning"
              ? {
                  ...i,
                  payload: {
                    text: i.title,
                    steps: [
                      {
                        id: "gpt-step",
                        text: "Публичный шаг GPT",
                        activity: "code",
                        state: "complete",
                      },
                    ],
                  },
                }
              : i,
          ),
        counts: { all: 6, files: 1, images: 2, links: 1, demos: 1, reasoning: 1, work: 0 },
        nextBefore: null,
      });
    if (url.pathname.endsWith("/reasoning/work")) return json({ items: [], nextBefore: null });
    if (url.pathname.endsWith("/reasoning"))
      return json({
        items: [
          {
            id: "summary",
            kind: "summary",
            label: "Codex",
            text: "Проверяю существующие экраны и сохраняю их структуру.",
          },
          {
            id: "work",
            kind: "work",
            label: "Проверка",
            result: make("check", "check", "Проверка", { command: "pnpm test", exitCode: 0 }),
          },
          {
            id: "summary2",
            kind: "summary",
            label: "Codex",
            text: "Проверка завершена. Перехожу к снимкам.",
          },
        ],
        nextAfter: null,
      });
    if (url.pathname.endsWith("/output"))
      return json({ available: true, text: "All tests passed", truncated: false });
    if (url.pathname === "/api/gpt/assets/file-md") {
      res.setHeader("Content-Type", "text/markdown");
      res.setHeader("Content-Disposition", 'attachment; filename="guide.md"');
      return res.end("# Document\n\nExact original bytes\n");
    }
    if (
      url.pathname === "/api/gpt/assets/file-image" ||
      url.pathname === "/api/gpt/assets/file-image2"
    ) {
      res.setHeader("Content-Type", "image/png");
      return res.end(pictures[url.pathname.endsWith("image2") ? 1 : 0]);
    }
    if (url.pathname === "/fixture.js") {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      return res.end(js);
    }
    if (url.pathname === "/fixture.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(css);
    }
    if (
      url.pathname === "/api/team/result-snapshots" ||
      url.pathname === "/api/team/result-packages"
    )
      return json({
        id: "22222222-2222-4222-8222-222222222222",
        title: "results.zip",
        mime: "application/zip",
        bytes: 42,
      });
    if (url.pathname === "/api/team/brainstorm") return json({ rooms: [] });
    if (url.pathname === "/api/team/spaces") return json({ spaces: [] });
    if (url.pathname.startsWith("/api/")) return json({ items: [] });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="/fixture.css"/></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        acceptDownloads: true,
      });
      await page.addInitScript(() =>
        sessionStorage.setItem("codex-workspace-identity", "11111111-1111-4111-8111-111111111111"),
      );
      const failures = [];
      page.on("pageerror", (e) => (failures.push(e.message), console.error(e.message)));
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        for (const width of [390, 1024]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(origin);
          await page.evaluate((t) => {
            document.documentElement.dataset.theme = t;
            document.documentElement.dataset.caseColor = "red";
          }, theme);
          await expect(page.locator('[data-result="file"]')).toBeVisible();
          await page
            .getByRole("button", { name: "Действия: Инструкция по интерфейсу.md", exact: true })
            .click();
          await expect(page.getByRole("link", { name: "Скачать", exact: true })).toBeVisible();
          const anchor = await page.locator('[data-result="file"] .result-more').boundingBox();
          const menu = await page.locator(".result-action-menu:not([hidden])").boundingBox();
          assert(
            menu.y >= anchor.y + anchor.height,
            "menu opens beside its trigger, without an origin flash",
          );
          assert(menu.x >= 8 && menu.x + menu.width <= width - 8, "menu stays within viewport");
          await page.screenshot({ path: `${evidence}/${name}-${theme}-${width}-files-menu.png` });
          const download = page.waitForEvent("download");
          await page.getByRole("link", { name: "Скачать", exact: true }).click();
          assert.equal(
            await readFile(await (await download).path(), "utf8"),
            "# Document\n\nExact original bytes\n",
          );
          if (theme === "crt-green" && width === 390) {
            await page
              .getByRole("button", { name: "Выбрать несколько результатов", exact: true })
              .click();
            await page
              .getByRole("checkbox", { name: "Выбрать Инструкция по интерфейсу.md", exact: true })
              .check();
            await page.getByRole("button", { name: "Подготовить пакет", exact: true }).click();
            await expect(
              page.getByRole("link", { name: "Скачать ZIP", exact: true }),
            ).toBeVisible();
            await page.getByRole("button", { name: "Готово", exact: true }).click();
            await page
              .getByRole("button", { name: "Действия: Инструкция по интерфейсу.md", exact: true })
              .click();
            await page.getByRole("button", { name: "Отправить", exact: true }).click();
            await expect(
              page.getByRole("dialog", { name: "Отправить результат", exact: true }),
            ).toBeVisible();
            await page.getByRole("button", { name: "Закрыть отправку", exact: true }).click();
            await expect(page.locator('[data-result="file"]')).toBeVisible();
          }
          await page.getByRole("button", { name: "Изображения", exact: true }).click();
          await expect(page.locator(".result-picture img").first()).toBeVisible();
          const pic = await page.locator(".result-picture").first().boundingBox(),
            dots = await page.locator(".result-picture .result-more").first().boundingBox();
          assert(
            dots.y >= pic.y && dots.y < pic.y + 12 && dots.x + dots.width <= pic.x + pic.width,
          );
          await page.screenshot({ path: `${evidence}/${name}-${theme}-${width}-images.png` });
          if (theme === "crt-green" && width === 390) {
            await page.getByRole("button", { name: "Открыть снимок", exact: true }).first().click();
            await expect(page.getByRole("dialog", { name: "Просмотр файла" })).toBeVisible();
            await expect(page.locator(".image-gallery-navigation")).toContainText("1 из 2");
            await page.getByRole("button", { name: "Следующее изображение", exact: true }).click();
            await expect(page.locator(".image-gallery-navigation")).toContainText("2 из 2");
            await page.getByRole("button", { name: "Закрыть просмотр", exact: true }).click();
            await expect(page.locator(".result-picture")).toHaveCount(2);
          }
          await page
            .getByRole("button", { name: "Действия: Другие категории", exact: true })
            .click();
          await page.getByRole("button", { name: /^Ссылки/ }).click();
          const heading = page.locator('[data-result="link"] .result-entry-heading');
          await expect(heading).toBeVisible();
          await page.locator('[data-result="link"] summary').click();
          await page
            .getByRole("button", { name: "Действия: Обсуждение интерфейса", exact: true })
            .click();
          await page.getByRole("button", { name: "К сообщению", exact: true }).click();
          assert.equal(await page.evaluate(() => document.body.dataset.source), '["turn","chat"]');
          await expect(
            page.getByText("Описание и источник обсуждения", { exact: true }),
          ).toBeVisible();
          await page.getByRole("button", { name: "Рассуждения", exact: true }).click();
          await page.locator(".result-reasoning-details > summary").click();
          await page.locator(".result-work-step > summary").click();
          await expect(page.getByText("pnpm test", { exact: true })).toBeVisible();
          await page.locator(".command-output > summary").click();
          await expect(page.getByText("All tests passed", { exact: true })).toBeVisible();
          await page.locator(".result-reasoning-details > summary").click();
          await page.locator(".result-reasoning-details > summary").click();
          await expect(page.locator(".result-work-step")).toHaveAttribute("open", "");
          await page.getByRole("button", { name: "Файлы", exact: true }).click();
          await page.getByRole("button", { name: "Рассуждения", exact: true }).click();
          await expect(page.locator(".result-work-step")).toHaveAttribute("open", "");
          await page.screenshot({ path: `${evidence}/${name}-${theme}-${width}-reasoning.png` });
          assert(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          );
        }
      }
      await page.goto(origin + "?gpt");
      await page.getByRole("button", { name: "Рассуждения", exact: true }).click();
      await page.locator(".result-reasoning-details > summary").click();
      await expect(page.getByText("Публичный шаг GPT", { exact: true })).toBeVisible();
      assert.deepEqual(failures, []);
      console.log(
        JSON.stringify({
          browser: name,
          themes: 4,
          widths: [390, 1024],
          download: true,
          source: true,
          nestedDisclosure: true,
          gpt: true,
          gallery: true,
          package: true,
          sharing: true,
        }),
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
}
