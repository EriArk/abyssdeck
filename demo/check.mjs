import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { chromium, webkit, expect } from "@playwright/test";

const html = await readFile("demo/abyssdeck-demo.html");
const catalog = vm.runInNewContext((await readFile("demo/catalog.js", "utf8")) + "; FEATURES");
const out = resolve(".local/public-demo-check");
await mkdir(out, { recursive: true });
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === "/demo.html") res.end(html);
  else
    res.end(
      '<!doctype html><html lang="en"><title>Website embed check</title><body style="margin:0"><iframe title="AbyssDeck demo" src="./demo.html" sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox" style="width:100%;height:100dvh;border:0"></iframe></body></html>',
    );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  for (const [engine, launcher] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await launcher.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      });
      page.setDefaultTimeout(6000);
      const errors = [],
        requests = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (/^https?:/.test(r.url())) requests.push(r.url());
      });
      await page.goto(base);
      const app = page.frameLocator("iframe");
      await expect(app.locator("#workspace-header")).toContainText("Northstar");
      const close = async () => {
        for (let n = 0; n < 12 && (await app.locator(".demo-window:not([hidden])").count()); n++) {
          await page.keyboard.press("Escape");
        }
      };
      const open = async (id) => {
        await app.locator('.demo-bar [data-open="explore"]').click();
        await app.locator('.demo-window[data-id="explore"] [data-open="' + id + '"]').click();
      };
      for (const [id] of catalog) {
        console.log(`${engine}: open ${id}`);
        await open(id);
        if (!["codex", "gpt", "results"].includes(id)) {
          await expect(app.locator(`.demo-window[data-id="${id}"]`)).toBeVisible();
          assert.ok(
            (await app.locator(`.demo-window[data-id="${id}"] .window-body`).innerText()).trim()
              .length > 30,
            id,
          );
        }
        assert.equal(
          /[\u0400-\u04ff]/.test(await app.locator("body").innerText()),
          false,
          `English UI: ${id}`,
        );
        await close();
      }
      // Real local interactions: editor, draft retention, export, terminal, review.
      await open("viewer");
      const viewer = app.locator('[data-id="viewer"]');
      await viewer.getByRole("button", { name: "Toggle editing", exact: true }).click();
      await viewer.getByLabel("File content").fill("# Edited locally\n\nThis stays in the demo.");
      await viewer.locator(".minimize").click();
      await expect(app.locator("#dock")).toBeVisible();
      await app.locator('#dock [data-restore="viewer"]').click();
      await expect(viewer.getByLabel("File content")).toHaveValue(/Edited locally/);
      await viewer.getByRole("button", { name: "Save demo file", exact: true }).click();
      const dl = page.waitForEvent("download");
      await viewer.getByRole("button", { name: "Download file", exact: true }).click();
      const downloaded = await dl;
      console.log(`${engine}: download received`);
      assert.match(await readFile(await Promise.race([downloaded.path(), new Promise((_, reject) => setTimeout(() => reject(new Error("Download did not complete in the test browser")), 15000))]), "utf8"), /Edited locally/);
      await close();
      await open("devices");
      await app.getByLabel("Terminal command").fill("pnpm build");
      await app
        .locator('[data-id="devices"]')
        .getByRole("button", { name: "Enter", exact: true })
        .click();
      await expect(app.locator(".terminal")).toContainText("No command was executed");
      await close();
      await open("delivery");
      const delivery = app.locator('[data-id="delivery"]');
      await delivery.getByRole("button", { name: "Review", exact: true }).click();
      await delivery.getByRole("button", { name: "Confirm demo action", exact: true }).click();
      await expect(delivery.locator(".receipt")).toContainText("Nothing was sent to GitHub");
      await close();
      await app
        .getByLabel("Message", { exact: true })
        .fill("<img src=x onerror=alert(1)> prepare release");
      await app.getByRole("button", { name: "Send message", exact: true }).click();
      await expect(app.locator("#chat-feed")).toContainText("<img src=x onerror=alert(1)>");
      assert.equal(await app.locator('#chat-feed img[src="x"]').count(), 0);
      await page.reload();
      await expect(app.locator("#workspace-header")).toContainText("Northstar");
      // Fit all six finishes to the three ordinary layouts.
      for (const [layout, width, height] of [
        ["desktop", 1440, 1000],
        ["tablet", 1194, 834],
        ["phone", 393, 852],
      ]) {
        await page.setViewportSize({ width, height });
        for (const finish of ["burgundy", "blue", "red", "paper", "night", "classic"]) {
          await app.getByLabel("Theme", { exact: true }).selectOption(finish);
          const overflow = await app
            .locator("body")
            .evaluate((el) => el.scrollWidth > innerWidth + 1);
          assert.equal(overflow, false, `${engine}/${layout}/${finish} page overflow`);
          if (engine === "chromium")
            await page.screenshot({
              animations: "disabled",
              path: resolve(out, `${layout}-${finish}.png`),
            });
        }
        await open("files");
        const fileWindow = app.locator('[data-id="files"]');
        await expect(fileWindow.locator(".close")).toBeInViewport();
        if (engine === "chromium")
          await page.screenshot({
            animations: "disabled",
            path: resolve(out, `${layout}-files.png`),
          });
        await close();
      }
      assert.deepEqual(errors, [], `Browser errors: ${engine}`);
      assert.deepEqual(
        [...new Set(requests)].sort(),
        [base + "/", base + "/demo.html"].sort(),
        "No assets, API or external requests",
      );
      results.push({
        engine,
        features: catalog.length,
        layouts: 3,
        finishes: 6,
        errors,
        networkRequests: [...new Set(requests)],
      });
      console.log(
        `${engine}: ${catalog.length} feature entries, local edit/export, dock, terminal, review and responsive embed passed.`,
      );
    } finally {
      await browser.close();
    }
  }
  await writeFile(resolve(out, "checks.json"), JSON.stringify(results, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
