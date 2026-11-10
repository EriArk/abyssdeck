import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

await mkdir(".local/qa-project-folders", { recursive: true });
for (const type of [chromium, webkit]) {
  const origin = "http://127.0.0.1:18943",
    root = "/run/media/eriark/Data/Projects";
  const f = await handoffFixture(origin, undefined, {
    projectSetupProbe: async (_m, r) =>
      r.op === "inspect"
        ? {
            exists: true,
            empty: false,
            git: false,
            branch: "",
            head: "",
            origin: "",
            dirty: false,
            steps: ["register-project"],
            fingerprint: "a".repeat(64),
          }
        : { id: r.id, state: "complete", phase: "register-project" },
    configure(c) {
      c.machines[0].type = "ssh-linux";
      c.projects[0].workingDirectory = root;
      c.projects[0].name = "AbyssDeck";
    },
  });
  f.sessions.catalog.refresh = async () => {};
  const machines = f.sessions.catalog.machines.bind(f.sessions.catalog);
  f.sessions.catalog.machines = () => machines().map((m) => ({ ...m, projectsDirectory: root }));
  const child = {
    id: "child",
    sourceId: "native-child",
    recoverySourceId: "old-child",
    machineId: "pc",
    name: "JavaGameEmu",
    workingDirectory: root + "/JavaGameEmu",
    enabled: true,
  };
  f.store.db
    .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
    .run(child.id, "pc", child.sourceId, JSON.stringify(child));
  const old = f.store.createThread(child.id, "old-native", "Old saved chat");
  f.store.db.prepare("UPDATE threads SET historyMode='saved' WHERE id=?").run(old.id);
  const request = f.rpc.request.bind(f.rpc);
  f.rpc.request = async (method, params) =>
    method === "project/update"
      ? {
          project: {
            id: child.sourceId,
            name: params.name,
            roots: [{ path: child.workingDirectory }],
          },
        }
      : request(method, params);
  f.store.setPreferences({ theme: "crt-green", machineClients: { pc: "web" } });
  const browser = await type.launch();
  try {
    await f.app.listen({ host: "127.0.0.1", port: 18943 });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      serviceWorkers: "block",
    });
    const [name, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
    const page = await context.newPage();
    await page.route("**/api/machines/pc/directories?**", (route) => {
      const path = new URL(route.request().url()).searchParams.get("path");
      return route.fulfill({
        json: {
          path,
          parent: root,
          entries:
            path === root
              ? Array.from({ length: 50 }, (_, n) => ({
                  name: n === 25 ? "JavaGameEmu" : "Folder " + String(n).padStart(2, "0"),
                  path:
                    root +
                    "/" +
                    (n === 25 ? "JavaGameEmu" : "Folder " + String(n).padStart(2, "0")),
                }))
              : [],
        },
      });
    });
    await page.goto(origin);
    await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Проекты и диалоги" })
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    const wizard = page.getByRole("dialog", { name: "Создание проекта" });
    await wizard.getByRole("button", { name: /Папка на компьютере Подключить/ }).click();
    await wizard.getByLabel("Название проекта", { exact: true }).fill("AbyssME");
    await wizard.getByRole("button", { name: "Далее", exact: true }).click();
    await wizard.getByRole("button", { name: "Выбрать папку проекта", exact: true }).click();
    await expect(wizard.getByRole("button", { name: "Проверить", exact: true })).toHaveCount(0);
    await expect(
      wizard.getByRole("button", { name: "Выбрать эту папку", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: ".local/qa-project-folders/" + type.name() + "-picker.png" });
    await wizard
      .getByRole("button", { name: "JavaGameEmu Папка", exact: true })
      .click({ timeout: 5000 });
    await wizard.getByRole("button", { name: "Выбрать эту папку", exact: true }).click();
    await expect(wizard.getByLabel("Папка проекта", { exact: true })).toHaveValue(
      root + "/JavaGameEmu",
    );
    await wizard.getByRole("button", { name: "Выбрать папку проекта", exact: true }).click();
    await expect(wizard.locator(".folder-picker-heading")).toContainText(root + "/JavaGameEmu");
    await wizard.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(wizard.getByLabel("Папка проекта", { exact: true })).toHaveValue(
      root + "/JavaGameEmu",
    );
    await wizard.getByRole("button", { name: "Проверить", exact: true }).click();
    await wizard.getByRole("button", { name: "Подключить проект", exact: true }).click();
    await wizard
      .getByRole("button", { name: "Открыть проект", exact: true })
      .click({ timeout: 15000 });
    await expect(wizard).not.toBeVisible();
    await page.getByRole("button", { name: "Открыть проекты", exact: true }).click();
    const nav = page.getByRole("dialog", { name: "Проекты и диалоги" });
    await expect(nav.locator('.nav-projects [data-project-id="child"]')).toBeVisible();
    await expect(nav.locator('.nav-projects [data-project-id="child"]')).toContainText("AbyssME");
    assert.equal(f.store.thread(old.id).historyMode, "saved");
    assert.equal(f.store.thread(old.id).projectId, child.id);
    assert.equal(f.sessions.project("project").workingDirectory, root);
    assert.equal(
      f.sessions.catalog.publicProjects().find((p) => p.id === child.id).serverArchived,
      false,
    );
    await page.screenshot({ path: ".local/qa-project-folders/" + type.name() + "-added.png" });
    console.log(type.name() + ": child folder selection and recovered project activation passed");
  } finally {
    await browser.close();
    await f.close();
  }
}
