import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { GptService } from "../apps/hub/dist/gpt.js";
import { extendPublicOutput } from "../apps/hub/dist/gpt-live-output.js";

test("public live growth needs an exact attributed assistant prefix and preserves metadata", () => {
  const m = {
    id: "answer",
    role: "assistant",
    channel: "final",
    text: "Hello",
    complete: false,
    richReferences: [{ id: "source" }],
  };
  const [grown] = extendPublicOutput([m], [{ id: "answer", text: "Hello world" }]);
  assert.deepEqual(grown, { ...m, text: "Hello world" });
  assert.equal(m.text, "Hello");
  for (const input of [
    [{ id: "other", text: "Hello world" }],
    [{ id: "answer", text: "Different branch" }],
    [{ id: "answer", text: "Hell" }],
    [{ id: "answer", text: "Hello world", activity: "search" }],
    [
      { id: "answer", text: "Hello world" },
      { id: "answer", text: "Hello duplicate" },
    ],
  ])
    assert.equal(extendPublicOutput([m], input)[0], m);
  for (const blocked of [
    { ...m, complete: true },
    { ...m, role: "user" },
    { ...m, text: "" },
  ])
    assert.equal(
      extendPublicOutput([blocked], [{ id: "answer", text: "Hello world" }])[0],
      blocked,
    );
  assert.deepEqual(extendPublicOutput([], [{ id: "unattributed", text: "answer" }]), []);
});

test("recent idle chats retain local live output without reviving expired background watches", async (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(
    "CREATE TABLE gpt_jobs(id TEXT,nativeId TEXT,status TEXT,createdAt INTEGER); CREATE TABLE gpt_native_receipts(jobId TEXT,payload TEXT); CREATE TABLE gpt_native_idle_watch(jobId TEXT,changedAt INTEGER,openedAt INTEGER)",
  );
  const now = Date.now();
  db.prepare("INSERT INTO gpt_jobs VALUES('job','chat','idle',?)").run(now - 600000);
  db.prepare("INSERT INTO gpt_native_receipts VALUES('job',?)").run(
    JSON.stringify({ conversationId: "chat" }),
  );
  db.prepare("INSERT INTO gpt_native_idle_watch VALUES('job',?,0)").run(now);
  let reads = 0,
    saves = 0;
  const service = Object.assign(Object.create(GptService.prototype), {
    authorize() {},
    store: { db },
    native: {
      workspace: {
        client: {
          liveDispatch: async (id, chat) => {
            assert.equal(id, "job");
            assert.equal(chat, "chat");
            reads++;
            return { items: [{ id: "answer", text: "Public answer" }] };
          },
        },
      },
    },
    nativeJobs: {
      saveLiveOutput() {
        saves++;
      },
    },
  });
  assert.equal((await service.liveProgress("chat")).items[0].text, "Public answer");
  assert.equal(reads, 1);
  assert.equal(saves, 1);
  db.prepare("UPDATE gpt_native_idle_watch SET changedAt=?").run(now - 600000);
  assert.equal(await service.liveProgress("chat"), null);
  assert.equal(reads, 1, "idle output reads cannot extend their own watch");
  db.prepare("UPDATE gpt_native_idle_watch SET openedAt=?").run(now);
  service.liveRead = undefined;
  assert.equal((await service.liveProgress("chat")).jobId, "job");
  assert.equal(await service.liveProgress("other"), null);
  assert.equal(reads, 2);
});
