import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { GptDeletions } from "../apps/hub/dist/gpt-deletions.js";
import { Library } from "../apps/hub/dist/library.js";
import { Store } from "../apps/hub/dist/store.js";

function fixture(t) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const library = new Library(store, "gpt");
  let now = 100000;
  const calls = [],
    ids = [randomUUID(), randomUUID(), randomUUID()];
  const client = {
    libraryMutation: async (r, checkOnly) => {
      calls.push({ ...r, checkOnly });
      return { state: "unknown" };
    },
  };
  const open = () => new GptDeletions(store, library, { client }, () => now);
  let queue = open();
  for (const id of ids) queue.enqueue(randomUUID(), id);
  return {
    store,
    library,
    client,
    ids,
    calls,
    advance: (ms) => {
      now += ms;
    },
    restart: () => {
      queue = open();
    },
    tick: (canRun = () => true) =>
      queue.tick(
        () => {},
        () => true,
        canRun,
      ),
    enqueue: (id) => queue.enqueue(randomUUID(), id),
  };
}

test("delete queue hides every chat immediately but retains its head until confirmed, across restart", async (t) => {
  const f = fixture(t);
  for (const id of f.ids) assert.equal(f.library.get("thread", id).deleted, true);
  await f.tick();
  f.advance(30000);
  f.restart();
  f.enqueue(randomUUID());
  await f.tick();
  assert.equal(f.calls.length, 1, "a new deletion cannot bypass cooldown");
  f.advance(30000);
  await f.tick();
  assert.deepEqual(
    f.calls.map((x) => [x.id, x.checkOnly]),
    [
      [f.ids[0], false],
      [f.ids[0], true],
    ],
  );
  const receipt = f.calls[0].key;
  assert.equal(f.calls[1].key, receipt);
  f.client.libraryMutation = async (r, checkOnly) => {
    f.calls.push({ ...r, checkOnly });
    return { state: "completed" };
  };
  f.advance(120000);
  await f.tick();
  assert.equal(f.calls.at(-1).id, f.ids[0]);
  f.advance(30000);
  await f.tick();
  assert.equal(f.calls.at(-1).id, f.ids[1]);
  assert.equal(f.calls.at(-1).checkOnly, false);
});

test("native pending admission switches to spaced absence checks until state changes", async (t) => {
  const f = fixture(t);
  f.client.libraryMutation = async (r, checkOnly) => {
    f.calls.push({ ...r, checkOnly });
    throw Error(checkOnly ? "NATIVE_RECEIPT_MISSING" : "NATIVE_PENDING_DISPATCH");
  };
  await f.tick();
  f.advance(86400000);
  f.restart();
  for (let n = 0; n < 10; n++) await f.tick();
  assert.equal(f.calls.length, 2);
  assert.equal(
    f.calls[1].checkOnly,
    true,
    "external deletion remains discoverable without a write attempt",
  );
  f.enqueue(f.ids[0]);
  f.advance(120000);
  await f.tick();
  assert.equal(f.calls.length, 3, "an explicit new owner request can recheck admission");
  assert.equal(f.calls[2].checkOnly, false);
});

test("blocked work permits only absence confirmation and never starts another chat", async (t) => {
  const f = fixture(t);
  await f.tick(() => false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].id, f.ids[0]);
  assert.equal(f.calls[0].checkOnly, true);
  assert.equal(
    f.store.db.prepare("SELECT done FROM gpt_deletions WHERE id=?").get(f.ids[0]).done,
    0,
  );
});

test("upstream Retry-After controls the entire deletion queue without extending it", async (t) => {
  for (const delay of [7000, 600000]) {
    const f = fixture(t);
    f.client.libraryMutation = async (r) => {
      f.calls.push(r);
      throw Object.assign(Error("NATIVE_RATE_LIMITED"), { retryAt: 100000 + delay });
    };
    await f.tick();
    assert.equal(
      f.store.db.prepare("SELECT nextAt FROM gpt_deletion_schedule").get().nextAt,
      100000 + delay,
    );
    f.advance(delay - 1);
    f.restart();
    await f.tick();
    assert.equal(f.calls.length, 1);
    f.advance(1);
    await f.tick();
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].id, f.ids[0]);
  }
});
