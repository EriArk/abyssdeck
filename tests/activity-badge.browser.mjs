import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "activity-badge-"));
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
        entry: resolve("apps/web/tests/fixtures/activity-badge.tsx"),
        name: "Fixture",
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
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch();
    try {
      for (const width of [390, 1024]) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.setContent(
          '<html data-theme="crt-green"><body><div id="root"></div></body></html>',
        );
        await page.addStyleTag({ content: css });
        await page.addScriptTag({ content: js });
        const row = (key) => page.locator(`[data-case="${key}"]`);
        await expect(
          row("mixed").getByRole("img", { name: "Активно: 1", exact: true }),
        ).toBeVisible();
        await expect(
          row("mixed").getByRole("img", { name: "Завершено, не просмотрено: 1", exact: true }),
        ).toBeVisible();
        await expect(row("mixed").locator(".spinner")).toHaveCount(1);
        await expect(row("mixed").locator('path[d="m5 12 4 4L19 6"]')).toHaveCount(1);
        await expect(row("single").locator(".spinner")).toHaveCount(1);
        await expect(row("single").locator(".is-unread")).toHaveCount(0);
        await expect(row("waiting").locator(".is-unread")).toHaveCount(0);
        await expect(
          row("success").getByRole("img", { name: "Завершено, не просмотрено: 1", exact: true }),
        ).toBeVisible();
        await expect(row("success").locator('path[d="m5 12 4 4L19 6"]')).toHaveCount(1);
        await expect(
          row("failure").getByRole("img", { name: "Требует проверки: 1", exact: true }),
        ).toBeVisible();
        await expect(row("failure").locator('path[d="m5 12 4 4L19 6"]')).toHaveCount(0);
        await expect(row("waiting").locator(".spinner")).toHaveCount(0);
        await expect(
          row("waiting").getByRole("img", { name: "Активно: 1, ждут ответа: 1", exact: true }),
        ).toBeVisible();
        await expect(row("empty").getByRole("img")).toHaveCount(0);
        await expect(row("counts").locator("b")).toHaveText(["0", "0"]);
        assert.deepEqual(errors, []);
        console.log(`${name} ${width}: activity indicators passed`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
