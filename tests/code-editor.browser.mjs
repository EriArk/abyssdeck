import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const dir = await mkdtemp(join(tmpdir(), "code-editor-"));
await mkdir(".local/qa-code-editor", { recursive: true });
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
      rolldownOptions: { input: resolve("apps/web/tests/fixtures/code-editor.html") },
    },
  });
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (process.env.BROWSER && process.env.BROWSER !== engine) continue;
    const origin = "http://127.0.0.1:18979",
      f = await handoffFixture(origin, dir),
      browser = await type.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    const errors = [],
      requests = [],
      saves = [];
    const original =
      'export const greeting: string = "Hello";\r\nfunction say() {\r\n  return greeting.toUpperCase();\r\n}\r\n';
    let diskText = original,
      fingerprint = "a".repeat(64),
      reject = false,
      loseAck = false,
      receipt = null;
    try {
      await f.app.listen({ host: "127.0.0.1", port: 18979 });
      const [name, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin }]);
      const snapshot = (path, text) => ({
        path,
        kind: "file",
        size: text.length,
        fingerprint,
        checkout: "exact-checkout",
        text,
        bom: path === "sample.ts",
      });
      await context.route("**/api/projects/project/file-tools**", async (route) => {
        const request = route.request();
        if (request.method() === "GET") {
          const path = new URL(request.url()).searchParams.get("path");
          const text =
            path === "sample.ts"
              ? diskText
              : path === "notes.md"
                ? "# Notes"
                : path === "data.csv"
                  ? "name,value\r\nA,1"
                  : path === "data.json"
                    ? '{"id":900719925474099312345,"a":1}'
                    : path === "page.html"
                      ? "<main>Hello</main>"
                      : "plain text";
          return route.fulfill({ json: snapshot(path, text) });
        }
        const body = request.postDataJSON();
        saves.push(body);
        assert.equal(body.op, "save");
        assert.equal(body.capability, "fixture");
        if (reject) {
          reject = false;
          diskText = "// externally changed\r\n";
          fingerprint = "b".repeat(64);
          return route.fulfill({
            status: 409,
            json: { error: { code: "FILE_CHANGED", message: "File changed" } },
          });
        }
        if (receipt?.id === body.id) return route.fulfill({ json: receipt.result });
        assert.equal(body.fingerprint, fingerprint);
        diskText = body.text;
        fingerprint = "c".repeat(64);
        receipt = { id: body.id, result: snapshot(body.path, body.text) };
        if (loseAck) {
          loseAck = false;
          return route.abort("failed");
        }
        return route.fulfill({ json: receipt.result });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => {
        errors.push(error.message);
        console.error(engine, error.message);
      });
      page.setDefaultTimeout(12000);
      page.on("request", (request) => requests.push(request.url()));
      await page.goto(origin + "/tests/fixtures/code-editor.html");
      const editor = page.locator(".file-editor-embedded"),
        viewer = page.locator(".file-viewer-dialog[open]");
      const open = async (path, kind = "monaco") => {
        await page.getByRole("button", { name: path, exact: true }).click();
        await expect(editor).toHaveAttribute("data-editor-engine", kind);
      };
      const modelText = () =>
        page.evaluate(async () =>
          (await window.inspectMonaco()).editor.getEditors()[0].getModel().getValue(),
        );
      const replace = (text) =>
        page.evaluate(async (value) => {
          const m = await window.inspectMonaco(),
            view = m.editor.getEditors()[0],
            model = view.getModel();
          view.pushUndoStop();
          view.executeEdits("test-user-edit", [{ range: model.getFullModelRange(), text: value }]);
          view.pushUndoStop();
        }, text);
      const close = async () => {
        await editor.getByRole("button", { name: "Закрыть редактор", exact: true }).click();
      };
      assert.ok(
        !requests.some((url) => /monacoEngine|ts\.worker|editor\.worker/.test(url)),
        "no Monaco before edit",
      );
      await open("notes.md", "codemirror");
      await expect(editor.locator(".cm-content")).toHaveText("# Notes");
      await close();
      assert.ok(
        !requests.some((url) => /monacoEngine|ts\.worker|editor\.worker/.test(url)),
        "Markdown never loads Monaco",
      );
      await open("sample.ts");
      await expect.poll(modelText).toBe(original.replaceAll("\r\n", "\n"));
      await expect(editor.locator(".monaco-editor .view-line").first()).toContainText(
        "export const",
      );
      // Actual text entry and model Undo survive switching to the viewer and back.
      const input = editor.locator(".inputarea, .native-edit-context");
      await input.focus();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("// edited");
      await expect.poll(modelText).toContain("// edited");
      await editor.getByRole("button", { name: "Просмотр", exact: true }).click();
      await editor.getByRole("button", { name: "Правка", exact: true }).click();
      await expect.poll(modelText).toContain("// edited");
      await editor.getByRole("button", { name: "Отменить изменение", exact: true }).click();
      await expect.poll(modelText).not.toContain("// edited");
      await editor.getByRole("button", { name: "Повторить изменение", exact: true }).click();
      await expect.poll(modelText).toContain("// edited");
      await editor.getByRole("button", { name: "Найти в файле", exact: true }).click();
      await expect(editor.locator(".find-widget")).toBeVisible();
      await page.keyboard.press("Escape");
      await editor.getByRole("button", { name: "Перейти к строке", exact: true }).click();
      const lineInput = page.locator(".quick-input-widget input");
      await expect(lineInput).toBeVisible();
      await lineInput.fill(":2");
      await page.keyboard.press("Enter");
      await expect(editor.locator(".file-editor-position")).toContainText("2:");
      await replace("alpha\nbeta");
      await page.evaluate(async () => {
        const m = await window.inspectMonaco(),
          view = m.editor.getEditors()[0];
        view.setSelections([new m.Selection(1, 1, 1, 1), new m.Selection(2, 1, 2, 1)]);
        view.focus();
      });
      await page.keyboard.insertText("// ");
      await expect.poll(modelText).toBe("// alpha\n// beta");
      // TS service runs in the bundled worker and offers real String members.
      await replace('const word = "hello";\nword.');
      const completion = await page.evaluate(async () => {
        const m = await window.inspectMonaco(),
          model = m.editor.getEditors()[0].getModel();
        const getWorker = await m.typescript.getTypeScriptWorker(),
          worker = await getWorker(model.uri);
        return (
          await worker.getCompletionsAtPosition(model.uri.toString(), model.getValueLength(), {})
        )?.entries.map((e) => e.name);
      });
      assert.ok(completion.includes("toUpperCase"));
      assert.ok(
        requests.some((url) => /ts\.worker/.test(url)),
        "local TS worker requested",
      );
      await replace('export const value = "changed";\n');
      reject = true;
      await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect(editor.locator(".file-editor-conflict")).toBeVisible();
      assert.equal(await modelText(), 'export const value = "changed";\n');
      await editor.getByRole("button", { name: "Я сравнил", exact: false }).click();
      loseAck = true;
      await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect(editor.locator('[role="alert"]').first()).toBeVisible();
      const uncertainId = saves.at(-1).id;
      await close();
      await editor.getByRole("button", { name: "Закрыть с черновиком", exact: true }).click();
      await expect(viewer).toHaveCount(0);
      assert.equal(
        await page.evaluate(
          async () =>
            (await window.inspectMonaco()).editor
              .getModels()
              .filter((model) => model.uri.scheme === "inmemory").length,
        ),
        0,
      );
      await open("sample.ts");
      await expect.poll(modelText).toContain('"changed"');
      await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect(page.getByRole("status", { name: "Saved" })).toHaveText("1");
      assert.equal(saves.at(-1).id, uncertainId, "lost ACK reconciles exact receipt");
      assert.equal(saves.at(-1).text, 'export const value = "changed";\r\n');
      assert.equal(saves.at(-1).bom, true);
      await replace(original.replaceAll("\r\n", "\n"));
      for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
        }, theme);
        await expect(editor.locator(".monaco-editor").first()).toBeVisible();
        await page.screenshot({ path: `.local/qa-code-editor/${engine}-${theme}.png` });
      }
      await editor.getByRole("button", { name: "Отменить изменение", exact: true }).click();
      await page.setViewportSize({ width: 900, height: 600 });
      await expect(editor).toHaveAttribute("data-editor-engine", "monaco");
      await expect
        .poll(() =>
          editor
            .locator(".monaco-editor")
            .first()
            .evaluate((el) => el.getBoundingClientRect().right),
        )
        .toBeLessThanOrEqual(901);
      await close();
      await open("other.ts");
      await expect.poll(modelText).toBe("plain text");
      assert.equal(
        await page.evaluate(
          async () =>
            (await window.inspectMonaco()).editor
              .getModels()
              .filter((model) => model.uri.scheme === "inmemory").length,
        ),
        1,
      );
      await close();
      await open("data.csv", "codemirror");
      await close();
      await open("plain.txt", "codemirror");
      await close();
      await open("data.json");
      await editor.getByRole("button", { name: "Форматировать JSON", exact: true }).click();
      await expect.poll(modelText).toContain("900719925474099312345");
      await editor.getByRole("button", { name: "Отменить изменение", exact: true }).click();
      await expect.poll(modelText).toBe('{"id":900719925474099312345,"a":1}');
      await close();
      await expect(page.getByRole("textbox", { name: "Parent draft", exact: true })).toHaveValue(
        "Preserve parent",
      );
      assert.deepEqual(errors, []);
      console.log(
        engine,
        "desktop code, worker completion, Undo, conflict, receipt, disposal, formats and themes passed",
      );
      await context.close();

      // Fresh mobile contexts: desktop iPad UA and touch laptops keep the existing text engine.
      for (const mode of ["ipad", "phone", "load-failure"]) {
        const mobile = await browser.newContext({
          viewport: { width: mode === "phone" ? 390 : 1024, height: 768 },
          hasTouch: mode !== "load-failure",
          serviceWorkers: "block",
        });
        await mobile.addCookies([{ name, value, url: origin }]);
        if (mode === "ipad")
          await mobile.addInitScript(() => {
            Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
            Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
          });
        if (mode === "load-failure")
          await mobile.route("**/assets/monacoEngine-*.js", (route) => route.abort());
        await mobile.route("**/api/projects/project/file-tools**", (route) =>
          route.fulfill({ json: snapshot("sample.ts", original) }),
        );
        const page = await mobile.newPage(),
          loadedRequests = [];
        page.on("request", (r) => loadedRequests.push(r.url()));
        await page.goto(origin + "/tests/fixtures/code-editor.html");
        await page.getByRole("button", { name: "sample.ts", exact: true }).click();
        await expect(page.locator(".file-editor-embedded")).toHaveAttribute(
          "data-editor-engine",
          "codemirror",
        );
        await page.locator(".cm-content").focus();
        await page.keyboard.press(mode === "ipad" ? "Meta+A" : "Control+A");
        await page.keyboard.insertText("// mobile edited");
        await expect(page.locator(".cm-content")).toHaveText("// mobile edited");
        if (mode !== "load-failure")
          assert.ok(!loadedRequests.some((url) => /monacoEngine/.test(url)));
        await page.screenshot({ path: `.local/qa-code-editor/${engine}-${mode}.png` });
        await mobile.close();
      }
      console.log(engine, "mobile and failed-load fallback passed");
    } finally {
      await context.close().catch(() => {});
      await browser.close();
      await f.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
