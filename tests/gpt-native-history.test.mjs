import assert from "node:assert/strict";
import test from "node:test";
import { GptHistoryNormalizer, gptHistory } from "../apps/hub/dist/gpt-history.js";
import { NativeHistoryProjection } from "../apps/hub/dist/gpt-native-history.js";

const id = "10000000-0000-4000-8000-000000000001";
const version = (n) => String(n).repeat(64);
const node = (id, parent = null, text = "Duplicate") => ({
  id,
  parent,
  children: [],
  message: {
    id,
    author: { role: "assistant" },
    channel: "final",
    recipient: "all",
    status: "finished_successfully",
    create_time: 1,
    content: { content_type: "text", parts: [text] },
  },
});
const graph = {
  conversation_id: id,
  current_node: "b",
  gizmo_id: null,
  title: "Chat",
  mapping: { a: node("a"), b: node("b", "a") },
};

test("long stories survive full projection and later canonical branch updates", () => {
  const store = new NativeHistoryProjection();
  const mapping = {};
  for (let i = 0; i < 100; i++)
    mapping["n" + i] = node("n" + i, i ? "n" + (i - 1) : null, "Story ".repeat(10000));
  const first = store.accept(id, undefined, {
    kind: "full",
    conversationId: id,
    revision: version(1),
    graph: { ...graph, current_node: "n99", mapping },
  });
  assert.ok(Buffer.byteLength(JSON.stringify(first)) > 4 * 1024 ** 2);
  const next = store.accept(id, store.get(id), {
    kind: "delta",
    conversationId: id,
    base: version(1),
    revision: version(2),
    removed: [],
    graph: {
      ...graph,
      current_node: "latest",
      mapping: { latest: node("latest", "n99", "Fresh answer") },
    },
  });
  assert.equal(next.mapping.latest.message.content.parts[0], "Fresh answer");
  assert.equal(Object.keys(next.mapping).length, 101);
});
test("exact public delta matches canonical edits, shortened branches, late attachments and duplicate text", () => {
  const store = new NativeHistoryProjection(),
    normalizer = new GptHistoryNormalizer();
  const first = store.accept(id, undefined, {
    kind: "full",
    conversationId: id,
    revision: version(1),
    graph,
  });
  const original = normalizer.normalize(first, id);
  assert.deepEqual(
    original.map((m) => m.id),
    ["a", "b"],
  );
  const unchanged = store.accept(id, store.get(id), {
    kind: "unchanged",
    conversationId: id,
    revision: version(1),
  });
  assert.equal(
    normalizer.normalize(unchanged, id),
    original,
    "unchanged graph bypasses normalization",
  );
  const changed = {
    ...graph,
    current_node: "c",
    mapping: { b: node("b", "a", "Older edit"), c: node("c", "b") },
  };
  changed.mapping.c.message.metadata = {
    attachments: [{ id: "file-late", name: "late.png", mime_type: "image/png", size: 8 }],
  };
  const next = store.accept(id, store.get(id), {
    kind: "delta",
    conversationId: id,
    base: version(1),
    revision: version(2),
    graph: changed,
    removed: [],
  });
  const items = normalizer.normalize(next, id);
  assert.equal(items[0], original[0]);
  assert.notEqual(items[1], original[1]);
  assert.equal(items[2].files[0].id, "file-late");
  assert.deepEqual(items, gptHistory({ ...next }, id));
  const shortened = store.accept(id, store.get(id), {
    kind: "delta",
    conversationId: id,
    base: version(2),
    revision: version(3),
    graph: { ...graph, current_node: "a", mapping: {} },
    removed: ["b", "c"],
  });
  assert.deepEqual(
    normalizer.normalize(shortened, id).map((m) => m.id),
    ["a"],
  );
  assert.equal(Object.keys(shortened.mapping).length, 1);
});
test("wrong revision, account-local baseline, missing ancestry and branch cycles cannot merge", () => {
  const store = new NativeHistoryProjection();
  store.accept(id, undefined, { kind: "full", conversationId: id, revision: version(1), graph });
  const delta = {
    kind: "delta",
    conversationId: id,
    base: version(1),
    revision: version(2),
    graph: { ...graph, mapping: {} },
    removed: [],
  };
  assert.throws(
    () => store.accept(id, store.get(id), { ...delta, base: version(9) }),
    /INVALID_HISTORY/,
  );
  assert.throws(
    () => new NativeHistoryProjection().accept(id, undefined, delta),
    /INVALID_HISTORY/,
  );
  assert.throws(
    () => store.accept(id, store.get(id), { ...delta, removed: ["a"] }),
    /INVALID_HISTORY/,
  );
  assert.throws(
    () =>
      store.accept(id, store.get(id), {
        ...delta,
        graph: { ...graph, mapping: { a: node("a", "b") } },
      }),
    /INVALID_HISTORY/,
  );
  assert.equal(store.get(id).revision, version(1));
  store.clear();
  assert.equal(store.get(id), undefined);
});
test("late concurrent projection cannot replace a newer baseline and eviction is bounded", () => {
  const store = new NativeHistoryProjection();
  store.accept(id, undefined, { kind: "full", conversationId: id, revision: version(1), graph });
  const old = store.get(id);
  store.accept(id, old, { kind: "full", conversationId: id, revision: version(2), graph });
  store.accept(id, old, { kind: "full", conversationId: id, revision: version(3), graph });
  assert.equal(store.get(id).revision, version(2));
  for (let i = 2; i <= 10; i++) {
    const next = `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    store.accept(next, undefined, {
      kind: "full",
      conversationId: next,
      revision: version(1),
      graph: { ...graph, conversation_id: next },
    });
  }
  assert.equal(store.get(id), undefined);
});
