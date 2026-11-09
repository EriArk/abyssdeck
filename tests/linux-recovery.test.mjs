import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { saveChatLog } from "../apps/hub/dist/chat-log.js";
import { handoffFixture, settings } from "./handoff-fixture.mjs";

test("machine recovery changes only scoped paths and preserves operation identities", () => {
  execFileSync("python3", ["tests/machine-recovery.py"], { stdio: "pipe" });
});
test("lost native profile retains paginated public history without native reads or replay", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  f.store.db.prepare("UPDATE threads SET historyMode='saved' WHERE id=?").run(f.thread.id);
  const messages = Array.from({ length: 205 }, (_, n) => ({
    id: "saved-" + n,
    threadId: f.thread.id,
    role: n % 2 ? "assistant" : "user",
    text: "retained " + n,
    firstSeq: n - 205,
    lastSeq: n - 205,
    turnId: "turn-" + n,
  }));
  saveChatLog(f.store, messages, 1000000);
  const thread = f.store.thread(f.thread.id),
    count = f.calls.length;
  const latest = await f.sessions.catalog.history(thread);
  assert.equal(latest.messages.length, 100);
  assert.equal(latest.messages.at(-1).id, "saved-204");
  const previous = await f.sessions.catalog.history(thread, latest.nextBefore);
  assert.equal(previous.messages.at(-1).id, "saved-104");
  assert.equal(new Set([...latest.messages, ...previous.messages].map((m) => m.id)).size, 200);
  const context = await f.sessions.catalog.messageContext(thread, "saved-2");
  assert(context.messages.some((m) => m.id === "saved-2"));
  await f.sessions.catalog.readThread(thread);
  assert.equal(f.calls.length, count);
  const reply = await f.send(randomUUID(), { text: "must not replay", settings });
  assert.equal(reply.statusCode, 409);
  assert.equal(reply.json().error.code, "NATIVE_HISTORY_UNAVAILABLE");
  assert.equal(
    f.calls.filter((c) => ["thread/resume", "thread/start", "turn/start"].includes(c.method))
      .length,
    0,
  );
});
