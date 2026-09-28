import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerContentSearch } from "../apps/hub/dist/content-search.js";
import { registerGpt } from "../apps/hub/dist/gpt.js";
import { searchGptResults } from "../apps/hub/dist/result-search.js";
import { Store } from "../apps/hub/dist/store.js";
import Fastify from "../apps/hub/node_modules/fastify/fastify.js";
import { configSchema, HubError, resultSearchQuerySchema } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

test("stored file search has stable ordered pages, exact scope and metadata-only replies", async () => {
  const f = await handoffFixture();
  try {
    const second = f.store.createThread("project", "second-native", "Second chat");
    const foreign = f.store.createThread("foreign-project", "foreign-native", "Foreign");
    f.store.result(foreign.id, null, "foreign", "file", "needle-foreign.txt", {});
    const ids = [];
    for (let i = 0; i < 91; i++)
      ids.push(
        f.store.result(
          i % 2 ? second.id : f.thread.id,
          "turn-" + i,
          "file-" + i,
          i % 3 ? "file" : "image",
          `ФАЙЛ-${String(i).padStart(3, "0")}.txt`,
          { sourcePath: "SECRET_PATH", text: "SECRET_PAYLOAD" },
        ),
      );
    f.store.result(f.thread.id, null, "hidden", "reasoning", "ФАЙЛ hidden", {});
    const endpoint = "/api/projects/project/results/search";
    assert.equal((await f.app.inject(endpoint)).statusCode, 401);
    for (const sort of ["newest", "oldest", "name"]) {
      let cursor,
        found = [];
      do {
        const response = await f.app.inject({
          url:
            endpoint +
            "?" +
            new URLSearchParams({ q: "файл", sort, ...(cursor ? { cursor } : {}) }),
          headers: f.headers,
        });
        assert.equal(response.statusCode, 200, response.body);
        const page = response.json();
        assert(page.items.length <= 40);
        assert(page.scanned <= 500);
        assert.doesNotMatch(response.body, /SECRET|foreign|hidden|payload/);
        found.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(
        found.map((x) => x.id),
        sort === "newest" ? [...ids].reverse() : ids,
      );
      assert(found.every((x) => x.turnId && [second.id, f.thread.id].includes(x.threadId)));
    }
    const url = `/api/threads/${f.thread.id}/results/search?category=images`;
    const images = (await f.app.inject({ url, headers: f.headers })).json();
    assert(images.items.every((x) => x.threadId === f.thread.id && x.type === "image"));
    const first = (await f.app.inject({ url: endpoint, headers: f.headers })).json();
    f.store.result(f.thread.id, null, "later", "file", "LATER.txt", {});
    const next = await f.app.inject({
      url: endpoint + "?cursor=" + first.nextCursor,
      headers: f.headers,
    });
    assert.equal(next.statusCode, 200);
    assert.doesNotMatch(next.body, /LATER/);
    assert.equal(
      (
        await f.app.inject({
          url: endpoint + "?sort=name&cursor=" + first.nextCursor,
          headers: f.headers,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.app.inject({
          url: `/api/threads/${second.id}/results/search?cursor=${first.nextCursor}`,
          headers: f.headers,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await f.app.inject({ url: "/api/projects/missing/results/search", headers: f.headers }))
        .statusCode,
      404,
    );
    assert.equal(f.calls.length, 0);
  } finally {
    await f.close();
  }
});

test("sparse stored search continues after scanned rows, including an empty match page", async () => {
  const f = await handoffFixture();
  try {
    const oldest = f.store.result(f.thread.id, "exact-turn", "old", "artifact", "Needle.zip", {});
    for (let i = 0; i < 510; i++)
      f.store.result(f.thread.id, null, "f" + i, "file", "other.txt", {});
    const url = `/api/threads/${f.thread.id}/results/search?q=needle`;
    const first = (await f.app.inject({ url, headers: f.headers })).json();
    assert.equal(first.scanned, 500);
    assert.deepEqual(first.items, []);
    assert(first.nextCursor);
    const second = (
      await f.app.inject({ url: url + "&cursor=" + first.nextCursor, headers: f.headers })
    ).json();
    assert.equal(second.items[0].id, oldest);
    assert.equal(second.items[0].turnId, "exact-turn");
    assert.equal(second.nextCursor, null);
  } finally {
    await f.close();
  }
});

test("GPT search continuation is bound to conversation, query, ordering and revision", () => {
  const items = Array.from({ length: 520 }, (_, i) => ({
    id: "f" + i,
    type: "file",
    title: i === 519 ? "Résumé-ＦＩＬＥ.txt" : "other.txt",
    createdAt: new Date().toISOString(),
    turnId: "m" + i,
    payload: { text: "SECRET" },
  }));
  const query = resultSearchQuerySchema.parse({ q: "résumé-file" });
  const first = searchGptResults("chat", items, "rev", query);
  assert.equal(first.scanned, 500);
  assert.deepEqual(first.items, []);
  const next = { ...query, cursor: first.nextCursor };
  assert.equal(searchGptResults("chat", items, "rev", next).items[0].id, "f519");
  assert.throws(
    () => searchGptResults("chat", items, "new-rev", next),
    (e) => e.code === "RESULTS_CHANGED",
  );
  assert.throws(
    () => searchGptResults("other", items, "rev", next),
    (e) => e.code === "RESULTS_CHANGED",
  );
  assert.throws(
    () => searchGptResults("chat", items, "rev", { ...next, sort: "oldest" }),
    (e) => e.code === "RESULTS_CHANGED",
  );
});

test("actual GPT routes search files and public messages, isolate accounts and recheck revoked/deleted sources", async () => {
  const root = mkdtempSync(join(tmpdir(), "results-search-")),
    apps = [],
    stores = [],
    services = [];
  let revoked = false;
  try {
    for (let i = 0; i < 2; i++) {
      const store = new Store(":memory:"),
        app = Fastify();
      stores.push(store);
      apps.push(app);
      app.setErrorHandler((e, _req, reply) =>
        reply.code(e.statusCode ?? 500).send({ code: e.code }),
      );
      const gpt = registerGpt(
        app,
        configSchema.parse({
          hub: {
            publicBaseUrl: "https://test.invalid",
            databasePath: ":memory:",
            resultsPath: join(root, String(i)),
          },
          auth: {},
          machines: [],
          projects: [],
        }),
        store,
        () => {
          if (revoked) throw new HubError(403, "REVOKED", "Revoked");
        },
      );
      registerContentSearch(app, { store }, gpt);
      await app.ready();
      await gpt.close();
      services.push(gpt);
      gpt.historyCache.seed(
        "chat",
        i
          ? []
          : Array.from({ length: 90 }, (_, n) => ({
              id: "m" + n,
              role: "assistant",
              text: "Public needle " + n,
              complete: true,
              createdAt: n + 1,
              files: [
                {
                  id: "f" + n,
                  name: "needle-" + n + ".txt",
                  url: "/api/gpt/files/f" + n,
                  mime: "text/plain",
                  bytes: 10,
                  image: false,
                },
              ],
            })),
      );
    }
    const url = "/api/gpt/conversations/chat/results/search?q=needle";
    const first = await apps[0].inject(url);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().items.length, 40);
    assert.equal((await apps[1].inject(url)).json().items.length, 0);
    assert.doesNotMatch(first.body, /payload|\/api\/gpt\/files/);
    const search = "/api/workspace/search?client=gpt&threadId=chat&q=needle&kind=files&limit=20";
    const content = (await apps[0].inject(search)).json();
    assert.equal(content.items.length, 20);
    assert.equal(content.items[0].target.kind, "result");
    assert.equal(content.items[0].target.threadId, "chat");
    assert(content.items[0].target.messageId);
    assert.equal(
      (await apps[0].inject(search.replace("kind=files", "kind=messages"))).json().items[0].target
        .kind,
      "thread",
    );
    assert.equal((await apps[0].inject(search + "&revision=stale&offset=20")).statusCode, 409);
    const exact = await apps[0].inject(
      "/api/gpt/conversations/chat/results/" + first.json().items[0].id,
    );
    assert.equal(exact.statusCode, 200);
    services[0].library.save("thread", "chat", { deleted: true });
    assert.equal((await apps[0].inject(url)).statusCode, 404);
    assert.equal((await apps[0].inject(search)).statusCode, 404);
    services[0].library.save("thread", "chat", { deleted: false });
    revoked = true;
    assert.equal((await apps[0].inject(url)).statusCode, 403);
    assert.equal((await apps[0].inject(search)).statusCode, 403);
  } finally {
    for (const app of apps) await app.close();
    for (const store of stores) store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
