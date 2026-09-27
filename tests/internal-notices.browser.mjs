import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { ProjectPlans } from "../apps/hub/dist/project-plans.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const engine = process.env.BROWSER ?? "chromium",
  origin = "http://127.0.0.1:18947";
const f = await handoffFixture(origin),
  browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  serviceWorkers: "block",
});
const identity = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
f.store.setPreferences({
  projectId: "project",
  threadId: f.thread.id,
  theme: "crt-green",
  view: "chat",
});
new ProjectPlans(f.sessions).save("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
  scope: { client: "codex", projectId: "project", name: "Project" },
  revision: 0,
  title: "Большой завершённый план совместного проекта",
  description: "",
  status: "done",
  sections: [],
  links: [],
});
await mkdir(".local/qa-internal-notices", { recursive: true });
try {
  await f.app.listen({ host: "127.0.0.1", port: 18947 });
  const [name, value] = f.headers.cookie.split("=");
  await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
  await context.addInitScript(
    (id) => sessionStorage.setItem("codex-workspace-identity", id),
    identity,
  );
  const page = await context.newPage(),
    errors = [];
  let githubReads = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/activity")) githubReads++;
  });
  await page.route("**/api/auth/session", async (route) => {
    const r = await route.fetch();
    await route.fulfill({
      json: {
        ...(await r.json()),
        team: true,
        originalOwner: true,
        user: { id: identity, name: "Owner", login: "owner" },
      },
    });
  });
  await page.route("**/api/team/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/team/spaces"
          ? { spaces: [], invitations: [] }
          : path === "/api/team/brainstorm"
            ? { rooms: [] }
            : { items: [] },
    });
  });
  await page.goto(origin);
  const composer = page.locator(".composer textarea");
  await expect(composer).toBeVisible();
  await composer.fill("Сохранённый черновик");
  const open = async () => {
    await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
    await page.getByRole("button", { name: /^Уведомления/ }).click();
  };
  await open();
  const dialog = page.getByRole("dialog", { name: "Общее пространство" });
  await expect(
    dialog.getByText("Большой завершённый план совместного проекта", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("GitHub", { exact: true })).toHaveCount(0);
  for (const theme of ["organizer", "crt-green", "hitech-2000s", "classic-dark"]) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const [label, width, height] of [
      ["phone", 390, 844],
      ["keyboard", 390, 400],
      ["tablet", 1024, 768],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(dialog.getByRole("button", { name: "Закрыть пространство" })).toBeVisible();
      assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 2));
      await page.screenshot({ path: `.local/qa-internal-notices/${engine}-${theme}-${label}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole("button", { name: "Открыть план", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Название плана" })).toHaveValue(
    "Большой завершённый план совместного проекта",
  );
  await page.getByRole("button", { name: "Закрыть рабочий раздел", exact: true }).click();
  await expect(composer).toHaveValue("Сохранённый черновик");
  assert.equal(githubReads, 0);
  assert.deepEqual(errors, []);
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
  console.log(
    engine +
      ": internal inbox opens exact completed plan, preserves local work, no GitHub requests, 12 themed layouts passed",
  );
} finally {
  await browser.close();
  await f.close();
}
