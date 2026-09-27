import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { communicationFixture } from "./communication-fixture.mjs";

const ok = (r) => {
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
};
async function setup(t) {
  const f = await communicationFixture();
  t.after(f.close);
  const group = ok(
    await f.request(f.headers, "POST", "/api/team/conversations", {
      kind: "group",
      title: "Reading",
      members: [f.friend],
    }),
  );
  const path = `/api/team/conversations/${group.id}`;
  const detail = async () => ok(await f.request(f.headers, "GET", path));
  return { ...f, group, path, detail };
}

test("Unicode/file search traverses bounded history pages; exact locations never expose another conversation", async (t) => {
  const f = await setup(t),
    chat = f.path + "/chat";
  const file = ok(
    await f.hub.app.inject({
      method: "POST",
      url: chat + "/files?name=" + encodeURIComponent("СМЕТА.txt") + "&mime=text/plain",
      headers: { ...f.headers, "content-type": "application/octet-stream" },
      payload: Buffer.from("cost"),
    }),
  );
  const first = ok(
    await f.request(f.friendHeaders, "POST", chat, { text: "Ёжик обсуждает бюджет", files: [] }),
  );
  const attachment = ok(await f.request(f.headers, "POST", chat, { text: "", files: [file.id] }));
  // Seed long established history without hundreds of unrelated HTTP sends/rate-limit tests.
  const insert = f.hub.registry.db.prepare(
    "INSERT INTO conversation_chat_messages(id,spaceId,authorId,text,createdAt) VALUES(?,?,?,?,?)",
  );
  for (let i = 0; i < 525; i++)
    insert.run(randomUUID(), f.group.id, f.friend, "Ordinary " + i, Date.now());
  const search = async (q, before) =>
    ok(
      await f.request(
        f.headers,
        "GET",
        chat + "/search?" + new URLSearchParams({ q, ...(before ? { before } : {}) }),
      ),
    );
  const scan = await search("ёжик");
  assert.equal(scan.items.length, 0);
  assert.ok(scan.before);
  const found = await search("ёжик", scan.before);
  assert.equal(found.items[0].seq, first.seq);
  assert.equal(found.before, null);
  const names = await search("смета", scan.before);
  assert.equal(names.items[0].seq, attachment.seq);
  let cursor,
    count = 0;
  do {
    const page = await search("ordinary", cursor);
    count += page.items.length;
    cursor = page.before;
  } while (cursor);
  assert.equal(count, 525);
  const located = ok(await f.request(f.headers, "GET", chat + `/locate?seq=${attachment.seq}`));
  assert.equal(located.messages.length, 22);
  assert.equal(located.messages[1].files[0].id, file.id);
  assert.equal(located.moreAfter, true);
  const other = ok(
    await f.request(f.headers, "POST", "/api/team/conversations", {
      kind: "direct",
      title: "",
      members: [f.third],
    }),
  );
  assert.equal(
    (
      await f.request(
        f.headers,
        "GET",
        `/api/team/conversations/${other.id}/chat/locate?seq=${first.seq}`,
      )
    ).statusCode,
    404,
  );
  for (const suffix of ["/search?q=ordinary", `/locate?seq=${first.seq}`])
    assert.equal((await f.request(f.thirdHeaders, "GET", chat + suffix)).statusCode, 404);
  ok(
    await f.request(f.headers, "POST", f.path + "/members", {
      action: "remove",
      userId: f.friend,
      version: (await f.detail()).membersVersion,
    }),
  );
  for (const suffix of ["/search?q=ordinary", `/locate?seq=${first.seq}`])
    assert.equal((await f.request(f.friendHeaders, "GET", chat + suffix)).statusCode, 404);
});

test("unread and mention targets use the actor cursor; read acknowledgement preserves arrivals after the captured sequence", async (t) => {
  const f = await setup(t),
    chat = f.path + "/chat";
  const send = async (headers, text, mentions = []) =>
    ok(await f.request(headers, "POST", chat, { text, files: [], mentions }));
  await send(f.headers, "own");
  const first = await send(f.friendHeaders, "first");
  const mention = await send(f.friendHeaders, "attention", [f.owner]);
  let d = await f.detail();
  assert.equal(d.unread, 2);
  assert.equal(d.firstUnreadSeq, first.seq);
  assert.equal(d.mentionSeq, mention.seq);
  assert.equal(d.unreadMentions, 1);
  ok(await f.request(f.headers, "GET", chat + `/locate?seq=${first.seq}`));
  assert.equal((await f.detail()).unread, 2, "locating does not read");
  const later = await send(f.friendHeaders, "arrived while notification was visible", [f.owner]);
  ok(await f.request(f.headers, "POST", chat + "/read", { seq: d.lastSeq }));
  d = await f.detail();
  assert.equal(d.unread, 1);
  assert.equal(d.mentionSeq, later.seq);
  ok(await f.request(f.headers, "POST", chat + "/read", { seq: first.seq }));
  assert.equal((await f.detail()).unread, 1, "cursor never moves backward");
});

test("group rename is owner-only, revision-bound and durable across retries", async (t) => {
  const f = await setup(t),
    key = randomUUID(),
    body = { title: "Новое название", version: 0 };
  assert.equal((await f.request(f.friendHeaders, "POST", f.path + "/title", body)).statusCode, 403);
  ok(await f.request(f.headers, "POST", f.path + "/title", body, key));
  ok(await f.request(f.headers, "POST", f.path + "/title", body, key));
  assert.equal((await f.detail()).title, body.title);
  assert.equal((await f.detail()).membersVersion, 1);
  assert.equal(
    (await f.request(f.headers, "POST", f.path + "/title", { ...body, title: "Stale" })).statusCode,
    409,
  );
  assert.equal(
    (await f.request(f.headers, "POST", f.path + "/title", { title: "   ", version: 1 }))
      .statusCode,
    400,
  );
});

test("coarse availability handles multiple clients, expiry and disabled accounts without exposing activity", async (t) => {
  const f = await setup(t),
    path = "/api/team/communication/presence",
    a = randomUUID(),
    b = randomUUID();
  const heartbeat = async (id, active) =>
    ok(await f.request(f.friendHeaders, "POST", path, { id, active }));
  await heartbeat(a, true);
  await heartbeat(b, true);
  await heartbeat(a, false);
  const value = ok(await f.request(f.headers, "GET", path));
  assert.deepEqual(value, { online: [f.friend] });
  await heartbeat(b, false);
  assert.deepEqual(ok(await f.request(f.headers, "GET", path)), { online: [] });
  await heartbeat(a, true);
  const now = Date.now();
  const mock = t.mock.method(Date, "now", () => now + 71000);
  assert.deepEqual(ok(await f.request(f.headers, "GET", path)), { online: [] });
  mock.mock.restore();
  await heartbeat(a, true);
  f.hub.registry.db.prepare("UPDATE team_users SET state='disabled' WHERE id=?").run(f.friend);
  assert.deepEqual(ok(await f.request(f.headers, "GET", path)), { online: [] });
  assert.notEqual(
    (await f.request(f.friendHeaders, "POST", path, { id: a, active: true })).statusCode,
    200,
  );
});
