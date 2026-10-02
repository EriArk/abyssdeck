import assert from "node:assert/strict";
import test from "node:test";
import { mergeHistorySnapshot } from "../apps/web/src/historyState.ts";

const thread = {
  id: "thread",
  projectId: "project",
  title: "Chat",
  status: "running",
  activeTurnId: "turn",
};
const message = (id, text, seq) => ({
  id,
  text,
  lastSeq: seq,
  firstSeq: seq,
  turnId: "turn",
  role: "assistant",
  phase: "commentary",
  createdAt: "",
});
const snapshot = {
  messages: [message("reply", "First", 5)],
  thread,
  approvals: [],
  nextBefore: null,
  hasMore: false,
  lastSeq: 5,
};
test("late history snapshot preserves newer streamed replies and completion", () => {
  const state = {
    ...snapshot,
    messages: [message("reply", "First and second", 7), message("next", "New reply", 8)],
    thread: { ...thread, status: "completed", activeTurnId: null },
    lastSeq: 9,
    loading: false,
    loadingOlder: false,
    error: "",
    connection: "connected",
    revision: 1,
  };
  const merged = mergeHistorySnapshot(state, snapshot);
  assert.deepEqual(
    merged.messages.map((m) => m.text),
    ["First and second", "New reply"],
  );
  assert.equal(merged.lastSeq, 9);
  assert.equal(merged.thread.status, "completed");
});
test("fresh device receives complete snapshot without inheriting another conversation", () => {
  const state = {
    ...snapshot,
    messages: [],
    lastSeq: 0,
    loading: true,
    loadingOlder: false,
    error: "",
    connection: "connecting",
    revision: 0,
  };
  assert.deepEqual(mergeHistorySnapshot(state, snapshot).messages, snapshot.messages);
});

test("acknowledged send survives a lagging history until its exact turn and files appear", () => {
  const pending = {
    ...message("sending:receipt", "Again", 0),
    role: "user",
    turnId: "new-turn",
    sendState: "accepted",
    attachments: [{ id: "photo" }],
  };
  const state = { ...snapshot, messages: [pending], revision: 0 };
  const old = { ...pending, id: "old-user", turnId: "old-turn", sendState: undefined };
  const lagging = { ...snapshot, lastSeq: 20, messages: [old] };
  assert.deepEqual(
    mergeHistorySnapshot(state, lagging).messages.map((m) => m.id),
    ["old-user", pending.id],
  );
  const native = { ...old, id: "native-user", turnId: pending.turnId };
  assert.deepEqual(mergeHistorySnapshot(state, { ...lagging, messages: [native] }).messages, [
    native,
  ]);
  // A different attachment in the same turn is not this submission.
  assert.equal(
    mergeHistorySnapshot(state, {
      ...lagging,
      messages: [{ ...native, attachments: [{ id: "other" }] }],
    }).messages.length,
    2,
  );
});

test("turn outcomes survive late history and older-page merges without replacing newer completion", () => {
  const state = {
    ...snapshot,
    revision: 0,
    turnOutcomes: {
      current: { status: "failed", error: "capacity", seq: 15 },
      old: { status: "failed", error: "older failure", seq: 3 },
    },
  };
  const merged = mergeHistorySnapshot(state, {
    ...snapshot,
    turnOutcomes: {
      current: { status: "completed", seq: 10 },
      older: { status: "interrupted", seq: 1 },
    },
  });
  assert.equal(merged.turnOutcomes.current.status, "failed");
  assert.equal(merged.turnOutcomes.old.error, "older failure");
  assert.equal(merged.turnOutcomes.older.status, "interrupted");
});
