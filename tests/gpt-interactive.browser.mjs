import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";

const dir = await mkdtemp(join(tmpdir(), "gpt-interactive-"));
const evidence = process.env.GPT_INTERACTIVE_EVIDENCE;
if (evidence) await mkdir(evidence, { recursive: true });
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
        entry: resolve("apps/web/tests/fixtures/gpt-interactive.tsx"),
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
        .filter((p) => p.endsWith(".css"))
        .map((p) => readFile(join(dir, p), "utf8")),
    )
  ).join("\n");
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ])
    for (const width of [390, 1024]) {
      const browser = await type.launch();
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [],
        requests = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", async (r) => {
        if (new URL(r.request().url()).pathname === "/")
          return r.fulfill({
            contentType: "text/html; charset=utf-8",
            body: `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script>`,
          });
        requests.push(r.request().url());
        return r.fulfill({ status: 404 });
      });
      await page.goto("https://fixture.test/");
      const mixer = page.locator("#mixer"),
        ranges = mixer.getByRole("slider");
      await expect(ranges).toHaveCount(4);
      const vals = () => ranges.evaluateAll((es) => es.map((e) => e.value));
      assert.deepEqual(await vals(), ["90", "35", "75", "65"]);
      await expect(mixer.locator(".gpt-rich-icon svg")).toHaveCount(8);
      if (evidence) await mixer.screenshot({ path: join(evidence, `${name}-${width}-mixer.png`) });
      await expect(mixer).not.toContainText("{@body");
      await expect(mixer).not.toContainText("{#each");
      await ranges.first().focus();
      await page.keyboard.press("ArrowLeft");
      await expect(ranges.first()).toHaveValue("85");
      await expect(ranges.first()).toBeFocused();
      await expect(mixer).toContainText("85%");
      await mixer.getByRole("button", { name: "Изменить значение", exact: true }).first().click();
      await expect(ranges.first()).toHaveValue("0");
      await mixer.getByRole("button", { name: "Изменить значение", exact: true }).first().click();
      await expect(ranges.first()).toHaveValue("100");
      await mixer.getByRole("button", { name: "Чистое караоке", exact: true }).click();
      assert.deepEqual(await vals(), ["100", "0", "0", "65"]);
      await mixer.getByRole("button", { name: "Подпевание", exact: true }).click();
      assert.deepEqual(await vals(), ["100", "40", "40", "65"]);
      await mixer.getByRole("button", { name: "Дуэт с оригиналом", exact: true }).click();
      assert.deepEqual(await vals(), ["100", "0", "100", "65"]);
      await mixer.getByRole("button", { name: "Сброс", exact: true }).click();
      assert.deepEqual(await vals(), ["100", "0", "0", "65"]);
      assert.deepEqual(
        await page
          .locator("#independent")
          .getByRole("slider")
          .evaluateAll((es) => es.map((e) => e.value)),
        ["90", "35", "75", "65"],
      );
      const fields = page.locator("#fields");
      await fields.getByLabel("Name", { exact: true }).fill("Updated");
      await expect(fields).toContainText("Updated");
      await expect(fields.getByLabel("Name", { exact: true })).toBeFocused();
      await fields.getByLabel("Enabled", { exact: true }).check();
      await expect(fields).toContainText("On");
      await fields.getByLabel("Choice", { exact: true }).selectOption("B");
      await expect(fields.getByLabel("Name", { exact: true })).toHaveValue("B");
      await expect(fields.getByRole("button", { name: "Unsupported action" })).toBeDisabled();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ name, width, passed: true }));
      await browser.close();
    }
} finally {
  await rm(dir, { recursive: true, force: true });
}
