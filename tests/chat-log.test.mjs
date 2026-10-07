import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { saveChatLog, readChatLog } from "../apps/hub/dist/chat-log.js";
import { handoffFixture } from "./handoff-fixture.mjs";

test("text-only recovery survives broken native and missing attachment bytes; scope and deletion remain enforced", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  const { store, thread, sessions, app, headers } = f;
  saveChatLog(
    store,
    [
      {
        threadId: thread.id,
        id: "old",
        turnId: "turn-old",
        role: "user",
        phase: "",
        text: "Old request",
        firstSeq: -1,
        lastSeq: 0,
        createdAt: "",
      },
    ],
    10000,
  );
  store.append(
    thread.id,
    "assistant.delta",
    { id: "partial", text: "x".repeat(300000) },
    "new-turn",
  );
  store.setStatus(thread.id, "failed");
  store.db.prepare("UPDATE threads SET archived=1 WHERE id=?").run(thread.id);
  const file = await sessions.attachments.put(
    thread.id,
    "test.txt",
    Buffer.from("exact attachment"),
  );
  store.db.prepare("UPDATE attachments SET messageId='old' WHERE id=?").run(file.id);
  await unlink(join(sessions.attachments.root, file.id + ".bin"));
  sessions.catalog.connect = async () => {
    throw Error("native dead");
  };
  const list = await app.inject({ url: "/api/projects/project/chat-logs", headers });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().threads[0].messages, 2);
  const url = `/api/projects/project/chat-logs/${thread.id}/archive`;
  assert.equal((await app.inject({ url })).statusCode, 401);
  const response = await app.inject({ url, headers });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /zip/);
  const path = join(sessions.attachments.root, "qa-log.zip");
  await writeFile(path, response.rawPayload);
  const check = spawnSync(
    "python3",
    [
      "-c",
      `import zipfile,json,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
m=json.loads(z.read('manifest.json')); assert m['messages']==2 and not m['historyBackfillComplete']
rows=[json.loads(x) for x in z.read('messages.jsonl').splitlines()]; assert rows[0]['text']=='Old request'; assert len(rows[1]['text'])==300000
f=m['files'][0]; assert f['name']=='test.txt' and f['included']==False
assert not any(n.startswith('files/') for n in z.namelist())
assert b'Old request' in z.read('chat-0001.md')
`,
      path,
    ],
    { encoding: "utf8" },
  );
  assert.equal(check.status, 0, check.stderr);
  assert.equal(f.calls.length, 0);
  sessions.config.projects.push({
    id: "other",
    name: "Other",
    machineId: "pc",
    workingDirectory: "C:/Other",
    enabled: true,
  });
  assert.equal(
    (await app.inject({ url: url.replace("/project/", "/other/"), headers })).statusCode,
    404,
  );
  store.db.prepare("DELETE FROM attachments WHERE threadId=?").run(thread.id);
  store.db.prepare("DELETE FROM events WHERE threadId=?").run(thread.id);
  store.db.prepare("DELETE FROM messages WHERE threadId=?").run(thread.id);
  store.db.prepare("DELETE FROM threads WHERE id=?").run(thread.id);
  assert.equal(store.db.prepare("SELECT count(*) n FROM chat_log_messages").get().n, 0);
});

test("one full backfill, unchanged discoveries do not read Codex; a changed source reads only its new tail", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  const { catalog } = f.sessions;
  catalog.artifacts.observe = () => {
    throw Error("The logger must not capture files");
  };
  catalog.result = () => {
    throw Error("The logger must not import result payloads");
  };
  const items = Array.from({ length: 100 }, (_, i) => ({
    turnId: "turn",
    item: { type: "agentMessage", id: `item-${i}`, text: `message ${i}` },
  })).reverse();
  let reads = 0;
  catalog.verifyThreadRoot = async () => {};
  catalog.readThread = async () => ({ version: 1 });
  catalog.connect = async () => ({
    request: async (method, params) => {
      assert.equal(method, "thread/items/list");
      reads++;
      const offset = Number(params.cursor ?? 0),
        data = items.slice(offset, offset + params.limit);
      return {
        data,
        nextCursor: offset + data.length < items.length ? String(offset + data.length) : null,
      };
    },
  });
  await catalog.syncChatLogs("pc");
  assert.equal(reads, 3);
  assert.equal(readChatLog(f.store, f.thread.id).length, 100);
  for (let i = 0; i < 20; i++) await catalog.syncChatLogs("pc");
  assert.equal(reads, 3);
  items.unshift({ turnId: "new", item: { type: "agentMessage", id: "new", text: "new tail" } });
  f.store.db.prepare("UPDATE threads SET sourceUpdatedAt=2 WHERE id=?").run(f.thread.id);
  await catalog.syncChatLogs("pc");
  assert.equal(reads, 4);
  const log = readChatLog(f.store, f.thread.id);
  assert.equal(log.length, 101);
  assert.equal(log.at(-1).text, "new tail");
  assert.equal(log[0].text, "message 0");
});

test("interrupted first copy keeps a cursor and does not repeatedly query an unchanged broken chat", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  const { catalog } = f.sessions;
  let calls = 0;
  catalog.logHistory = async (_thread, before) => {
    calls++;
    if (!before) return { messages: [], hasMore: true, nextBefore: "saved-page" };
    throw Error("native unavailable");
  };
  await catalog.syncChatLogs("pc");
  for (let i = 0; i < 10; i++) await catalog.syncChatLogs("pc");
  assert.equal(calls, 2);
  assert.equal(f.store.db.prepare("SELECT cursor FROM chat_log_sync").get().cursor, "saved-page");
  f.store.db.prepare("UPDATE threads SET sourceUpdatedAt=2 WHERE id=?").run(f.thread.id);
  catalog.logHistory = async (_thread, before) => {
    assert.equal(before, "saved-page");
    return { messages: [], hasMore: false, nextBefore: null };
  };
  await catalog.syncChatLogs("pc");
  assert.equal(f.store.db.prepare("SELECT complete FROM chat_log_sync").get().complete, 1);
});
