import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { usageFixture } from "../../../tests/usage-resets-fixture.mjs";

// Current production React components; all account/service data is disposable.
const out = "polish/07-settings-devices/settings-review";
const origin = "http://127.0.0.1:18943";
const f = await usageFixture(origin);
const owner = { id: "11111111-1111-4111-8111-111111111111", name: "Владелец", login: "owner-demo", role: "admin", state: "active" };
const friend = { ...owner, id: "22222222-2222-4222-8222-222222222222", name: "Участник", login: "member-demo", role: "member" };
const preferences = { projectId: "project", threadId: f.thread.id, theme: "crt-green", machineClients: { pc: "web" } };
f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
f.store.setPreferences(preferences);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
const [name, value] = f.headers.cookie.split("=");
await context.addCookies([{ name, value, url: origin, httpOnly: true }]);
await context.addInitScript(id => sessionStorage.setItem("codex-workspace-identity", id), owner.id);
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [], requests = [], inventory = [];
page.on("pageerror", e => errors.push(e.message));
await page.route("**/api/**", async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  requests.push({ method: req.method(), path });
  const team = {
    "/api/team/spaces": { spaces: [], invitations: [] },
    "/api/team/brainstorm": { rooms: [], invitations: [] },
    "/api/team/me": { user: owner, originalOwner: true },
    "/api/team/users": { items: [owner, friend], ownerId: owner.id, registrationEnabled: false },
    "/api/team/invitations": { items: [] },
    "/api/team/machine-reviews": { items: [] },
    "/api/team/machines": { enabled: true, items: [], activeMachineIds: ["pc", "server-workspace"] },
    "/api/team/server-workspace": { available: true, state: "ready" },
    "/api/team/gpt": { enabled: true, native: true, legacy: false, activated: true, state: "ready" },
  };
  if (team[path]) return route.fulfill({ json: team[path] });
  if (path.startsWith("/api/team/")) return route.fulfill({ json: { items: [] } });
  if (path === "/api/gpt/doctor") return route.fulfill({ json: {
    association: { enabled: true, projectId: "project", threadId: f.thread.id, state: "ready", mode: "repair", revision: 1 },
    projects: [{ id: "project", name: "Project" }], threads: [], incidents: [],
  } });
  if (path.startsWith("/api/gpt/")) return route.fulfill({ json:
    path.endsWith("/status") ? { configured: true, canSend: true, state: "healthy", message: "ChatGPT подключён", connectUrl: "/gpt-connect?runtime=native" }
    : path.endsWith("/models") ? { models: [{ id: "Latest", label: "Latest" }], efforts: [{ id: "high", label: "High" }], currentModel: "Latest", currentEffort: "high" }
    : { items: [], conversations: [], nextOffset: null, blocked: false }
  });
  if (path === "/api/deployment") return route.fulfill({ json: { separated: true, engineRevision: "f32b7f3", schema: 1, web: { kind: "web", revision: "43ccf6b", state: "installed" }, maintenance: null, blockers: [] } });
  if (path === "/api/storage") return route.fulfill({ json: { buckets: [{ id: "database", bytes: 1024 * 1024 * 18 }, { id: "artifacts", bytes: 1024 * 1024 * 350 }] } });
  const headers = { ...req.headers() }; delete headers["x-workspace-id"];
  if (path === "/api/auth/status" || path === "/api/auth/session") {
    const response = await route.fetch({ headers });
    return route.fulfill({ response, json: { ...await response.json(), team: true, user: owner, originalOwner: true } });
  }
  return route.continue({ headers });
});
const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
const button = name => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
async function choose(id) {
  if (!(await settings.locator(".settings-categories").isVisible())) await button("Все категории настроек").click();
  await settings.locator(`[data-category="${id}"]`).click();
  await settings.locator(".settings-section:visible").evaluate(e => { e.scrollTop = 0; });
}
async function shot(id, description) {
  await settings.screenshot({ path: `${out}/${id}.png`, animations: "disabled" });
  inventory.push({ id, description, viewport: page.viewportSize(), text: await settings.innerText(), scroll: await settings.locator(".settings-section:not([hidden])").evaluate(e => ({ height: e.clientHeight, content: e.scrollHeight })) });
  await writeFile(`${out}/${id}.md`, `# ${description}\n\n![${description}](${id}.png)\n\nТекущие React-компоненты, исходники f699411 (веб-релиз 43ccf6b). Chromium, ${page.viewportSize().width} × ${page.viewportSize().height}. Аккаунт, участник, подключение GPT, версии и системные данные — демонстрационные. Это разбор компоновки, не проверка живых подключений и не новый дизайн.\n`);
}
try {
  await mkdir(out, { recursive: true });
  await f.app.listen({ host: "127.0.0.1", port: 18943 });
  await page.goto(origin);
  await button("Настройки").click();
  await expect(settings).toBeVisible();
  for (const [width, suffix] of [[1366, "wide"], [390, "phone"]]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
    if (width === 390) {
      await button("Все категории настроек").click();
      await shot("index-phone", "Главный список настроек на телефоне");
    }
    for (const [id, title] of [["appearance", "Оформление"], ["sound", "Звук и уведомления"], ["connections", "Подключения"], ["library", "Проекты и история"], ["maintenance", "Обслуживание"], ["access", "Доступ"]]) {
      await choose(id);
      if (id === "connections") await expect(settings.getByRole("region", { name: "Личное серверное окружение" })).toBeVisible();
      if (id === "access") await expect(settings.locator(".team-account")).toContainText("owner-demo");
      if (id === "maintenance") {
        await expect(settings.locator(".storage-usage")).toBeVisible();
        for (const selector of [".deployment-status", ".bridge-doctor-panel", ".storage-usage"]) {
          const details = settings.locator(selector);
          if (await details.count()) await details.evaluate(e => { e.open = true; });
        }
      }
      await shot(`${id}-${suffix}`, title);
      if (id === "connections") {
        await settings.getByRole("region", { name: "Подключение GPT", exact: true }).evaluate(e => { e.scrollIntoView({ block: "start" }); });
        await shot(`${id}-${suffix}-gpt`, `${title} — GPT и компьютеры`);
      }
      if (["appearance", "connections", "access", "maintenance"].includes(id)) {
        await settings.locator(".settings-section:visible").evaluate(e => { e.scrollTop = e.scrollHeight; });
        await shot(`${id}-${suffix}-bottom`, `${title} — нижняя часть`);
      }
    }
  }
  for (const theme of ["hitech-2000s", "organizer", "classic-dark"]) {
    f.store.setPreferences({ ...preferences, theme });
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.reload();
    await button("Настройки").click();
    await choose("connections");
    await shot(`${theme}-connections-wide`, `Подключения · ${theme}`);
  }
  assert.deepEqual(errors, []);
  assert(f.desktopCalls.every(action => action === "Status"));
  assert(!f.calls.some(call => call.method === "turn/start"));
  await writeFile(`${out}/inventory.json`, JSON.stringify({ source: "f699411", fixture: true, screens: inventory, requests }, null, 2));
  console.log(`Captured ${inventory.length} current screens; no native sends or control actions`);
} catch (error) {
  console.log(errors);
  console.log(await page.locator("body").innerText());
  console.log(requests.slice(-25));
  throw error;
} finally { await browser.close(); await f.close(); }
