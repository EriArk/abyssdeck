import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { GptAttention } from "../apps/hub/dist/gpt-attention.js";
import { GptHistoryWatch } from "../apps/hub/dist/gpt-history-watch.js";
import { GptOperations } from "../apps/hub/dist/gpt-operations.js";
import { Store } from "../apps/hub/dist/store.js";
import { NativeOperationReceipts } from "../ops/gpt-native/operation-receipts.mjs";

const graph = (current) => ({
  current_node: current,
  mapping: {
    u: {
      id: "u",
      parent: null,
      message: {
        id: "u",
        author: { role: "user" },
        content: { content_type: "text", parts: ["Before"] },
      },
    },
    a: {
      id: "a",
      parent: "u",
      message: {
        id: "a",
        author: { role: "assistant" },
        channel: "final",
        status: "finished_successfully",
        content: { content_type: "text", parts: ["Answer"] },
      },
    },
  },
});
test("native preflight refusals unlock Hub editing and remain rejected after a lost acknowledgement", async () => {
  for (const reason of ["branch", "draft", "lost-ack"]) {
    const hub = new Store(":memory:"),
      native = new Store(":memory:"),
      controller = new AbortController();
    let writes = 0,
      preparation = 0,
      captured;
    const ledger = new NativeOperationReceipts({
      db: native.db,
      assertDispatch: async () => {
        preparation++;
      },
    });
    const reader = {
      readConversationGraph: async () => graph(reason === "branch" ? "u" : "a"),
      selectConversation: async () => {},
      inspectConversation: async () => ({
        composerReady: true,
        hasDraft: true,
        stopAvailable: false,
      }),
      mutateOperation: async () => {
        writes++;
        return { dispatched: true };
      },
    };
    const service = new GptOperations(
      hub,
      async (path, input) => {
        if (path.startsWith("/conversation?")) return graph("a");
        if (path === "/native-operation") {
          captured = input;
          const result = await ledger.run(input, reader);
          if (reason === "lost-ack") throw Error("transport lost");
          return result;
        }
        if (path === "/native-operation/check") return ledger.run(input, reader, true);
        throw Error("unexpected path");
      },
      () => true,
      () => {},
      controller.signal,
      true,
    );
    const key = randomUUID(),
      input = {
        nativeId: randomUUID(),
        messageId: "u",
        currentNode: "a",
        action: "edit",
        text: "After",
        model: "latest",
        effort: "1",
      };
    try {
      service.start(key, input);
      await service.close();
      if (reason === "lost-ack") {
        assert.equal(service.get(key).state, "unknown");
        await service.confirm(key);
      }
      assert.equal(service.get(key).state, "failed");
      assert.equal(service.blocked(input.nativeId), false);
      assert.equal(writes, 0);
      assert.equal(preparation, 1);
      assert.equal((await ledger.run(captured, reader, true)).state, "rejected");
      assert.equal((await ledger.run(captured, reader)).dispatched, false);
      assert.equal(preparation, 1, "a repeated key never repeats preparation");
      service.start(randomUUID(), input);
      await service.close();
      assert.equal(preparation, 2, "a new explicit action is allowed");
    } finally {
      controller.abort();
      await service.close();
      hub.close();
      native.close();
    }
  }
});
test("the same error after native admission remains uncertain and cannot replay", async () => {
  const s = new Store(":memory:");
  let writes = 0;
  const ledger = new NativeOperationReceipts({ db: s.db, assertDispatch: async () => {} });
  const r = {
    key: randomUUID(),
    conversationId: randomUUID(),
    action: "edit",
    text: "After",
    messageId: "u",
    currentNode: "a",
    model: "latest",
    effort: "1",
  };
  const reader = {
    readConversationGraph: async () => graph("a"),
    selectConversation: async () => {},
    inspectConversation: async () => ({ composerReady: true }),
    selectSettings: async () => {},
    readModels: async () => ({
      versions: [
        { id: "latest", enabled: true, presets: [{ id: 1, available: true, model: "model" }] },
      ],
    }),
    mutateOperation: async () => {
      writes++;
      throw Error("NATIVE_NOT_READY");
    },
  };
  try {
    assert.equal((await ledger.run(r, reader)).state, "unknown");
    assert.equal((await ledger.run(r, reader)).state, "unknown");
    assert.equal(writes, 1);
  } finally {
    s.close();
  }
});
test("unchanged history slows down across restart; opening, progress and late completion stay live", () => {
  let now = 10 * 86400000;
  const s = new Store(":memory:"),
    clock = () => now;
  const attention = new GptAttention(s, clock),
    watch = new GptHistoryWatch(clock);
  const user = { id: "u", role: "user", text: "Old prompt", createdAt: 1, files: [] };
  try {
    let state = attention.observe("chat", [user]);
    watch.observe("chat", state.pending, state.changedAt);
    now += 30000;
    assert.deepEqual(watch.due(), []);
    now += 870000;
    assert.deepEqual(watch.due(), ["chat"]);
    state = attention.observe("chat", [user]);
    watch.observe("chat", state.pending, state.changedAt);
    const restored = new GptHistoryWatch(clock);
    for (const row of new GptAttention(s, clock).pendingWatches())
      restored.observe(row.id, true, row.changedAt);
    now += 30000;
    assert.deepEqual(restored.due(), []);
    restored.active("chat");
    assert.deepEqual(restored.due(), ["chat"]);
    const progress = {
      ...user,
      id: "p",
      role: "assistant",
      phase: "commentary",
      text: "New activity",
      createdAt: now / 1000,
      complete: false,
    };
    state = attention.observe("chat", [user, progress]);
    restored.observe("chat", state.pending, state.changedAt);
    now += 30000;
    assert.deepEqual(restored.due(), ["chat"]);
    const final = { ...progress, id: "f", phase: "final", complete: true };
    state = attention.observe("chat", [user, progress, final]);
    restored.observe("chat", state.pending, state.changedAt);
    now += 900000;
    assert.deepEqual(restored.due(), []);
    assert.equal(attention.list()[0].completedId, "f");
  } finally {
    s.close();
  }
});
test("watch fairness and two-read budget are retained without a browser", () => {
  let now = 100000;
  const watch = new GptHistoryWatch(() => now);
  for (let i = 0; i < 4; i++) watch.observe(String(i), true, now);
  now += 30000;
  assert.deepEqual(watch.due(), ["0", "1"]);
  assert.deepEqual(watch.due(), ["2", "3"]);
  assert.deepEqual(watch.due(), []);
  now += 30000;
  assert.deepEqual(watch.due(), ["0", "1"]);
});
