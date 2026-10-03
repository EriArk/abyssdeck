import assert from "node:assert/strict";
import test from "node:test";
import { codexTimeline, unlinkedTurnWork } from "../apps/hub/dist/codex-results.js";
import { Store } from "../apps/hub/dist/store.js";

test("request pagination is exact across threads, legacy turns and repeated native turn ids", () => {
  const store = new Store(":memory:");
  try {
    const a = store.createThread("p", "a", "A"),
      b = store.createThread("other", "b", "Private");
    for (let n = 0; n < 45; n++) {
      store.append(a.id, "user.message", { id: `u${n}`, text: `Request ${n}` }, `t${n}`);
      store.result(a.id, `t${n}`, `c${n}`, "check", "Check", { command: "test", exitCode: 0 });
    }
    store.append(b.id, "user.message", { id: "private", text: "Private request" }, "t0");
    for (let n = 0; n < 25; n++) store.result(a.id, `old${n}`, `old${n}`, "check", "Old", {});
    store.result(a.id, "old0", "request:native-user", "reasoning-request", "Request", {
      text: "Imported user request",
    });
    let before;
    const all = [];
    do {
      const page = store.projectResults("p", before, "reasoning");
      assert.equal(page.counts.reasoning, 70);
      all.push(...page.items);
      before = page.nextBefore;
      if (before !== null) assert(before > 0);
    } while (before !== null);
    assert.equal(all.length, 70);
    assert.equal(new Set(all.map((r) => r.id)).size, 70);
    assert(!JSON.stringify(all).includes("Private request"));
    assert(all.some((r) => r.title === "Imported user request"));
    assert.equal(store.results(a.id, undefined, "work").counts.work, 70);
  } finally {
    store.close();
  }
});

test("timeline interleaves public snapshots, exact commands, steers and diffs beyond eight events", () => {
  const store = new Store(":memory:");
  try {
    const a = store.createThread("p", "a", "A"),
      b = store.createThread("p", "b", "B");
    store.append(a.id, "user.message", { id: "u", text: "Request" }, "t");
    store.append(a.id, "turn.progress", { itemId: "s", label: "Thinking" }, "t");
    store.append(a.id, "activity.summary", { itemId: "s", text: "Public summary" }, "t");
    store.append(
      a.id,
      "turn.progress",
      { itemId: "cmd", command: "pnpm test", label: "Command" },
      "t",
    );
    store.append(a.id, "activity.summary", { itemId: "s", text: "Complete public summary" }, "t");
    store.append(
      a.id,
      "activity.command",
      { itemId: "cmd", command: "pnpm test", exitCode: 0, output: "Exact output" },
      "t",
    );
    const check = store.result(a.id, "t", "cmd", "check", "Check", {
      command: "pnpm test",
      exitCode: 0,
    });
    store.append(a.id, "result.created", { id: check, type: "check" }, "t");
    store.append(a.id, "user.message", { id: "steer", text: "Also fix this" }, "t");
    const diff = store.result(a.id, "t", "diff", "diff-summary", "Changes", {
      changes: [{ path: "x", kind: "update", diff: "-old\n+new" }],
    });
    store.append(a.id, "result.created", { id: diff, type: "diff-summary" }, "t");
    for (let n = 0; n < 65; n++)
      store.append(a.id, "activity.summary", { itemId: `s${n}`, text: `Step ${n}` }, "t");
    store.append(b.id, "activity.summary", { itemId: "s", text: "PRIVATE" }, "t");
    const first = codexTimeline(store.db, a.id, "t"),
      second = codexTimeline(store.db, a.id, "t", first.nextAfter);
    const items = [...first.items, ...second.items];
    assert.equal(items.length, 70);
    assert.equal(items[1].text, "Complete public summary");
    assert.equal(items[2].result.id, check);
    assert.equal(items[3].text, "Also fix this");
    assert.equal(items[4].result.payload.changes[0].diff, "-old\n+new");
    assert.equal(second.nextAfter, null);
    assert(!JSON.stringify(items).includes("PRIVATE"));
    assert.deepEqual(unlinkedTurnWork(store.db, a.id, "t").items, []);
    store.result(a.id, "t", "legacy", "check", "Legacy", { command: "old-test" });
    assert.equal(unlinkedTurnWork(store.db, a.id, "t").items[0].title, "Legacy");
    assert.equal(codexTimeline(store.db, b.id, "missing").items.length, 0);
  } finally {
    store.close();
  }
});
