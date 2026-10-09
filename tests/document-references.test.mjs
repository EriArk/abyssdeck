import assert from "node:assert/strict";
import { posix, win32 } from "node:path";
import test from "node:test";
import { documentLinks, documentRelativePath } from "../apps/hub/dist/document-references.js";

test("document link parser preserves inline, referenced, encoded and nested image URLs without code/HTML grants", () => {
  assert.deepEqual(
    documentLinks(
      '[a](a.png) ![b][B]\n\n[B]: <with space.png>\n\n`[c](c.png)`\n\n```md\n[d](d.png)\n```\n\n<img src="e.png">',
    ),
    ["a.png", "with space.png"],
  );
  assert.deepEqual(documentLinks("[x][same]\n\n[same]: first.png\n\n[same]: second.png"), [
    "first.png",
  ]);
});
test("document links bind Windows/Linux parent directories and allow siblings inside exact scope", () => {
  assert.equal(
    documentRelativePath(win32, "D:\\Project", "D:\\Project\\docs\\README.md", "../img/a%20b.png"),
    "D:\\Project\\img\\a b.png",
  );
  assert.equal(
    documentRelativePath(posix, "/project", "/project/docs/README.md", "../img.png"),
    "/project/img.png",
  );
  assert.equal(
    documentRelativePath(posix, "/project", "/exports/demo/README.md", "img.png"),
    "/exports/demo/img.png",
  );
  for (const href of [
    "../../outside.png",
    "/etc/passwd",
    "https://x.test/i.png",
    "%2fetc/passwd",
    "bad%00.png",
  ])
    assert.throws(() => documentRelativePath(posix, "/project", "/project/docs/README.md", href));
  assert.throws(() =>
    documentRelativePath(posix, "/project", "/exports/demo/README.md", "../private.png"),
  );
});
