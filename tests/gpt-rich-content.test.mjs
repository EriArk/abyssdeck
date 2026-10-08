import assert from "node:assert/strict";
import test from "node:test";
import remarkParse from "../apps/web/node_modules/remark-parse/index.js";
import { unified } from "../apps/web/node_modules/unified/index.js";
import { gptLiveResults, mergeResultItems } from "../apps/web/src/gptLiveResults.ts";
import { remarkGptLayout } from "../apps/web/src/gptRichMarkdown.ts";

const parse = (value) => {
  const tree = unified().use(remarkParse).parse(value);
  remarkGptLayout()(tree, { value });
  return tree;
};
const flatten = (node) => [node, ...(node.children ?? []).flatMap(flatten)];
const rich = (tree) => flatten(tree).filter((n) => n.type === "gptLayout");
test("inline native references support braced citation arrays without executing them", () => {
  const tree = parse(
    'Read <Entity value="Example"/>. <Cite refs={["source1","source2"]}/> <Link url="https://example.com" title="Details"/>',
  );
  assert.equal(flatten(tree).filter((n) => n.type === "gptReference").length, 3);
  assert.equal(
    flatten(parse('`<Cite refs={["source1"]}/>`')).filter((n) => n.type === "gptReference").length,
    0,
  );
});
test("native layout preserves nested Markdown and exact source offsets for code", () => {
  const input =
    'Intro\n\n<box gap={3}>\n<row align="start"><icon name="gamepad-2"/><box flex={1}>\n    **Arcade**\n\n    Games and friends.\n</box></row>\n<divider/>\n<text size="sm">More</text>\n\n```js\nconst answer = 42;\n```\n</box>\n\nAfter';
  const tree = parse(input);
  assert.equal(rich(tree).length, 6);
  assert.ok(flatten(tree).some((n) => n.type === "strong"));
  const code = flatten(tree).find((n) => n.type === "code");
  assert.equal(
    input.slice(code.position.start.offset, code.position.end.offset),
    "```js\nconst answer = 42;\n```",
  );
  assert.equal(flatten(tree).filter((n) => n.type === "code").length, 1);
  assert.ok(flatten(tree).some((n) => n.value === "After"));
});
test("literal code, malformed and unknown markup are never executed or discarded", () => {
  for (const input of [
    "```html\n<box><text>literal</text></box>\n```",
    "`<box>literal</box>`",
    "Use <box>inline example</box>.",
    '<box><iframe src="x">Keep me</iframe></box>',
    "<box><row>partial",
    "<box><row>bad</box>",
  ]) {
    assert.equal(rich(parse(input)).length, 0, input);
  }
  const input = '<box onClick="alert(1)" style="position:fixed"><text>Safe</text></box>';
  assert.equal(rich(parse(input)).length, 2);
  assert.ok(flatten(parse(input)).some((n) => n.value === "Safe"));
});
test("code examples inside a layout stay code, and successive layout blocks retain prose", () => {
  const input =
    "<box>\n`<row>inline</row>`\n\n```xml\n<box>literal</box>\n```\n</box>\n\nBetween\n\n<row><text>Last</text></row>";
  const tree = parse(input);
  assert.equal(rich(tree).length, 3);
  assert.ok(flatten(tree).some((n) => n.type === "inlineCode" && n.value === "<row>inline</row>"));
  assert.ok(flatten(tree).some((n) => n.type === "code" && n.value === "<box>literal</box>"));
  assert.ok(flatten(tree).some((n) => n.value === "Between"));
});
test("confirmed request appears before history or response, and canonical identity replaces it", () => {
  const job = {
    id: "job",
    nativeId: "chat",
    userMessageId: "user",
    text: "Request",
    status: "running",
    deliveryConfirmed: true,
    createdAt: 1000,
    progress: [],
  };
  const results = gptLiveResults("chat", [], [job]);
  assert.equal(results[0].id, "reasoning-user");
  assert.deepEqual(results[0].payload, { text: "Request", steps: [] });
  for (const wrong of [
    { ...job, deliveryConfirmed: false },
    { ...job, nativeId: "other" },
    { ...job, dismissed: true },
    { ...job, userMessageId: undefined },
  ])
    assert.equal(gptLiveResults("chat", [], [wrong]).length, 0);
  const history = [
    { id: "user", role: "user", text: "Request", createdAt: 1 },
    { id: "a", role: "assistant", text: "**Working**", createdAt: 2, complete: false },
  ];
  const canonical = gptLiveResults("chat", history, [job]);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].payload.steps[0].state, "active");
  assert.equal(
    gptLiveResults("chat", [{ ...history[0], id: "other-user", createdAt: 3 }], [job]).length,
    1,
  );
  assert.equal(gptLiveResults("chat", [{ ...history[0], id: "external" }], []).length, 1);
});

test("live summaries survive an older Results card, settle canonically and stay on their request", () => {
  const user = { id: "request", role: "user", text: "Question", createdAt: 1, files: [] };
  const job = {
    id: "job",
    nativeId: "chat",
    userMessageId: "request",
    text: "Question",
    createdAt: 1000,
    deliveryConfirmed: true,
    progress: [],
  };
  const live = {
    jobId: "job",
    items: [{ id: "summary", text: "Reviewing the repository", state: "active" }],
  };
  const old = gptLiveResults("chat", [user], [job]);
  const current = gptLiveResults("chat", [user], [job], live);
  assert.equal(mergeResultItems([...current, ...old])[0].payload.steps[0].text, live.items[0].text);
  assert.equal(
    gptLiveResults("chat", [user], [job], { ...live, jobId: "other" })[0].payload.steps.length,
    0,
  );
  const final = {
    id: "summary",
    role: "assistant",
    text: "Final text",
    createdAt: 2,
    complete: true,
    phase: "final",
    files: [],
  };
  assert.equal(
    gptLiveResults("chat", [user, final], [job], live)[0].payload.steps[0].text,
    "Final text",
  );
  assert.equal(gptLiveResults("other", [], [job], live).length, 0);
});

test("memory citation is a display marker while quoted code remains literal", () => {
  const value = "Text <MemoryCite /> and `<MemoryCite />`";
  const nodes = flatten(parse(value));
  assert.equal(nodes.filter((n) => n.type === "gptReference").length, 1);
  assert.equal(nodes.find((n) => n.type === "inlineCode").value, "<MemoryCite />");
});
