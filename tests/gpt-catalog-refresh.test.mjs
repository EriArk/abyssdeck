import assert from "node:assert/strict";
import test from "node:test";
import { readGptNavigation } from "../apps/web/src/gptCatalog.ts";

const row = (id, extras = {}) => ({ id, title: id, updatedAt: 1, pinned: false, ...extras });
const projects = async () => ({ items: [], conversations: [] });

test("a catalog snapshot replaces removed rows, including former supplemental pins", async () => {
  const old = await readGptNavigation(
    async () => ({
      items: [row("recent"), row("removed"), row("old-pin")],
      nextOffset: null,
      pinnedIds: ["old-pin"],
    }),
    projects,
  );
  const fresh = await readGptNavigation(
    async () => ({
      items: [row("recent"), row("native-pin")],
      nextOffset: null,
      pinnedIds: ["native-pin"],
      // Remembered library metadata is not catalog membership.
      library: [{ kind: "thread", id: "removed", name: "removed", archived: false }],
    }),
    projects,
  );
  assert.equal(old.items.length, 3);
  assert.deepEqual(
    fresh.items.map((r) => r.id),
    ["recent", "native-pin"],
  );
  assert.equal(fresh.items[1].pinnedOrder, 0);
});

test("loaded pages are rebased after native deletions; next page does not skip a shifted row", async () => {
  const calls = [];
  const fresh = await readGptNavigation(
    async (offset) => {
      calls.push(offset);
      return offset === 0
        ? {
            items: [row("new"), row("was-on-page-two"), row("pin")],
            nextOffset: 2,
            pinnedIds: ["pin"],
          }
        : { items: [row("older"), row("shifted")], nextOffset: 4 };
    },
    projects,
    2,
  );
  assert.deepEqual(calls, [0, 2]);
  assert.deepEqual(
    fresh.items.map((r) => r.id),
    ["new", "was-on-page-two", "pin", "older", "shifted"],
  );
  assert.equal(fresh.nextOffset, 4);
  assert.equal(fresh.lastOffset, 2);
});

test("a partial read failure publishes no replacement; invalid paging is bounded", async () => {
  let visible = [row("cached")];
  await assert.rejects(async () => {
    const fresh = await readGptNavigation(
      async (offset) => {
        if (offset) throw Error("offline");
        return { items: [row("fresh")], nextOffset: 2 };
      },
      projects,
      2,
    );
    visible = fresh.items;
  }, /offline/);
  assert.deepEqual(
    visible.map((r) => r.id),
    ["cached"],
  );
  await assert.rejects(
    readGptNavigation(async () => ({ items: [], nextOffset: 2 }), projects, 4),
    /cursor/,
  );
});

test("native project moves, main pins and pending deletion retain their own meaning", async () => {
  const fresh = await readGptNavigation(
    async () => ({
      items: [row("moved"), row("pending-delete"), row("project-pin", { projectId: "p" })],
      nextOffset: null,
      pinnedIds: ["project-pin"],
      library: [{ kind: "thread", id: "pending-delete", name: "pending-delete", deleted: true }],
    }),
    async () => ({
      items: [{ id: "p", name: "Project" }],
      conversations: [
        row("moved", { projectId: "p" }),
        row("removed-project-child", { projectId: "gone" }),
      ],
    }),
  );
  assert.equal(fresh.items.find((r) => r.id === "moved").projectId, "p");
  assert.equal(fresh.items.find((r) => r.id === "project-pin").pinned, true);
  assert.equal(fresh.items.find((r) => r.id === "pending-delete").deleted, true);
  assert.equal(
    fresh.items.some((r) => r.id === "removed-project-child"),
    false,
  );
});
