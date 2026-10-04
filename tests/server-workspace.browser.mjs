import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const dir = await mkdtemp(join(tmpdir(), "workspace-ui-"));
await mkdir(".local/qa-server-workspace", { recursive: true });
try {
  await build({
    configFile: false,
    root: resolve("apps/web"),
    plugins: [react()],
    logLevel: "error",
    build: {
      target: "esnext",
      outDir: dir,
      emptyOutDir: true,
      rolldownOptions: { input: resolve("apps/web/tests/fixtures/server-workspace.html") },
    },
  });
  const origin = "http://127.0.0.1:18879",
    fixture = await handoffFixture(origin, dir);
  await fixture.app.listen({ host: "127.0.0.1", port: 18879 });
  const browser = await (process.env.BROWSER === "webkit" ? webkit : chromium).launch();
  try {
    for (const theme of ["organizer", "crt-green", "hitech-2000s"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      });
      const [name, value] = fixture.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin }]);
      const page = await context.newPage();
      let state = "absent",
        active = false,
        creates = 0;
      await page.route("**/api/team/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/server-workspace")) {
          if (route.request().method() === "POST") {
            creates++;
            state = "ready";
          }
          return route.fulfill({ json: { available: true, state } });
        }
        if (path.endsWith("/server-workspace/connect")) {
          active = true;
          return route.fulfill({ json: { ok: true } });
        }
        if (path.endsWith("/machines"))
          return route.fulfill({
            json: {
              items: [],
              enabled: true,
              activeMachineIds: active ? ["server-workspace"] : [],
            },
          });
        if (path.endsWith("/me")) return route.fulfill({ json: { user: { role: "member" } } });
        return route.fulfill({ json: { items: [] } });
      });
      await page.goto(origin + "/tests/fixtures/server-workspace.html");
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await page.getByRole("button", { name: "Создать окружение", exact: true }).click();
      await page.getByRole("button", { name: "Подключить", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Открыть терминал", exact: true }),
      ).toBeVisible();
      assert.equal(creates, 1);
      await expect(page.getByText(/codex login|При создании проекта/)).toHaveCount(0);
      await expect(page.getByText(/Твои файлы находятся в \/workspace/)).toBeVisible();
      for (const width of [390, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({
          path: `.local/qa-server-workspace/${theme}-${width}.png`,
          fullPage: true,
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
console.log(
  "Server workspace enrollment UI: create/connect, phone/tablet and three themes passed.",
);
