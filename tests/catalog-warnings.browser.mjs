import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit, expect } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";
const origin = "http://127.0.0.1:18949";
const f = await handoffFixture(origin);
f.sessions.catalog.history = async (t) => ({ ...f.store.history(t.id), nextBefore: null });
f.store.setPreferences({
  projectId: "project",
  threadId: f.thread.id,
  view: "chat",
  theme: "crt-green",
});
const warning = "Не удалось обновить проекты с компьютера. Сохранённый список доступен.";
try {
  await f.app.listen({ host: "127.0.0.1", port: 18949 });
  await mkdir(".local/qa-catalog-readiness", { recursive: true });
  for (const [name, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await type.launch(),
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        serviceWorkers: "block",
      });
    try {
      const [key, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name: key, value, url: origin, httpOnly: true }]);
      const page = await context.newPage();
      let source = "other-device",
        reads = 0;
      await page.route("**/api/projects?*", async (route) => {
        const response = await route.fetch(),
          data = await response.json();
        reads++;
        await route.fulfill({
          json: {
            ...data,
            warnings: source ? [warning] : [],
            machineWarnings: source ? [{ machineId: source, message: warning }] : [],
          },
        });
      });
      await page.route("**/api/projects", async (route) => {
        const response = await route.fetch(),
          data = await response.json();
        reads++;
        await route.fulfill({
          json: {
            ...data,
            warnings: source ? [warning] : [],
            machineWarnings: source ? [{ machineId: source, message: warning }] : [],
          },
        });
      });
      await page.goto(origin);
      await expect(page.locator(".chat-scroll")).toBeVisible();
      const refresh = async () => {
        const before = reads;
        await page.bringToFront();
        await expect
          .poll(async () => {
            await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
            return reads;
          })
          .toBeGreaterThan(before);
        await expect.poll(() => reads).toBeGreaterThan(before);
        await page.waitForTimeout(150);
      };
      await refresh();
      await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
      const project = f.sessions.catalog.publicProjects().find((p) => p.id === "project");
      source = project.machineId;
      await refresh();
      await expect(page.getByText(warning, { exact: true })).toBeVisible();
      // The existing notice has a close action. Dismissal survives the next identical poll.
      await page.getByText(warning, { exact: true }).locator("..").getByRole("button").click();
      await refresh();
      await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
      source = "";
      await refresh();
      source = project.machineId;
      await refresh();
      await expect(page.getByText(warning, { exact: true })).toBeVisible();
      source = "";
      await refresh();
      await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
      await page.screenshot({ path: ".local/qa-catalog-readiness/" + name + ".png" });
      console.log(
        name + ": other-device warning excluded, exact-device warning/dismissal/recovery passed",
      );
    } finally {
      await context.close();
      await browser.close();
    }
  }
} finally {
  await f.close();
}
