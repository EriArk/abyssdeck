import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { usageFixture } from "./usage-resets-fixture.mjs";

// Current production React components; all account/service data is disposable.
const out = "polish/07-settings-devices/settings-implementation";
const port = Number(process.env.SETTINGS_PORT || 18944);
const origin = `http://127.0.0.1:${port}`;
const f = await usageFixture(origin);
const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Владелец",
  login: "owner-demo",
  role: "admin",
  state: "active",
};
const friend = {
  ...owner,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Участник",
  login: "member-demo",
  role: "member",
};
const preferences = {
  projectId: "project",
  threadId: f.thread.id,
  theme: "crt-green",
  machineClients: { pc: "web" },
};
f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
f.store.setPreferences(preferences);
const engine = process.env.SETTINGS_ENGINE || "chromium";
const continuityOnly = process.env.SETTINGS_CONTINUITY_ONLY === "1";
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 1024 },
  hasTouch: true,
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
const [name, value] = f.headers.cookie.split("=");
await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
await context.addInitScript(
  (id) => sessionStorage.setItem("codex-workspace-identity", id),
  owner.id,
);
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [],
  requests = [],
  inventory = [];
let replacingDocument = false;
page.on("pageerror", (e) => {
  // Windows WebKit reports the old document's aborted presence fetch as a CORS
  // page error during this deliberate owner-to-member reload (same-origin fixture).
  if (
    engine === "webkit" &&
    replacingDocument &&
    e.message === `/127.0.0.1:${port}/api/team/communication/presence due to access control checks.`
  )
    return;
  errors.push(e.message);
});
await page.route("**/api/**", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname;
  requests.push({ method: req.method(), path });
  const team = {
    "/api/team/spaces": { spaces: [], invitations: [] },
    "/api/team/brainstorm": { rooms: [], invitations: [] },
    "/api/team/me": { user: owner, originalOwner: true },
    "/api/team/users": { items: [owner, friend], ownerId: owner.id, registrationEnabled: false },
    "/api/team/invitations": { items: [] },
    "/api/team/machine-reviews": { items: [] },
    "/api/team/machines": {
      enabled: true,
      items: [],
      activeMachineIds: ["pc", "server-workspace"],
    },
    "/api/team/server-workspace": { available: true, state: "ready" },
    "/api/team/gpt": {
      enabled: true,
      native: true,
      legacy: false,
      activated: true,
      state: "ready",
    },
  };
  if (team[path]) return route.fulfill({ json: team[path] });
  if (path.startsWith("/api/team/")) return route.fulfill({ json: { items: [] } });
  if (path === "/api/gpt/doctor")
    return route.fulfill({
      json: {
        association: {
          enabled: true,
          projectId: "project",
          threadId: f.thread.id,
          state: "ready",
          mode: "repair",
          revision: 1,
        },
        projects: [{ id: "project", name: "Project" }],
        threads: [],
        incidents: [],
      },
    });
  if (path.startsWith("/api/gpt/"))
    return route.fulfill({
      json: path.endsWith("/status")
        ? {
            configured: true,
            canSend: true,
            state: "healthy",
            message: "ChatGPT подключён",
            connectUrl: "/gpt-connect?runtime=native",
          }
        : path.endsWith("/models")
          ? {
              models: [{ id: "Latest", label: "Latest" }],
              efforts: [{ id: "high", label: "High" }],
              currentModel: "Latest",
              currentEffort: "high",
            }
          : { items: [], conversations: [], nextOffset: null, blocked: false },
    });
  if (path === "/api/deployment")
    return route.fulfill({
      json: {
        separated: true,
        engineRevision: "f32b7f3",
        schema: 1,
        web: { kind: "web", revision: "43ccf6b", state: "installed" },
        maintenance: null,
        blockers: [],
      },
    });
  if (path === "/api/storage")
    return route.fulfill({
      json: {
        buckets: [
          { id: "database", bytes: 1024 * 1024 * 18 },
          { id: "artifacts", bytes: 1024 * 1024 * 350 },
        ],
      },
    });
  const headers = { ...req.headers() };
  delete headers["x-workspace-id"];
  if (path === "/api/auth/status" || path === "/api/auth/session") {
    const response = await route.fetch({ headers });
    return route.fulfill({
      response,
      json: { ...(await response.json()), team: true, user: owner, originalOwner: true },
    });
  }
  return route.continue({ headers });
});
const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
const button = (name) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
const current = () => settings.locator(".settings-section[data-page]:visible");
const count = (suffix) => requests.filter((r) => r.path.endsWith(suffix)).length;
async function visit(title) {
  await settings.getByRole("button", { name: "Найти настройку", exact: true }).click();
  await settings.getByRole("searchbox", { name: "Поиск по настройкам" }).fill(title);
  await settings
    .locator(".settings-search-results .settings-link")
    .filter({ has: page.locator("strong", { hasText: new RegExp("^" + title + "$") }) })
    .click();
  await expect(current().locator("h3.settings-section-title")).toHaveText(title);
}
async function shot(id, description) {
  if (engine !== "chromium" || continuityOnly) return;
  await settings.screenshot({ path: `${out}/${id}.png`, animations: "disabled" });
  await writeFile(
    `${out}/${id}.md`,
    `# ${description}\n\n![${description}](${id}.png)\n\nРабочие React-компоненты на демонстрационных данных; ${page.viewportSize().width} × ${page.viewportSize().height}, Chromium. Автоматизированная проверка, не физическое устройство.\n\n[Описание](README.md).\n`,
  );
  inventory.push({ id, viewport: page.viewportSize(), text: await settings.innerText() });
}
try {
  await mkdir(out, { recursive: true });
  await f.app.listen({ host: "127.0.0.1", port });
  await page.goto(origin);
  const draft = page.getByRole("textbox", { name: "Сообщение Codex" });
  await draft.fill("Сохранить черновик при работе с настройками");
  await draft.blur();
  await button("Настройки").click();
  await expect(settings).toBeVisible();
  await expect(settings.locator('[data-category="people"]')).toHaveCount(1);
  assert.equal(count("/limits"), 0);
  assert.equal(count("/team/users"), 0);
  assert.equal(count("/team/gpt"), 0);
  const divider = settings.getByRole("separator", { name: "Ширина категорий настроек" });
  await expect(divider).toBeVisible();
  const widthBefore = Number(await divider.getAttribute("aria-valuenow"));
  await divider.focus();
  await divider.press("ArrowRight");
  await expect
    .poll(async () => Number(await divider.getAttribute("aria-valuenow")))
    .toBeGreaterThan(widthBefore);
  await visit("Сочетания клавиш");
  const scrollBefore = await current().evaluate((el) => {
    el.scrollTop = 300;
    return el.scrollTop;
  });
  assert(scrollBefore > 0);
  await visit("Интерфейс");
  await visit("Сочетания клавиш");
  assert.equal(await current().evaluate((el) => el.scrollTop), scrollBefore);
  await visit("Добавить компьютер");
  await settings.getByLabel("Название компьютера").fill("Черновик компьютера");
  await visit("Озвучивание и уведомления");
  await visit("Добавить компьютер");
  await expect(settings.getByLabel("Название компьютера")).toHaveValue("Черновик компьютера");
  await visit("Пароль и вход");
  await button("Сменить пароль").click();
  await settings.getByLabel("Текущий пароль", { exact: true }).fill("Example only");
  await visit("Подключения");
  await visit("Пароль и вход");
  await button("Сменить пароль").click();
  await expect(settings.getByLabel("Текущий пароль", { exact: true })).toHaveValue("");
  await visit("Лимиты и кредиты");
  await expect(current().locator(".usage-limits")).toBeVisible();
  await expect.poll(() => count("/limits")).toBeGreaterThan(0);
  const before = count("/limits");
  await visit("Интерфейс");
  await page.evaluate(() => window.dispatchEvent(new Event("codex-usage-changed")));
  await page.waitForTimeout(150);
  assert.equal(count("/limits"), before);
  await visit("ChatGPT");
  await expect(current().locator('a[href*="gpt-connect"]')).toHaveCount(1);
  await expect(current().getByRole("link", { name: "Открыть ChatGPT", exact: true })).toBeVisible();
  const gptReads = count("/team/gpt");
  await visit("Интерфейс");
  await page.waitForTimeout(5200);
  assert.equal(count("/team/gpt"), gptReads);
  await visit("Пользователи и доступ");
  assert.equal(count("/team/users"), 0);
  await visit("Участники");
  await expect.poll(() => count("/team/users")).toBeGreaterThan(0);
  await visit("PC");
  await expect(current().locator(".machine-health-card")).toHaveCount(1);
  await expect(current().locator(".machine-health-card h2")).toContainText("PC");
  assert.equal(await page.locator("dialog[open]").count(), 1, "machine details stay in Settings");
  assert(!requests.some((r) => r.method === "POST" && r.path.endsWith("/diagnostics")));
  await shot("machine-details", "Готовность выбранного компьютера");
  await current()
    .getByRole("button", { name: /Codex на этом компьютере/ })
    .click();
  await expect(current().getByRole("combobox")).toHaveValue("pc");
  await visit("Обновления и диагностика");
  await current()
    .getByRole("button", { name: /Bridge Doctor/ })
    .click();
  await button("Назад в настройках").click();
  await expect(current().locator("h3.settings-section-title")).toHaveText(
    "Обновления и диагностика",
  );
  for (const theme of continuityOnly
    ? []
    : ["crt-green", "hitech-2000s", "organizer", "classic-dark"]) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const width of [1366, 820, 640, 390, 320]) {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 1024 });
      for (const title of [
        "Интерфейс",
        "Подключения",
        "Оформление",
        "Текст и масштаб",
        "Озвучивание и уведомления",
        "История и данные",
        "Обновления и диагностика",
        "Мой аккаунт",
        "ChatGPT",
        "Добавить компьютер",
        "Участники",
      ]) {
        await visit(title);
        const bounds = await current().evaluate((el) => ({ w: el.clientWidth, s: el.scrollWidth }));
        assert(
          bounds.s <= bounds.w + 1,
          `${engine} ${theme} ${width} ${title} ${JSON.stringify(bounds)}`,
        );
        const r = await settings.boundingBox(),
          close = await button("Закрыть настройки").boundingBox();
        assert(r.x >= 0 && r.x + r.width <= width + 1);
        assert(close.width >= 44 && close.height >= 44 && close.x + close.width <= r.x + r.width);
      }
      await visit("Подключения");
      if (width === 1366 || width === 390)
        await shot(`${theme}-${width}`, `Подключения · ${theme}`);
    }
    console.log("Layout passed", engine, theme);
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "crt-green"));
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("Оформление");
  await shot("appearance-phone", "Оформление на телефоне");
  await visit("ChatGPT");
  await shot("gpt-phone", "Один вход в GPT");
  await visit("Пароль и вход");
  await button("Сменить пароль").click();
  for (const offset of [0, 180]) {
    await page.evaluate((offset) => {
      document.documentElement.style.setProperty("--safe-top", "59px");
      Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 340 });
      Object.defineProperty(visualViewport, "offsetTop", { configurable: true, get: () => offset });
      visualViewport.dispatchEvent(new Event("resize"));
    }, offset);
    await expect
      .poll(async () => {
        const r = await settings.boundingBox(),
          c = await button("Закрыть настройки").boundingBox();
        return (
          r.y >= Math.max(59, offset) &&
          r.y + r.height <= offset + 341 &&
          c.y + c.height <= offset + 340
        );
      })
      .toBe(true);
  }
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("--safe-top");
    delete visualViewport.height;
    delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await button("Закрыть настройки").click();
  await expect(draft).toHaveValue("Сохранить черновик при работе с настройками");
  owner.role = "member";
  replacingDocument = true;
  await page.reload();
  await button("Открыть проекты").click();
  await button("Настройки").click();
  await expect(settings.locator('[data-category="people"]')).toHaveCount(0);
  replacingDocument = false;
  await button("Найти настройку").click();
  await settings.getByRole("searchbox").fill("Участники");
  await expect(settings.locator(".settings-search-results")).toContainText("Найдено: 0");
  assert.deepEqual(errors, []);
  assert(f.desktopCalls.every((a) => a === "Status"));
  assert(!f.calls.some((c) => c.method === "turn/start"));
  await writeFile(
    `${out}/${engine}-${continuityOnly ? "continuity" : "checks"}.json`,
    JSON.stringify(
      {
        engine,
        screens: inventory,
        requests,
        checks: [
          "lazy sections",
          "selected limits only",
          "no hidden GPT polling",
          "one GPT entry",
          "admin isolation",
          "draft continuity",
          "password clearing",
          "exact back navigation",
          "scroll continuity",
          "resizable navigation",
          ...(continuityOnly ? [] : ["four themes/five widths"]),
          "keyboard bounds",
          "no native writes",
        ],
      },
      null,
      2,
    ),
  );
  console.log("PASS settings", engine);
} catch (error) {
  console.log(await settings.innerText().catch(() => ""));
  throw error;
} finally {
  await browser.close();
  await f.close();
}
