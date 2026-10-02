import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect, webkit } from "@playwright/test";
import { handoffFixture } from "./handoff-fixture.mjs";

await mkdir(".local/qa-send-visibility", { recursive: true });
const photo = {
  id: "12345678-1234-4234-8234-123456789abc",
  name: "photo.png",
  image: true,
  mime: "image/png",
  bytes: 100,
  url: "/api/test-photo",
  previewUrl: "/api/test-photo",
  createdAt: "",
};
for (const [engine, type] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const origin = "http://127.0.0.1:18971",
    f = await handoffFixture(origin),
    browser = await type.launch();
  f.store.db.prepare("UPDATE threads SET origin='web' WHERE id=?").run(f.thread.id);
  f.store.setPreferences({
    projectId: "project",
    threadId: f.thread.id,
    theme: "crt-green",
    view: "chat",
    machineClients: { pc: "web" },
  });
  await f.app.listen({ host: "127.0.0.1", port: 18971 });
  try {
    for (const client of ["codex", "gpt"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      const [name, value] = f.headers.cookie.split("=");
      await context.addCookies([{ name, value, url: origin }]);
      await context.addInitScript(
        ({ client, photo }) => {
          localStorage.setItem("codex-client", client);
          if (client === "gpt") {
            localStorage.setItem("gpt-conversation", "chat");
            sessionStorage.setItem(
              "gpt-draft-chat",
              JSON.stringify({ text: "Photo remains visible", files: [photo] }),
            );
          }
        },
        { client, photo },
      );
      const page = await context.newPage();
      let releaseSend,
        posts = 0,
        socket,
        job,
        canonical = [],
        reject = false;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/test-photo*", (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="green"/></svg>',
        }),
      );
      if (client === "codex") {
        await page.routeWebSocket("**/api/events?**", (ws) => {
          socket = ws;
          ws.send(
            JSON.stringify({
              type: "connection.ready",
              thread: f.store.thread(f.thread.id),
              approvals: [],
            }),
          );
        });
        await page.route("**/api/threads/*/attachments", (route) =>
          route.fulfill({ json: { attachments: [{ ...photo, threadId: f.thread.id }] } }),
        );
        await page.route("**/api/threads/*/turns", async (route) => {
          posts++;
          await new Promise((r) => (releaseSend = r));
          return reject
            ? route.fulfill({
                status: 409,
                json: { error: "TEST_REJECTED", message: "Не принято" },
              })
            : route.fulfill({ json: { turnId: "accepted-turn", status: "running" } });
        });
      } else {
        await page.route("**/api/gpt/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path.endsWith("/status"))
            return route.fulfill({ json: { configured: true, canSend: true, state: "healthy" } });
          if (path.endsWith("/models"))
            return route.fulfill({
              json: {
                models: [{ id: "Latest", label: "Latest" }],
                efforts: [{ id: "2", label: "High" }],
                currentModel: "Latest",
                currentEffort: "2",
              },
            });
          if (path.endsWith("/messages"))
            return route.fulfill({
              json: { nativeId: "chat", title: "Chat", items: canonical, before: null },
            });
          if (path.endsWith("/jobs"))
            return route.fulfill({ json: { items: job ? [job] : [], stamp: Date.now() } });
          if (path.endsWith("/send")) {
            posts++;
            const body = route.request().postDataJSON();
            await new Promise((r) => (releaseSend = r));
            if (reject)
              return route.fulfill({
                status: 409,
                json: { error: "TEST_REJECTED", message: "Не принято" },
              });
            job = {
              ...body,
              id: route.request().headers()["idempotency-key"],
              files: [photo],
              status: "queued",
              answer: "",
              assets: [],
              error: "",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            return route.fulfill({ json: { job } });
          }
          return route.fulfill({ json: { items: [], conversations: [], nextOffset: null } });
        });
      }
      await page.goto(origin);
      const editor = page.getByRole("textbox", {
        name: client === "codex" ? "Сообщение Codex" : "Сообщение GPT",
      });
      await expect(editor).toBeVisible();
      await editor.fill("Photo remains visible");
      const send = page.getByRole("button", {
        name: client === "codex" ? "Отправить сообщение" : "Отправить GPT",
        exact: true,
      });
      await expect(send).toBeEnabled();
      const rows = page.locator(
        client === "codex" ? ".chat-content .message.user" : ".gpt-chat .message.user",
      );
      await send.click();
      await expect.poll(() => posts).toBe(1);
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Отправляется");
      await expect
        .poll(() => rows.locator("img").evaluate((img) => img.naturalWidth))
        .toBeGreaterThan(0);
      releaseSend();
      await expect(editor).toHaveValue("");
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText("Photo remains visible");
      await page.screenshot({ path: `.local/qa-send-visibility/${engine}-${client}-accepted.png` });
      // Several polling intervals without a canonical message must not create a hole.
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(500);
        await expect(rows).toHaveCount(1);
        await expect(rows.locator("img")).toHaveCount(1);
      }
      if (client === "codex") {
        socket.send(
          JSON.stringify({
            type: "user.message",
            seq: 100,
            turnId: "accepted-turn",
            payload: {
              id: "canonical-user",
              text: "Photo remains visible",
              attachments: [{ ...photo, threadId: f.thread.id }],
            },
          }),
        );
        await expect(page.locator('[data-message="canonical-user"]')).toBeVisible();
      } else {
        job.status = "running";
        job.updatedAt = Date.now();
        // Native text can arrive before attachment metadata; keep the exact upload.
        canonical = [
          {
            id: "canonical-user",
            role: "user",
            text: job.text,
            createdAt: job.createdAt / 1000,
            files: [],
          },
        ];
        await expect
          .poll(
            async () => {
              await page.evaluate(() => window.dispatchEvent(new Event("online")));
              return page.locator('[data-message="canonical-user"]').count();
            },
            { timeout: 15000 },
          )
          .toBe(1);
      }
      await expect(rows).toHaveCount(1);
      await expect
        .poll(() => rows.locator("img").evaluate((img) => img.naturalWidth))
        .toBeGreaterThan(0);
      await page.screenshot({
        path: `.local/qa-send-visibility/${engine}-${client}-canonical.png`,
      });
      reject = true;
      await editor.fill("Rejected draft stays");
      await (client === "gpt" ? page.locator(".gpt-composer button[type=submit]") : send).click();
      await expect.poll(() => posts).toBe(2);
      await expect(rows).toHaveCount(2);
      releaseSend();
      await expect(rows).toHaveCount(1);
      await expect(editor).toHaveValue("Rejected draft stays");
      assert.equal(posts, 2, "reads and reconciliation never replay a send");
      if (client === "codex") {
        reject = false;
        await editor.fill("Photo remains visible");
        await send.click();
        await expect.poll(() => posts).toBe(3);
        await expect(rows).toHaveCount(2);
        // Canonical event wins the race against the HTTP acknowledgement.
        socket.send(
          JSON.stringify({
            type: "user.message",
            seq: 101,
            payload: {
              id: "second-user",
              text: "Photo remains visible",
              attachments: [],
            },
          }),
        );
        await expect(page.locator('[data-message="second-user"]')).toBeVisible();
        await expect(rows).toHaveCount(2);
        releaseSend();
        await expect(editor).toHaveValue("");
        await expect(rows).toHaveCount(2);
      }
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `${engine} ${client}: photo/text survive delayed acknowledgement and history; no duplicate; rejected draft retained`,
      );
    }
  } finally {
    await browser.close();
    await f.close();
  }
}
