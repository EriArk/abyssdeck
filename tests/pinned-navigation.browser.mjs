import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "pinned-navigation-"));
const items = Array.from({ length: 6 }, (_, i) => ({
  id: "pin" + i,
  title: "Закреплённый " + i,
  pinned: true,
  updatedAt: 10 + i,
}));
items.push({ id: "live", title: "Активный без закрепления", pinned: false, updatedAt: 50 });
items.push({ id: "inactive", title: "Обычный неактивный", pinned: false, updatedAt: 60 });
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://fixture").pathname;
  const json = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  if (path === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>',
    );
  }
  if (path === "/icon.svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    return res.end(await readFile(resolve("apps/web/public/icon.svg")));
  }
  if (path === "/fixture.js") {
    res.setHeader("Content-Type", "text/javascript");
    return res.end(await readFile(join(dir, "fixture.js")));
  }
  if (path === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    return res.end(
      (
        await Promise.all(
          (
            await readdir(dir)
          )
            .filter((f) => f.endsWith(".css"))
            .map((f) => readFile(join(dir, f), "utf8")),
        )
      ).join("\n"),
    );
  }
  if (/^\/fonts\/[a-zA-Z0-9._-]+\.woff2$/.test(path)) {
    res.setHeader("Content-Type", "font/woff2");
    return res.end(await readFile(resolve("apps/web/public" + path)));
  }
  if (path === "/api/gpt/status")
    return json({ configured: true, canSend: true, state: "healthy" });
  if (path === "/api/gpt/models") return json({ models: [], efforts: [] });
  if (path === "/api/gpt/conversations")
    return json({
      items: items.map((item, i) => ({
        ...item,
        pinnedOrder: i,
        ...(i === 0 ? { projectId: "g-p-test" } : {}),
      })),
      pinnedIds: items.filter((i) => i.pinned).map((i) => i.id),
      nextOffset: null,
    });
  if (path === "/api/gpt/projects")
    return json({ items: [{ id: "g-p-test", name: "Project" }], conversations: [] });
  if (path === "/api/gpt/jobs")
    return json({
      items: [
        {
          id: "pending-new",
          status: "queued",
          text: "Новая ожидающая отправка",
          files: [],
          assets: [],
          createdAt: 51,
          updatedAt: 51,
        },
        {
          id: "job",
          nativeId: "live",
          status: "running",
          text: "Working",
          files: [],
          assets: [],
          updatedAt: 50,
        },
      ],
      stamp: 1,
    });
  if (path.endsWith("/messages"))
    return json({ items: [], nextBefore: null, revision: "1", prefix: "1" });
  return json({ items: [], conversations: [], nextOffset: null });
});
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
        entry: resolve("apps/web/tests/fixtures/pinned-navigation.tsx"),
        name: "PinnedFixture",
        formats: ["iife"],
        fileName: () => "fixture.js",
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  await mkdir(".local/qa-pinned", { recursive: true });
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch();
    try {
      for (const mode of ["gpt", "codex"]) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          hasTouch: true,
        });
        const page = await context.newPage();
        let catalogReads = 0;
        let extraChats =
          mode === "gpt"
            ? [{ id: "external-removal", title: "Удалён снаружи", updatedAt: 70, pinned: false }]
            : [];
        let failCatalog = false;
        const writes = [];
        page.on("request", (request) => {
          if (request.url().includes("/api/") && request.method() !== "GET")
            writes.push(request.url());
        });
        if (mode === "gpt") {
          await page.addInitScript(() => {
            if (sessionStorage.getItem("seeded-catalog")) return;
            sessionStorage.setItem("seeded-catalog", "1");
            localStorage.setItem(
              "gpt-navigation-cache-v1",
              JSON.stringify({
                version: 1,
                expires: Date.now() + 86400000,
                projects: [],
                offset: null,
                items: [
                  { id: "old-cache-ghost", title: "Старый фантом", updatedAt: 80, pinned: false },
                ],
              }),
            );
          });
          await page.route("**/api/gpt/conversations?*", async (route) => {
            catalogReads++;
            if (failCatalog) return route.fulfill({ status: 503, json: { error: "offline" } });
            return route.fulfill({
              json: {
                items: [
                  ...items.map((item, i) => ({
                    ...item,
                    pinnedOrder: i,
                    ...(i === 0 ? { projectId: "g-p-test" } : {}),
                  })),
                  ...extraChats,
                ],
                pinnedIds: items.filter((item) => item.pinned).map((item) => item.id),
                nextOffset: null,
                library: [
                  {
                    kind: "thread",
                    id: "external-removal",
                    name: "Удалён снаружи",
                    archived: false,
                  },
                ],
              },
            });
          });
        }
        await page.goto(origin + "/?" + mode);
        const show = async () => {
          if (mode === "gpt")
            await page.getByRole("button", { name: "Открыть проекты", exact: true }).tap();
          else await page.getByRole("button", { name: /^Диалоги/ }).tap();
        };
        await show();
        const panel = page.locator(".pinned-panel:visible");
        await expect(panel.locator(".entity-row")).toHaveCount(3);
        assert.deepEqual(
          await panel
            .locator(".nav-thread > span")
            .allTextContents()
            .then((values) => values.filter(Boolean)),
          mode === "gpt"
            ? ["Закреплённый 0", "Закреплённый 1", "Закреплённый 2"]
            : ["Закреплённый 5", "Закреплённый 4", "Закреплённый 3"],
        );
        const live = page
          .getByRole("button", { name: /^Активный без закрепления/ })
          .filter({ visible: true });
        await expect(live).toBeVisible();
        if (mode === "gpt") {
          await expect(
            page.getByRole("button", { name: "Старый фантом", exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("button", { name: "Удалён снаружи", exact: true }),
          ).toBeVisible();
          // Failed refresh keeps the existing list. Successful native absence removes
          // the row without a library tombstone, deletion request or user cache reset.
          failCatalog = true;
          let before = catalogReads;
          await page.evaluate(() => window.dispatchEvent(new Event("online")));
          await expect.poll(() => catalogReads).toBeGreaterThan(before);
          await expect(
            page.getByRole("button", { name: "Удалён снаружи", exact: true }),
          ).toBeVisible();
          await page.waitForTimeout(150);
          failCatalog = false;
          extraChats = [];
          before = catalogReads;
          await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
          await expect.poll(() => catalogReads).toBeGreaterThan(before);
          await expect(
            page.getByRole("button", { name: "Удалён снаружи", exact: true }),
          ).toHaveCount(0);
          assert(
            (await live.boundingBox()).y >=
              (await panel.boundingBox()).y + (await panel.boundingBox()).height,
          );
          const pending = page
            .getByRole("button", { name: /^Новая ожидающая отправка/ })
            .filter({ visible: true });
          assert(
            (await pending.boundingBox()).y >=
              (await panel.boundingBox()).y + (await panel.boundingBox()).height,
          );
          const inactive = page
            .getByRole("button", { name: "Обычный неактивный", exact: true })
            .filter({ visible: true });
          assert((await live.boundingBox()).y < (await inactive.boundingBox()).y);
        } else assert((await live.boundingBox()).y < (await panel.boundingBox()).y);
        await panel.getByRole("button", { name: "Показать все закреплённые" }).tap();
        await expect(panel.locator(".entity-row")).toHaveCount(6);
        await page.reload();
        await show();
        await expect(panel.locator(".entity-row")).toHaveCount(6);
        await panel.getByRole("button", { name: "Свернуть закреплённые" }).tap();
        await expect(panel.locator(".entity-row")).toHaveCount(3);
        const toggle = panel.getByRole("button", { name: "Показать все закреплённые" });
        assert((await toggle.boundingBox()).height >= 44);
        for (const theme of ["crt-green", "organizer", "hitech-2000s", "classic-dark"]) {
          await page.evaluate((theme) => {
            document.documentElement.dataset.theme = theme;
          }, theme);
          await page.screenshot({ path: `.local/qa-pinned/${engine}-${mode}-${theme}.png` });
          assert.equal(await panel.evaluate((el) => getComputedStyle(el).borderTopStyle), "solid");
        }
        // Row actions stay reachable without expanding the rest of the pins.
        await panel.locator(".entity-row").first().locator("button").last().tap();
        await expect(
          page.getByRole("dialog", {
            name: mode === "gpt" ? "Закреплённый 0" : "Закреплённый 5",
            exact: true,
          }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        assert.deepEqual(writes, [], "navigation recovery must never send or mutate native chats");
        if (mode === "codex") {
          await page.goto(origin + "/?doctor");
          await page.getByRole("button", { name: /^Проекты/ }).click();
          await expect(page.getByRole("button", { name: /^Bridge Doctor/ })).toHaveCount(0);
          await page.getByRole("button", { name: /^Диалоги/ }).click();
          const doctor = page.getByRole("button", { name: /^Bridge Doctor/ });
          await expect(doctor).toBeVisible();
          await doctor.click();
          assert.equal(await page.locator("body").getAttribute("data-selected"), "doctor");
          await page.screenshot({ path: `.local/qa-pinned/${engine}-doctor.png` });
        }
        await context.close();
        console.log(
          engine +
            " " +
            mode +
            ": native pin order, project pin visibility, expand/persist, live priority, actions, themes OK",
        );
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
  server.closeAllConnections();
  await rm(dir, { recursive: true, force: true });
}
