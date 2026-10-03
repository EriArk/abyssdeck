import assert from "node:assert/strict";
import test from "node:test";
import {
  appendBookmark,
  findReaderMatches,
  parseBookmarks,
  validLocation,
} from "../apps/web/src/bookReader/navigation.ts";

test("literal reader search preserves UTF-16 anchors, paragraph boundaries and punctuation", () => {
  const hits = findReaderMatches(
    ["🙂 Начало [a+b].", "Следующая  строка", "конец"],
    "[A+b]. следующая строка",
    2,
  );
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].anchor, { block: 0, char: 10 });
  assert.deepEqual(hits[0].end, { block: 1, char: 17 });
  assert.equal(hits[0].chapter, 2);
  assert.equal(findReaderMatches(["а".repeat(900)], "а", 0, 500).length, 500);
  assert.equal(findReaderMatches([], "", 0).length, 0);
  assert.equal(findReaderMatches([".*a"], ".*", 0)[0].end.char, 2);
});
test("bookmarks preserve other books, reject corrupt metadata and never silently evict", () => {
  const a = {
    book: "epub:abc",
    id: "a",
    chapter: 1,
    anchor: { block: 2, char: 10 },
    excerpt: "Текст",
    created: 1,
  };
  const b = { ...a, id: "b", book: "epub:def" };
  assert.deepEqual(parseBookmarks(JSON.stringify([a, b])), [a, b]);
  assert.equal(appendBookmark([a, b], { ...a, id: "new" }).length, 2);
  assert.equal(appendBookmark([a], b).length, 2);
  assert.throws(() => parseBookmarks("{}"));
  assert.throws(() => parseBookmarks(JSON.stringify([{ ...a, anchor: { block: -1, char: 2 } }])));
  assert.throws(() =>
    appendBookmark(
      Array.from({ length: 200 }, (_, i) => ({
        ...a,
        id: String(i),
        anchor: { block: i, char: 0 },
      })),
      a,
    ),
  );
  assert.equal(validLocation(a, 1), false);
});
