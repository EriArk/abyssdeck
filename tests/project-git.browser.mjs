import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { deliveryFixture } from "./delivery-fixture.mjs";

const out = "polish/03-projects/git-workspace";
await mkdir(out, { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18979",
    f = await deliveryFixture(origin, {
      configure(config) {
        config.projects[0].name = "Project — длинное название рабочей копии для проверки заголовка";
      },
    });
  await f.release();
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
  });
  const browser = await type.launch();
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1000 },
    serviceWorkers: "block",
  });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin }]);
  const page = await context.newPage(),
    errors = [],
    diffReads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const snap = async (name, description) => {
    if (engine !== "webkit") return;
    await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
    await writeFile(
      `${out}/${name}.md`,
      `# ${description}\n\nProduction UI on a deterministic local fixture, WebKit. No real repository writes.\n`,
    );
  };
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18979 });
    await page.route("**/api/projects/project/git", (r) =>
      r.fulfill({
        json: {
          ...f.state(),
          changes: f.state().paths,
          commits: [
            {
              id: "abc1234",
              subject: "Preserve the working draft",
              author: "Author",
              date: "2026-10-03T10:00:00Z",
            },
          ],
        },
      }),
    );
    await page.route("**/api/projects/project/git/repository", (r) =>
      r.fulfill({
        json: {
          repository: true,
          name: "Project",
          readme: {
            path: "README.md",
            text: "# Project\nA repository for the Git interface check.",
            truncated: false,
          },
          branches: [
            { name: "feature/mobile", current: true, upstream: "origin/feature/mobile" },
            { name: "main", current: false, upstream: "origin/main" },
          ],
          tags: [{ name: "v1.0", date: "2026-10-03", subject: "First release" }],
        },
      }),
    );
    await page.route("**/api/projects/project/git/releases", (r) =>
      r.fulfill({ json: { state: "ok", checkedAt: Date.now(), items: [] } }),
    );
    await page.route("**/api/projects/project/git/diff?**", (r) => {
      const u = new URL(r.request().url());
      diffReads.push(u.searchParams.get("staged"));
      return r.fulfill({
        json: {
          path: u.searchParams.get("path"),
          staged: u.searchParams.get("staged") === "1",
          truncated: false,
          text: "diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1,3 +1,3 @@\n export function render() {\n-  return oldLayout;\n+  return attachedPanels;\n }\n@@ -10 +10 @@\n--- old heading\n+++ new heading\n",
        },
      });
    });
    await page.route("**/api/projects/project/files?**", (r) =>
      r.fulfill({
        json: {
          path: "",
          entries: [
            { name: "app.ts", path: "app.ts", kind: "file", size: 100, modifiedAt: Date.now() },
          ],
          nextOffset: null,
          truncated: false,
        },
      }),
    );
    await page.route("**/api/projects/project/files/content?**", (r) =>
      r.fulfill({ body: "export const attachedPanels = true;", contentType: "text/plain" }),
    );
    await page.goto(origin);
    const chat = page.getByRole("textbox", { name: "Сообщение Codex", exact: true });
    await chat.fill("Parent chat draft");
    await chat.blur();
    await page.getByRole("button", { name: "Git проекта", exact: true }).click();
    const git = page.getByRole("dialog", { name: "Git проекта", exact: true });
    await expect(git.locator(".git-diff")).toContainText("attachedPanels");
    await expect(git.locator(".git-diff-cell.removed").last()).toContainText("-- old heading");
    await git.getByRole("button", { name: "Индекс", exact: true }).click();
    await expect.poll(() => diffReads.at(-1)).toBe("1");
    await git.getByRole("button", { name: "Рабочая копия", exact: true }).click();
    await git.getByRole("checkbox", { name: "Включить app.ts в коммит" }).check();
    const message = git.getByRole("textbox", { name: "Описание коммита" });
    await message.fill("Keep the same file workspace");
    await message.blur();
    const divider = git.getByRole("separator", { name: "Ширина списка Git" });
    const width = (await git.locator(".git-side").boundingBox()).width;
    await divider.focus();
    await divider.press("ArrowRight");
    await expect
      .poll(async () => (await git.locator(".git-side").boundingBox()).width)
      .toBeGreaterThan(width);
    await git.getByRole("button", { name: "Открыть в Файлах", exact: true }).click();
    const files = page.getByRole("dialog", { name: "Файлы проекта", exact: true });
    await expect(files).toHaveAttribute("data-window-source", "project");
    await expect(files.locator(".file-browser")).toBeVisible();
    await expect(files.getByRole("button", { name: /^app.ts/ })).toBeVisible();
    await files.getByRole("button", { name: "Закрыть файлы", exact: true }).click();
    await expect(message).toHaveValue("Keep the same file workspace");
    await git.getByRole("button", { name: "Свернуть окно", exact: true }).click();
    await expect(git).toBeHidden();
    await page.getByRole("button", { name: /Восстановить: Git/ }).click();
    await expect(message).toHaveValue("Keep the same file workspace");
    for (const theme of ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await snap(`tablet-${theme}`, `Git — ${theme}, tablet`);
      assert.ok(await git.evaluate((el) => el.scrollWidth <= el.clientWidth + 2));
    }
    await git.getByRole("button", { name: "Разница рядом", exact: true }).click();
    await expect(git.locator(".git-diff")).toHaveAttribute("data-paired", "true");
    await snap("paired", "Side-by-side diff");
    for (const label of ["История", "Ветки", "Релизы"]) {
      await git.getByRole("button", { name: label, exact: true }).click();
      await expect(git.getByRole("button", { name: label, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    await expect(git).toContainText("Опубликованных релизов пока нет");
    await git.getByRole("button", { name: /^Изменения/ }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(git.locator(".git-detail")).toBeHidden();
    await snap("phone-list", "Git — phone file selection and commit draft");
    await git.getByRole("button", { name: /app.ts/ }).click();
    await expect(git.locator(".git-detail")).toBeVisible();
    await snap("phone-diff", "Git — phone diff, return to list");
    await git.getByRole("button", { name: "К списку Git" }).click();
    await expect(message).toHaveValue("Keep the same file workspace");
    // A lost preparation acknowledgement must be read by its exact identity, never recreated.
    await page.setViewportSize({ width: 1366, height: 430 });
    await expect(message).toBeVisible();
    await git
      .getByRole("button", { name: "Проверить коммит", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      git.getByRole("button", { name: "Проверить коммит", exact: true }),
    ).toBeInViewport();
    await snap("keyboard-height", "Git — reduced tablet height while entering a commit");
    await page.setViewportSize({ width: 390, height: 844 });
    let lost = false;
    await page.route("**/api/projects/project/delivery/*", async (r) => {
      if (r.request().method() === "PUT" && !lost) {
        lost = true;
        await r.fetch();
        await r.abort("failed");
      } else await r.continue();
    });
    await git.getByRole("button", { name: "Проверить коммит", exact: true }).click();
    const delivery = page.getByRole("dialog", { name: "Доставка проекта", exact: true });
    await expect(delivery.getByRole("button", { name: "Проверить подготовку" })).toBeVisible();
    assert.equal(f.deliveryCalls.filter((c) => c.request.op === "apply").length, 0);
    await delivery.getByRole("button", { name: "Закрыть доставку" }).click();
    await git.getByRole("button", { name: "Проверить коммит", exact: true }).click();
    await delivery.getByRole("button", { name: "Проверить подготовку" }).click();
    await expect(delivery.getByRole("button", { name: "Подтвердить коммит" })).toBeVisible();
    assert.equal(f.deliveryCalls.filter((c) => c.request.op === "prepare").length, 1);
    const receipt = [...f.receipts.values()][0];
    assert.deepEqual(receipt.input.paths, ["app.ts"]);
    assert.equal(receipt.input.message, "Keep the same file workspace");
    assert.ok((await delivery.boundingBox()).height < 650, "review is a compact confirmation");
    await snap("commit-review", "Exact commit review before execution");
    await delivery.getByRole("button", { name: "Подтвердить коммит" }).click();
    await expect(delivery.locator(".delivery-operation")).toHaveAttribute(
      "data-state",
      "completed",
      { timeout: 15000 },
    );
    await delivery.getByRole("button", { name: "Закрыть доставку" }).click();
    await expect(message).toHaveValue("");
    await expect(git.getByRole("checkbox", { name: "Включить app.ts в коммит" })).toHaveCount(0);
    assert.equal(f.deliveryCalls.filter((c) => c.request.op === "apply").length, 1);
    await message.fill("New draft after completed commit");
    await page.evaluate(
      (operation) =>
        window.dispatchEvent(
          new CustomEvent("project-delivery-completed", {
            detail: { projectId: "project", operation },
          }),
        ),
      { ...receipt, state: "completed", updatedAt: 1 },
    );
    await expect(message).toHaveValue("New draft after completed commit");
    await git.getByRole("button", { name: "Отправить коммиты" }).click();
    await expect(delivery.getByRole("button", { name: "Подтвердить push" })).toBeVisible();
    assert.equal([...f.receipts.values()].at(-1).input.kind, "push");
    assert.equal(f.deliveryCalls.filter((c) => c.request.op === "apply").length, 1);
    await delivery.getByRole("button", { name: "Закрыть доставку" }).click();
    await git.getByRole("button", { name: "Закрыть Git" }).click();
    await expect(chat).toHaveValue("Parent chat draft");
    assert.deepEqual(errors, []);
    console.log(
      `${engine}: Git selection, diff, shared Files, dock, themes, phone, exact receipt recovery and separate push passed`,
    );
  } finally {
    await context.close();
    await browser.close();
    await f.app.close();
  }
}
