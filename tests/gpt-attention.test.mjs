import assert from "node:assert/strict";
import test from "node:test";
import { GptAttention } from "../apps/hub/dist/gpt-attention.js";
import { Store } from "../apps/hub/dist/store.js";

test("completion markers survive reopening and late read acknowledgements cannot read a newer answer", () => {
  const store = new Store(":memory:"),
    attention = new GptAttention(store);
  const answer = (id) => ({
    id,
    role: "assistant",
    phase: "final",
    complete: true,
    text: "answer",
    files: [],
    createdAt: 1,
  });
  try {
    attention.observe("a", [answer("old")]);
    assert.deepEqual(attention.list(), []);
    attention.observe("a", [answer("new")]);
    assert.deepEqual(new GptAttention(store).list(), [{ conversationId: "a", completedId: "new" }]);
    attention.seen("a", "old");
    assert.equal(attention.list().length, 1);
    attention.observe("a", [
      answer("new"),
      { ...answer("step"), phase: "commentary", complete: false },
    ]);
    assert.equal(attention.list()[0].completedId, "new");
    attention.seen("a", "new");
    assert.deepEqual(attention.list(), []);
    attention.observe("a", [answer("third")]);
    attention.seen("b", "third");
    assert.equal(attention.list().length, 1);
  } finally {
    store.close();
  }
});

test("native response idle requires the exact finished stream plus healthy inactive native state", async () => {
  const { nativeResponseIdle } = await import("../apps/hub/dist/gpt-response-state.js");
  const client = {
    liveDispatch: async (k, id) => {
      assert.equal(k, "receipt");
      assert.equal(id, "chat");
      return { finished: true };
    },
    workspace: async () => ({ ready: true, generating: false }),
  };
  assert.equal(await nativeResponseIdle(client, "receipt", "chat"), true);
  assert.equal(
    await nativeResponseIdle(
      { ...client, workspace: async () => ({ ready: true, generating: true }) },
      "receipt",
      "chat",
    ),
    false,
  );
  assert.equal(
    await nativeResponseIdle(
      { ...client, liveDispatch: async () => ({ items: [] }) },
      "receipt",
      "chat",
    ),
    false,
  );
  assert.equal(
    await nativeResponseIdle(
      {
        ...client,
        workspace: async () => {
          throw Error("offline");
        },
      },
      "receipt",
      "chat",
    ),
    false,
  );
});
