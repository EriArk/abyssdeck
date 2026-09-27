import assert from "node:assert/strict";
import test from "node:test";
import { searchSnippet } from "../apps/hub/dist/content-search.js";
import { handoffFixture } from "./handoff-fixture.mjs";

test("content search is Unicode-aware, literal and bounded", () => {
  assert.match(searchSnippet("Привет, КИРИЛЛИЦА и 100%", "кириллица"), /КИРИЛЛИЦА/);
  assert.equal(searchSnippet("nothing here", "%"), null);
  assert(searchSnippet("a".repeat(2000) + "needle" + "b".repeat(2000), "needle").length <= 322);
});
test("authenticated content search paginates saved public messages, never tools or hidden phases", async () => {
  const f = await handoffFixture();
  try {
    const insert = f.store.db.prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 503; i++)
      insert.run(
        f.thread.id,
        "message-" + i,
        "turn",
        "assistant",
        "final",
        i === 0 ? "Давнее совпадение" : "Сообщение " + i,
        i,
        i,
        new Date(i * 1000).toISOString(),
      );
    insert.run(
      f.thread.id,
      "hidden",
      "turn",
      "assistant",
      "analysis",
      "SECRET совпадение",
      600,
      600,
      new Date().toISOString(),
    );
    insert.run(
      f.thread.id,
      "tool",
      "turn",
      "tool",
      "final",
      "SECRET совпадение",
      601,
      601,
      new Date().toISOString(),
    );
    const url =
      "/api/workspace/search?" + new URLSearchParams({ q: "СОВПАДЕНИЕ", threadId: f.thread.id });
    assert.equal((await f.app.inject({ url })).statusCode, 401);
    const first = await f.app.inject({ url, headers: f.headers });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().nextOffset, 500);
    assert.equal(first.json().items.length, 0);
    const second = (await f.app.inject({ url: url + "&offset=500", headers: f.headers })).json();
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].target.messageId, "message-0");
    assert.doesNotMatch(JSON.stringify(second), /SECRET/);
    const global = (
      await f.app.inject({
        url: "/api/workspace/search?q=" + encodeURIComponent("Давнее") + "&offset=500",
        headers: f.headers,
      })
    ).json();
    assert.equal(global.items[0].target.messageId, "message-0");
    assert.equal(f.calls.length, 0);
  } finally {
    await f.close();
  }
});

test("project content and file search keep exact identities and never expose payloads", async () => {
  const f = await handoffFixture();
  try {
    const other = f.store.createThread("other-project", "other-native", "Other project");
    f.store.result(other.id, null, "foreign", "file", "needle-foreign.zip", {});
    const ids = [];
    for (let i = 0; i < 45; i++)
      ids.push(
        f.store.result(f.thread.id, "turn", "file-" + i, "file", `needle-${i}.zip`, {
          text: "SECRET_PAYLOAD",
          sourcePath: "C:/private/SECRET_PATH",
        }),
      );
    f.store.result(f.thread.id, null, "hidden-result", "reasoning", "needle hidden reasoning", {
      text: "SECRET_REASONING",
    });
    const url =
      "/api/workspace/search?" +
      new URLSearchParams({
        q: "needle",
        projectId: "project",
        client: "codex",
        kind: "files",
        limit: "20",
      });
    const hits = [];
    let offset = 0;
    do {
      const response = await f.app.inject({ url: url + "&offset=" + offset, headers: f.headers });
      assert.equal(response.statusCode, 200, response.body);
      const page = response.json();
      assert(page.items.length <= 20);
      assert.doesNotMatch(response.body, /SECRET|foreign/);
      hits.push(...page.items);
      offset = page.nextOffset;
    } while (offset !== null);
    assert.deepEqual(new Set(hits.map((x) => x.target.id)), new Set(ids));
    for (const hit of hits) {
      assert.equal(hit.target.kind, "result");
      assert.equal(hit.target.threadId, f.thread.id);
      assert.equal(hit.target.projectId, "project");
      assert.equal(hit.target.messageId, undefined);
    }
    const gpt = await f.app.inject({
      url: url.replace("client=codex", "client=gpt"),
      headers: f.headers,
    });
    assert.deepEqual(gpt.json().items, []);
    assert.equal(f.calls.length, 0);
  } finally {
    await f.close();
  }
});

test("bounded match pages resume after the last scanned record, including sparse pages", async () => {
  const f = await handoffFixture();
  try {
    const insert = f.store.db.prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 550; i++)
      insert.run(
        f.thread.id,
        "m-" + i,
        "turn",
        "assistant",
        "final",
        i % 7 === 0 ? "needle" : "no match",
        i,
        i,
        new Date(i * 1000).toISOString(),
      );
    let offset = 0;
    const found = [];
    do {
      const response = await f.app.inject({
        url: `/api/workspace/search?q=needle&threadId=${f.thread.id}&kind=messages&limit=20&offset=${offset}`,
        headers: f.headers,
      });
      assert.equal(response.statusCode, 200, response.body);
      const page = response.json();
      assert(page.scanned <= 500);
      found.push(...page.items.map((x) => x.target.messageId));
      offset = page.nextOffset;
    } while (offset !== null);
    assert.equal(found.length, 79);
    assert.equal(new Set(found).size, 79);
    assert.equal(found.at(-1), "m-0");
  } finally {
    await f.close();
  }
});
