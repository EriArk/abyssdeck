import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium, webkit, expect } from "@playwright/test";

const out = resolve(".local/real-demo-check");
await mkdir(out, { recursive: true });
const requests = [];
const server = createServer(async (req, res) => {
  requests.push(req.url);
  if (req.url === "/frame.html") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      '<!doctype html><html lang="en"><title>Demo embed</title><body style="margin:0"><iframe title="AbyssDeck demo" src="/nested/abyssdeck/index.html" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox" style="display:block;width:100%;height:100dvh;border:0"></iframe></body></html>',
    );
  }
  const name = decodeURIComponent((req.url || "").split("?")[0]).replace(
    /^\/nested\/abyssdeck\//,
    "",
  );
  const file = resolve("demo/site", name);
  if (
    !file.startsWith(resolve("demo/site") + "\\") &&
    !file.startsWith(resolve("demo/site") + "/")
  ) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const bytes = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".ttf": "font/ttf",
        ".txt": "text/plain",
      }[extname(file)] || "application/octet-stream",
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const findings = [];
try {
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (process.env.DEMO_ENGINE && process.env.DEMO_ENGINE !== name) continue;
    const browser = await engine.launch();
    let page;
    try {
      page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
        acceptDownloads: true,
      });
      page.setDefaultTimeout(10000);
      const errors = [],
        external = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (/^https?:/.test(r.url()) && !r.url().startsWith(origin + "/"))
          external.push(r.url());
      });
      const app = () => page.frameLocator("iframe");
      const fresh = async () => {
        await page.goto(origin + "/frame.html");
        await expect(
          app().getByRole("textbox", { name: "Codex message", exact: true }),
        ).toBeVisible();
        await page.waitForTimeout(300);
      };
      const click = (label) =>
        app().getByRole("button", { name: label, exact: true }).first().click();
      const english = async (label) => {
        const text = await app().locator("body").innerText();
        const lines = text.split("\n").filter((l) => /[\u0400-\u04ff]/.test(l));
        assert.deepEqual(lines, [], `${name} ${label}: untranslated text`);
      };
      await fresh();
      await english("chat");
      await app()
        .getByRole("textbox", { name: "Codex message", exact: true })
        .fill("Prepare a release summary.");
      await click("Send message");
      await expect(
        app().getByText(/This is a scripted demonstration/),
      ).toBeVisible();
      await fresh();
      await click("Project files");
      await click("Minimize window");
      await expect(app().locator(".window-dock-slot")).toBeVisible();
      await app().locator(".window-dock-slot").click();
      await app()
        .getByRole("button", { name: /^README\.md/ })
        .click();
      await click("Unlock and edit");
      await expect(app().locator(".cm-content")).toBeVisible();
      await app().locator(".cm-content").focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.insertText(
        "# Edited in the website demo\n\nA local change.",
      );
      const save = app()
        .getByRole("button", { name: "Save", exact: true })
        .first();
      await expect(save).toBeVisible();
      await expect(save).toBeEnabled();
      // WebKit on Windows can stop animation-frame stability sampling while
      // CodeMirror has focus in a nested frame. Still send a real pointer click.
      await save.click({ force: name === "webkit" });
      await expect
        .poll(async () =>
          page.frames()[1].evaluate(async () => {
            const r = await fetch(
              "/api/projects/project/file-tools?op=read&path=README.md",
            );
            return (await r.json()).text;
          }),
        )
        .toContain("Edited in the website demo");
      await english("editor");
      await page.screenshot({ path: resolve(out, `${name}-editor.png`) });
      await fresh();
      await click("Notes");
      await app()
        .getByRole("button", { name: /^Visual direction/ })
        .click();
      await english("note");
      await fresh();
      await click("Plans");
      await app()
        .getByRole("button", { name: /Launch Northstar/ })
        .click();
      await english("plan");
      await fresh();
      await click("Project Git");
      await app().getByRole("checkbox").first().check();
      await app()
        .getByRole("textbox", { name: "Commit message", exact: true })
        .fill("Demo commit");
      await click("Review commit");
      await click("Confirm commit");
      await page.waitForTimeout(200);
      await english("delivery");
      await fresh();
      await click("Open devices");
      await expect(app().locator(".xterm-screen")).toBeVisible();
      await english("devices");
      await page.screenshot({ path: resolve(out, `${name}-devices.png`) });
      await fresh();
      await click("Open Remote");
      await expect(app().locator(".remote-canvas canvas")).toBeVisible();
      await english("remote");
      await fresh();
      await click("Switch to GPT");
      await click("A story by the sea");
      await app()
        .getByRole("textbox", { name: "GPT message", exact: true })
        .fill("Continue the story.");
      await click("Send to GPT");
      await expect(
        app().getByText(/This is a scripted demo reply/),
      ).toBeVisible();
      await english("gpt");
      await fresh();
      await click("Images");
      await click("Open Tidal observatory.png");
      await expect(
        app().getByRole("button", { name: "Next image", exact: true }).last(),
      ).toBeEnabled();
      await app()
        .getByRole("button", { name: "Next image", exact: true })
        .last()
        .click();
      await english("image");
      await fresh();
      await click("Settings");
      await english("settings");
      await click("Help and shortcuts");
      await english("help");
      await app()
        .getByRole("searchbox", { name: "Search help", exact: true })
        .fill("files");
      await english("help search");
      for (const width of [393, 1194, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 393 ? 852 : 1000,
        });
        await fresh();
        for (const finish of [
          "CRT · burgundy",
          "2000 · light",
          "2000 · blue",
          "2000 · red",
          "Organizer · light",
          "Organizer · dark",
        ]) {
          await click("About this demo and feature guide");
          await click(finish);
          const [expectedTheme, expectedVariant, expectedColor] = {
            "CRT · burgundy": ["crt-green", "green", "red"],
            "2000 · light": ["hitech-2000s", "light", "silver"],
            "2000 · blue": ["hitech-2000s", "light", "blue"],
            "2000 · red": ["hitech-2000s", "light", "red"],
            "Organizer · light": ["organizer", "light", "green"],
            "Organizer · dark": ["organizer", "dark", "green"],
          }[finish];
          await expect(app().locator("html")).toHaveAttribute(
            "data-theme",
            expectedTheme,
          );
          await expect(app().locator("html")).toHaveAttribute(
            "data-theme-variant",
            expectedVariant,
          );
          await expect(app().locator("html")).toHaveAttribute(
            "data-case-color",
            expectedColor,
          );
          // Let the nested WebKit compositor paint the new casing before capture.
          await app()
            .locator("html")
            .evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
          const dimensions = await app()
            .locator("body")
            .evaluate((e) => ({ scroll: e.scrollWidth, width: innerWidth }));
          assert.ok(
            dimensions.scroll <= dimensions.width + 1,
            `${name}/${width}/${finish} overflow`,
          );
          await english(finish);
          await page.screenshot({
            path: resolve(
              out,
              `${name}-${width}-${finish.replace(/[^a-z0-9]/gi, "-")}.png`,
            ),
          });
        }
      }
      assert.deepEqual(errors, [], `${name} JavaScript errors`);
      assert.deepEqual(external, [], `${name} external traffic`);
      const persistent = await page
        .frames()[1]
        .evaluate(async () => ({ databases: await indexedDB.databases() }));
      assert.deepEqual(
        persistent.databases,
        [],
        `${name} no installed-app IndexedDB`,
      );
      findings.push({
        engine: name,
        passed: true,
        finishes: 6,
        widths: [393, 1194, 1440],
        externalRequests: external.length,
      });
      console.log(name, "passed");
    } catch (error) {
      if (page) {
        await page
          .screenshot({
            path: resolve(out, `${name}-failure.png`),
            timeout: 10000,
          })
          .catch(() => {});
        await writeFile(
          resolve(out, `${name}-failure.txt`),
          await page
            .frameLocator("iframe")
            .locator("body")
            .innerText({ timeout: 5000 })
            .catch(() => "Page unresponsive"),
        );
      }
      throw error;
    } finally {
      await browser.close();
    }
  }
  assert.ok(
    !requests.some((p) => p.startsWith("/api/")),
    "no API calls reach the website server",
  );
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify({ findings, assetRequests: requests.length }, null, 2),
  );
} finally {
  await new Promise((r) => server.close(r));
}
