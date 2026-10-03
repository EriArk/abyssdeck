import assert from "node:assert/strict";
import test from "node:test";
import { formatJson, markdownChange } from "../apps/web/src/textFormatOperations.ts";
import { animatedRaster, imageSize, imageTransform } from "../apps/web/src/imageAnnotations.ts";
test("JSON formatting preserves exact values, duplicate keys and escaped strings", () => {
  const input =
    '{"id":900719925474099312345,"x":-0,"x":1e+300,"s":"a  b\\n\\\"z","empty":[],"o":{}}';
  const out = formatJson(input);
  assert.match(out, /900719925474099312345/);
  assert.match(out, /-0/);
  assert.match(out, /1e\+300/);
  assert.deepEqual(out.match(/"(?:[^"\\]|\\.)*"|[^\s]/g), input.match(/"(?:[^"\\]|\\.)*"|[^\s]/g));
  assert.throws(() => formatJson('{"x":}'));
});
test("JSONL is independently validated and retains blank lines", () => {
  assert.equal(formatJson(' { "a": 1 }\n\n{"b":2}\n', true), '{"a":1}\n\n{"b":2}\n');
  assert.throws(() => formatJson('{"a":1}\ninvalid', true), /2/);
});
test("Markdown actions bind UTF16 selection and whole selected lines", () => {
  assert.deepEqual(markdownChange("🙂 word end", 3, 7, "bold"), {
    from: 3,
    to: 7,
    insert: "**word**",
    anchor: 5,
    head: 9,
  });
  assert.equal(markdownChange("one\ntwo\nthree", 0, 8, "task").insert, "- [ ] one\n- [ ] two");
  assert.equal(markdownChange("", 0, 0, "heading").insert, "## ");
  assert.equal(markdownChange("```", 0, 3, "code").insert, "````\n```\n````\n");
});
test("image transforms preserve original-coordinate crop and explicit animation detection", () => {
  const edits = { marks: [], crop: { x: 20, y: 30, width: 60, height: 40 }, rotation: 90 };
  assert.deepEqual(imageSize(edits), { width: 40, height: 60 });
  assert.equal(imageTransform(edits), "translate(40 0) rotate(90) translate(-20 -30)");
  assert.equal(animatedRaster(Buffer.from("GIF89a")), true);
  assert.equal(animatedRaster(Buffer.from("not an animation")), false);
  const png = Buffer.alloc(20);
  png.write("PNG", 1);
  png.writeUInt32BE(0, 8);
  png.write("acTL", 12);
  assert.equal(animatedRaster(png), true);
});
