import assert from "node:assert/strict";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:19987";
  const f = await handoffFixture(origin);
  const browser = await engine.launch();
  try {
    await f.app.listen({ port: 19987, host: "127.0.0.1" });
    assert.equal((await f.release()).statusCode, 200);
    f.store.append(f.thread.id, "user.message", {
      id: "history-kept",
      text: "History remains intact",
    });
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      serviceWorkers: "block",
    });
    const [cookieName, value] = f.headers.cookie.split("=");
    await context.addCookies([{ name: cookieName, value, url: origin }]);
    await context.addInitScript(
      ({ threadId }) => {
        localStorage.setItem("codex-project", "project");
        localStorage.setItem("codex-thread", threadId);
      },
      { threadId: f.thread.id },
    );
    const page = await context.newPage();
    let reads = 0;
    await page.route("**/api/threads/*/history", async (route) => {
      if (++reads <= 3)
        return route.fulfill({
          status: 502,
          json: {
            error: { code: "CODEX_RESPONSE_TOO_LARGE", message: "Temporary history read failure" },
          },
        });
      return route.fulfill({
        json: {
          ...f.store.history(f.thread.id),
          thread: f.store.thread(f.thread.id),
          approvals: [],
        },
      });
    });
    await page.goto(origin);
    await expect(page.getByText("History remains intact", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    assert.equal(reads, 4);
    assert(!f.calls.some((c) => /turn\/start|turn\/steer|thread\/resume/.test(c.method)));
    console.log(name + ": initial history recovers without reload or native sends");
  } finally {
    await browser.close();
    await f.close();
  }
}
