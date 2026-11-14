import assert from "node:assert/strict";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:19988";
  const f = await handoffFixture(origin);
  const browser = await engine.launch();
  try {
    await f.release();
    f.store.setPreferences({ projectId: "project", threadId: f.thread.id });
    await f.app.listen({ port: 19988, host: "127.0.0.1" });
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      serviceWorkers: "block",
    });
    const [cookieName, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name: cookieName, value, url: origin }]);
    const page = await context.newPage();
    const errors = [],
      writes = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/(turns|queue)(\/|$)/.test(new URL(r.url()).pathname))
        writes.push(r.url());
    });
    let attempts = 0,
      finish;
    await page.route("**/api/threads/*/resume", async (route) => {
      attempts++;
      const response = await new Promise((resolve) => {
        finish = resolve;
      });
      await route.fulfill(response);
    });
    const fail = () =>
      finish({
        status: 503,
        json: { error: { code: "CODEX_DISCONNECTED", message: "Codex connection is closed" } },
      });
    const outage = () =>
      f.sessions.emitEvent(f.thread.id, "error", {
        code: "CODEX_DISCONNECTED",
        message: "Codex connection is closed",
      });
    let proof = 0;
    const running = async () => {
      f.store.setStatus(f.thread.id, "running", "live-turn");
      f.sessions.emitEvent(f.thread.id, "turn.started", {}, "live-turn");
      const text = `Native proof ${++proof}`;
      f.sessions.emitEvent(
        f.thread.id,
        "assistant.completed",
        { id: `proof-${proof}`, text, phase: "commentary" },
        "live-turn",
      );
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    };
    await page.goto(origin);
    const draft = page.getByRole("textbox", { name: "Сообщение Codex" });
    await expect(draft).toBeVisible();
    await draft.fill("Не отправлять повторно");
    await expect.poll(() => f.app.websocketServer.clients.size).toBeGreaterThan(0);
    outage();
    await expect.poll(() => attempts).toBe(1);
    fail();
    await expect(page.locator(".connection-recovery")).toHaveCount(1);
    await running();
    // A native event proves recovery even if the earlier status probe failed.
    await expect(page.locator(".connection-recovery")).toHaveCount(0);

    outage();
    await expect.poll(() => attempts).toBe(2);
    await running();
    fail();
    // A late failed probe cannot resurrect an error after native progress.
    await expect(page.locator(".connection-recovery")).toHaveCount(0);
    await expect(draft).toHaveValue("Не отправлять повторно");

    outage();
    await expect.poll(() => attempts).toBe(3);
    fail();
    await expect(page.locator(".connection-recovery")).toHaveCount(1);
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
    );
    await expect.poll(() => attempts).toBe(4);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(attempts, 4, "foreground/network events share one pending read");
    fail();
    await expect(page.locator(".connection-recovery")).toHaveCount(1);
    for (const client of f.app.websocketServer.clients) client.close();
    await expect.poll(() => attempts).toBe(5);
    f.store.setStatus(f.thread.id, "completed", null);
    finish({ json: f.store.thread(f.thread.id) });
    await expect(page.locator(".connection-recovery")).toHaveCount(0);
    await expect(draft).toHaveValue("Не отправлять повторно");
    f.store.setStatus(f.thread.id, "unknown", "uncertain-turn");
    f.sessions.emitEvent(f.thread.id, "session.state", { status: "unknown" });
    await expect.poll(() => attempts).toBe(6);
    finish({ json: f.store.thread(f.thread.id) });
    await expect(page.locator(".connection-recovery")).toHaveCount(1);
    // resume() also reopens the event stream. That local refresh must not
    // turn an honestly unknown result into a self-sustaining status loop.
    await page.waitForTimeout(1500);
    assert.equal(attempts, 6);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    assert(!f.calls.some((c) => /turn\/start|turn\/steer|thread\/resume/.test(c.method)));
    console.log(
      name +
        ": native recovery, late failure, foreground/socket retry, one control and preserved draft",
    );
  } finally {
    await browser.close();
    await f.close();
  }
}
