import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { zip } from "./package-fixtures.mjs";

const { unzipSync } = createRequire(new URL("../apps/web/package.json", import.meta.url))("fflate");

import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";
import react from "../apps/web/node_modules/@vitejs/plugin-react/dist/index.js";
import { build } from "../apps/web/node_modules/vite/dist/node/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const dir = await mkdtemp(join(tmpdir(), "archive-selection-"));
await mkdir(".local/qa-archive-selection", { recursive: true });
const originals = {
  "alpha/first.txt": "confirmed exact",
  "alpha/one.txt": "one exact\r\n",
  "alpha/two.txt": "two new\n",
  "beta/nested/three.txt": "third 🙂",
  "../escape.txt": "blocked",
};
const archive = zip(originals);
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
      rolldownOptions: { input: resolve("apps/web/tests/fixtures/file-popup.html") },
    },
  });
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (process.env.BROWSER && process.env.BROWSER !== engine) continue;
    const origin = "http://127.0.0.1:18902",
      f = await handoffFixture(origin, dir),
      browser = await type.launch();
    try {
      await f.app.listen({ host: "127.0.0.1", port: 18902 });
      const root = await mkdtemp(join(tmpdir(), "archive-extract-"));
      f.sessions.config.machines[0].type = "local-linux";
      f.sessions.config.projects[0].workingDirectory = root;
      await mkdir(join(root, "alpha"));
      await writeFile(join(root, "alpha/two.txt"), "old retained");
      const thread = f.store.createThread("project", randomUUID(), "Documents"),
        files = {};
      for (const [name, bytes] of [["archive.zip", archive]]) {
        const a = await f.sessions.attachments.put(thread.id, name, bytes);
        files[name] = "/api/attachments/" + a.id;
      }
      const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        serviceWorkers: "block",
      });
      const [name, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin }]);
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const open = async (name) => {
        await page.goto(
          origin +
            "/tests/fixtures/file-popup.html?" +
            new URLSearchParams({ file: files[name], name }),
        );
        await page.getByRole("button", { name: "Открыть файл", exact: true }).click();
      };
      const button = (name) => page.getByRole("button", { name, exact: true });
      const download = async () => {
        const next = page.waitForEvent("download");
        await page.getByRole("link", { name: "Скачать копию", exact: true }).click();
        return readFile(await (await next).path());
      };
      const screenshots = async (kind) => {
        for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
          await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
          for (const width of [1024, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 650 : 768 });
            const dialog = page.locator(".file-viewer-dialog");
            await expect
              .poll(() => dialog.evaluate((el) => el.getBoundingClientRect().right))
              .toBeLessThanOrEqual(width + 1);
            await expect(button("Закрыть просмотр")).toBeVisible();
            await page.screenshot({
              path: `.local/qa-archive-selection/${engine}-${kind}-${theme}-${width}.png`,
            });
          }
        }
        await page.setViewportSize({ width: 1024, height: 768 });
      };
      const begins = [],
        mkdirIds = [];
      let lost = false,
        lostComplete = false;
      const oneIds = [],
        completes = [];
      await context.route("**/api/projects/project/file-tools", async (route) => {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          if (body.op === "mkdir" && body.path === "beta") {
            mkdirIds.push(body.id);
            if (!lost) {
              lost = true;
              const response = await route.fetch();
              assert.equal(response.status(), 200);
              return route.abort("failed");
            }
          }
        }
        return route.continue();
      });
      await context.route("**/api/projects/project/file-uploads/*", (route) => {
        if (route.request().method() === "POST" && !route.request().url().endsWith("/complete")) {
          const body = route.request().postDataJSON();
          begins.push(body);
          if (body.name === "one.txt") oneIds.push(route.request().url().split("/").at(-1));
        }
        return route.continue();
      });
      await context.route("**/api/projects/project/file-uploads/*/complete", async (route) => {
        const id = route.request().url().split("/").at(-2);
        if (oneIds.includes(id)) {
          completes.push(id);
          if (!lostComplete) {
            lostComplete = true;
            const response = await route.fetch();
            assert.equal(response.status(), 200);
            return route.abort("failed");
          }
        }
        return route.continue();
      });
      await open("archive.zip");
      await expect(page.locator(".archive-list")).toContainText("alpha");
      await button("Выбрать файлы архива").click();
      await page.getByLabel("Выбрать alpha/", { exact: true }).check();
      await page.getByLabel("Поиск в архиве").fill("three");
      await button("Выбрать все найденные файлы").click();
      await expect(page.locator(".archive-selection-tools")).toContainText("Выбрано: 4");
      await page.getByLabel("Поиск в архиве").fill("");
      await expect(page.getByLabel("Выбрать ../escape.txt", { exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "alpha Папка", exact: true }).click();
      await expect(page.getByLabel("Выбрать alpha/one.txt", { exact: true })).toBeChecked();
      await button("На уровень выше").click();
      await screenshots("selection");
      await button("Извлечь выбранные файлы").click();
      const save = page.locator(".file-copy-save[open]");
      await expect(save).toContainText("Выбрано файлов: 4");
      const extracted = unzipSync(await download());
      assert.deepEqual(
        Object.keys(extracted).sort(),
        Object.keys(originals)
          .filter((n) => !n.startsWith(".."))
          .sort(),
      );
      for (const [path, bytes] of Object.entries(extracted))
        assert.equal(Buffer.from(bytes).toString("utf8"), originals[path]);
      await button("Закрыть сохранение копии").click();
      await expect(page.locator(".archive-selection-tools")).toContainText("Выбрано: 4");
      await button("Извлечь выбранные файлы").click();
      await save.getByLabel("Проект для копии").selectOption("project");
      await save.getByRole("button", { name: "Сохранить в проект", exact: true }).click();
      const upload = page.locator(".project-file-upload[open]");
      await upload.getByRole("button", { name: "Загрузить", exact: true }).click();
      await expect(upload).toContainText("Файл с таким именем уже существует.");
      await expect(
        upload.getByRole("button", { name: "Продолжить / проверить", exact: true }).last(),
      ).toBeEnabled();
      assert.equal(await readFile(join(root, "alpha/one.txt"), "utf8"), originals["alpha/one.txt"]);
      assert.equal(await readFile(join(root, "alpha/two.txt"), "utf8"), "old retained");
      await page.screenshot({ path: `.local/qa-archive-selection/${engine}-recovery.png` });
      await button("Закрыть загрузку").click();
      await button("Извлечь выбранные файлы").click();
      await save.getByLabel("Проект для копии").selectOption("project");
      await save.getByRole("button", { name: "Сохранить в проект", exact: true }).click();
      await upload.getByRole("button", { name: "Загрузить", exact: true }).click();
      await expect(
        upload.getByRole("button", { name: "Заменить старый", exact: true }),
      ).toBeEnabled();
      await upload.getByRole("button", { name: "Заменить старый", exact: true }).click();
      await upload.getByRole("button", { name: "Загрузить", exact: true }).click();
      await expect(save).toHaveCount(0);
      for (const path of Object.keys(originals).filter((n) => !n.startsWith("..")))
        assert.equal(await readFile(join(root, path), "utf8"), originals[path]);
      assert.equal(
        begins.filter((b) => b.name === "first.txt").length,
        1,
        "completed file was sent again",
      );
      assert.equal(oneIds.length, 2);
      assert.equal(new Set(oneIds).size, 1, "uncertain upload got a new identity");
      assert.equal(completes.length, 1, "completed write was repeated");
      assert.equal(mkdirIds.length, 2);
      assert.equal(new Set(mkdirIds).size, 1, "uncertain mkdir got a new identity");
      assert.deepEqual(
        await (await context.request.get(origin + files["archive.zip"])).body(),
        archive,
      );
      assert.deepEqual(errors, []);
      console.log(
        engine +
          ": ZIP multiselect/search/folders, exact batch ZIP, nested project extraction, collisions, partial reopen and lost mkdir/upload acknowledgements passed",
      );
      await rm(root, { recursive: true, force: true });
      await context.close();
    } finally {
      await browser.close();
      await f.close();
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
