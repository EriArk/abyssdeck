import assert from "node:assert/strict";
import test from "node:test";
import remarkParse from "../apps/web/node_modules/remark-parse/index.js";
import { unified } from "../apps/web/node_modules/unified/index.js";
import { gptLiveResults, mergeResultItems } from "../apps/web/src/gptLiveResults.ts";
import { remarkGptLayout } from "../apps/web/src/gptRichMarkdown.ts";
import { layoutBodySample } from "../apps/web/tests/fixtures/gpt-layout-body.ts";
import { layoutData } from "../apps/web/src/gptLayoutData.ts";

const parse = (value) => {
  const tree = unified().use(remarkParse).parse(value);
  remarkGptLayout()(tree, { value });
  return tree;
};
const flatten = (node) => [node, ...(node.children ?? []).flatMap(flatten)];
const rich = (tree) => flatten(tree).filter((n) => n.type === "gptLayout");

test("complete body declaration diagram expands three games and fifteen conditional tabs", () => {
  const tree = parse(layoutBodySample),
    nodes = rich(tree);
  const of = (tag) => nodes.filter((n) => n.data.hProperties.dataGptLayout === tag);
  assert.equal(of("grid").length, 3);
  assert.equal(of("grid-item").length, 15);
  const attrs = of("box").map((n) => JSON.parse(n.data.hProperties.dataGptAttrs));
  assert.equal(attrs.filter((a) => a.background === "rgba(74,144,113,0.13)").length, 6);
  assert.equal(attrs.filter((a) => a.background === "surface-secondary").length, 9);
  assert.equal(
    attrs.filter(
      (a) => a.padding === "{{x:1,y:2}}" && a.align === "center" && a.minHeight === "42px",
    ).length,
    15,
  );
  const text = flatten(tree)
    .filter((n) => n.type === "text")
    .map((n) => n.value)
    .join(" ");
  for (const expected of [
    "Pokémon",
    "Diablo",
    "Need for Speed",
    "Companions",
    "Chronicle",
    "Garage",
    "Events · Records",
  ])
    assert.ok(text.includes(expected));
  assert.ok(!/\{@body|\{#each|\{t\.|\{c\}/.test(text));
});

test("body bindings stay local; invalid declarations and expressions remain visible", () => {
  const source = `<box>{@body const rows=["A"];}{#each rows as item}<text>{item}</text>{/each}</box>\n\n<box>{#each rows as item}<text>{item}</text>{/each}</box>`;
  const text = flatten(parse(source))
    .filter((n) => n.type === "text")
    .map((n) => n.value)
    .join(" ");
  assert.ok(text.startsWith("A"));
  assert.ok(text.includes("{#each rows"));
  for (const declaration of [
    "const x=globalThis.run()",
    "const x=[];globalThis.run()",
    "let x=[]",
  ]) {
    assert.ok(
      flatten(parse(`<box>{@body ${declaration}}</box>`)).some((n) =>
        n.value?.includes(declaration),
      ),
    );
  }
  const literal = "<box>\n`{@body const x=[1]}`\n</box>";
  assert.ok(
    flatten(parse(literal)).some(
      (n) => n.type === "inlineCode" && n.value === "{@body const x=[1]}",
    ),
  );
  assert.equal(rich(parse('<box>{@body const rows=["A"]')).length, 0);
  assert.equal(layoutData('(i===2 || i===3) ? "yes > no" : "no"', { i: 3 }), "yes > no");
  for (const expression of [
    "window.alert(1)",
    "i=3",
    "i.constructor",
    "new Date()",
    "true ? (()=>1)() : 0",
  ])
    assert.equal(layoutData(expression, { i: 3 }), undefined);
});

test("layout each expands literal records, text and icon paths while preserving code offsets", () => {
  const source = `<box>
{#each [{icon:"play",label:"Continue game"},{icon:'users',label:'Play together'},{icon:"log-out",label:"Exit game"}] as item, index}
<row><icon name={item.icon}/><text>{index}. **{item.label}**</text></row>
\`{item.label}\`
{/each}

\`\`\`html
{#each [] as item}<text>{item.label}</text>{/each}
\`\`\`
</box>`;
  const nodes = flatten(parse(source));
  assert.deepEqual(
    rich(parse(source))
      .filter((n) => n.data.hProperties.dataGptLayout === "icon")
      .map((n) => JSON.parse(n.data.hProperties.dataGptAttrs).name),
    ["play", "users", "log-out"],
  );
  assert.deepEqual(
    nodes.filter((n) => n.type === "strong").map((n) => n.children[0].value),
    ["Continue game", "Play together", "Exit game"],
  );
  assert.equal(
    nodes.filter((n) => n.type === "inlineCode" && n.value === "{item.label}").length,
    3,
  );
  const code = nodes.find((n) => n.type === "code");
  assert.ok(
    source.slice(code.position.start.offset, code.position.end.offset).startsWith("```html"),
  );
  assert.ok(!nodes.some((n) => n.type === "text" && n.value.includes("{#each")));
});

test("nested local lists and empty lists preserve surrounding content", () => {
  const tree = parse(`<box>Before
{#each [{name:"Group",children:[{label:"A"},{label:"B"}]}] as group}
<box><title>{group.name}</title>
{#each group.children as child}<text>{child.label}</text>{/each}
</box>{/each}
{#each [] as unused}<text>Absent</text>{/each}
After</box>`);
  const text = flatten(tree)
    .filter((n) => n.type === "text")
    .map((n) => n.value)
    .join(" ");
  assert.match(text, /Before.*Group.*A.*B.*After/s);
  assert.ok(!text.includes("Absent"));
});

test("template data stays literal and unsupported expressions never execute or disappear", () => {
  const value = '<Link url="https://example.com" title="Injected"/>';
  const tree = parse(
    `<box>{#each [{label:${JSON.stringify(value)}}] as item}<text>{item.label}</text>{/each}</box>`,
  );
  assert.equal(flatten(tree).filter((n) => n.type === "gptReference").length, 0);
  assert.ok(flatten(tree).some((n) => n.value === value));
  for (const expression of [
    "globalThis.run()",
    "[{label:globalThis.run()}]",
    '[{__proto__:{label:"bad"}}]',
    "item.constructor",
  ]) {
    const source = `<box>{#each ${expression} as item}<text>{item.label}</text>{/each}</box>`;
    assert.ok(
      flatten(parse(source)).some((n) => n.value?.includes(expression)),
      expression,
    );
  }
  assert.equal(
    rich(parse('<box>{#each [{label:"A"}] as item}<text>{item.label}</text></box>')).length,
    0,
  );
});

test("FileCite keeps repeated file identities and multiline line ranges without touching code", () => {
  const tag = '<FileCite ref="file_example" line_range_start={167} line_range_end=\n{171}/>';
  const source = `Before ${tag} ${tag}\n\nAfter \`${tag.replace(/\n/g, " ")}\`\n\n\`\`\`xml\n${tag}\n\`\`\``;
  const nodes = flatten(parse(source));
  const refs = nodes.filter((node) => node.type === "gptReference");
  assert.equal(refs.length, 2);
  for (const ref of refs) {
    assert.equal(ref.data.hProperties.dataGptLayout, "FileCite");
    assert.deepEqual(JSON.parse(ref.data.hProperties.dataGptAttrs), {
      ref: "file_example",
      line_range_start: "167",
      line_range_end: "171",
    });
  }
  assert.ok(nodes.some((node) => node.type === "code" && node.value === tag));
  assert.ok(nodes.some((node) => node.type === "inlineCode" && node.value.includes("FileCite")));
});

test("WritingBlock preserves its exact body, Markdown and neighboring prose", () => {
  const body =
    "Heyo! 😁 No worries!\n\n**Good news** — nearly finished.\n\nI'll share an update! 😁";
  const source = `Before\n\n<WritingBlock id="58321" variant="chat_message">${body}</WritingBlock>\n\nAfter`;
  const tree = parse(source);
  assert.equal(rich(tree).length, 1);
  assert.equal(rich(tree)[0].data.hProperties.dataGptText, body);
  assert.deepEqual(JSON.parse(rich(tree)[0].data.hProperties.dataGptAttrs), {
    id: "58321",
    variant: "chat_message",
  });
  assert.ok(flatten(tree).some((n) => n.type === "strong"));
  for (const text of ["Before", "After"]) assert.ok(flatten(tree).some((n) => n.value === text));
  const second = parse(
    `${source}\n\n<WritingBlock variant="email" subject="Update">Second</WritingBlock>`,
  );
  assert.equal(rich(second).length, 2);
  assert.equal(rich(second)[1].data.hProperties.dataGptText, "Second");
});

test("WritingBlock does not consume literal code or lose incomplete source", () => {
  const tag = '<WritingBlock id="1">Example</WritingBlock>';
  for (const source of [
    `\`${tag}\``,
    `\`\`\`xml\n${tag}\n\`\`\``,
    '<WritingBlock id="1">Still writing',
  ]) {
    assert.equal(rich(parse(source)).length, 0);
    assert.ok(flatten(parse(source)).some((n) => n.value?.includes("WritingBlock")));
  }
  const body = "\n```html\n</WritingBlock>\n```\n\n<script>alert(1)</script>\n";
  const source = `<WritingBlock>${body}</WritingBlock>`;
  const tree = parse(source);
  assert.equal(rich(tree).length, 1);
  assert.equal(rich(tree)[0].data.hProperties.dataGptText, body);
  const code = flatten(tree).find((n) => n.type === "code");
  assert.equal(
    source.slice(code.position.start.offset, code.position.end.offset),
    "```html\n</WritingBlock>\n```",
  );
});
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

test("unknown children are contained without disabling supported siblings", () => {
  const tree = parse(
    '<box><text>Before</text><iframe src="x">Keep me</iframe><row><text>After</text></row></box>',
  );
  assert.equal(rich(tree).length, 4);
  const fallback = flatten(tree).find((n) => n.type === "gptUnsupported");
  assert.equal(fallback.data.hProperties.dataGptText, '<iframe src="x">Keep me</iframe>');
  assert.ok(!flatten(tree).some((n) => n.data?.hName === "iframe"));
});
test("SVG diagrams, conditions and arithmetic share template scopes without HTML execution", () => {
  const source =
    '<box><svg viewBox="0 0 340 165" width="100%">{#each [24,48,72] as y,i}<line x1={8+i*2} y1={y} x2="332" y2={y} stroke="#525866"/>{/each}{#if 2>1}<text x="12" y="20">Score {3*4}</text>{:else}<text>No</text>{/if}<path d="M12 107 L34 107"/><script>alert(1)</script><use href="https://bad.test/x" onload="bad()"/><rect width="20" fill="url(https://bad.test/x)"/></svg><text>After</text></box>';
  const tree = parse(source),
    nodes = flatten(tree);
  assert.equal(nodes.filter((n) => n.data?.hName === "line").length, 3);
  assert.deepEqual(
    nodes.filter((n) => n.data?.hName === "line").map((n) => n.data.hProperties.x1),
    ["8", "10", "12"],
  );
  assert.equal(nodes.find((n) => n.data?.hName === "svg").data.hProperties.viewBox, "0 0 340 165");
  assert.ok(nodes.some((n) => n.value?.includes("Score 12")));
  assert.ok(!nodes.some((n) => n.data?.hName === "script"));
  assert.ok(
    nodes.some(
      (n) => n.type === "gptUnsupported" && n.data.hProperties.dataGptText.includes("alert(1)"),
    ),
  );
  assert.deepEqual(nodes.find((n) => n.data?.hName === "use").data.hProperties, {});
  assert.equal(nodes.find((n) => n.data?.hName === "rect").data.hProperties.fill, undefined);
  assert.ok(!nodes.some((n) => n.value === "No"));
  assert.equal(layoutData("2+3*4", {}), 14);
  assert.equal(layoutData("1/0", {}), undefined);
});
test("nested expansion cannot freeze the reader or discard the original block", () => {
  const list = JSON.stringify(Array.from({ length: 110 }, (_, i) => i));
  const source =
    "<box>{#each " +
    list +
    " as a}{#each " +
    list +
    " as b}<text>{a}:{b}</text>{/each}{/each}</box>";
  const tree = parse(source),
    fallback = flatten(tree).find((n) => n.type === "gptUnsupported");
  assert.equal(fallback.data.hProperties.dataGptText, source);
});

test("large repeated template text falls back without truncating source", () => {
  const source =
    "<box>{@body const text=" +
    JSON.stringify("x".repeat(12000)) +
    "}{#each " +
    JSON.stringify(Array.from({ length: 800 }, (_, i) => i)) +
    " as i}<text>{text}</text>{/each}</box>";
  const fallback = flatten(parse(source)).find((n) => n.type === "gptUnsupported");
  assert.equal(fallback.data.hProperties.dataGptText, source);
});

test("generated SVG ranges and pure mathematics preserve native waveform geometry", () => {
  const source =
    '<box><svg viewBox="0 0 340 60">{#each Array.from({length:68},(_,i)=>i) as i}<line x1={i*5+2} x2={i*5+2} y1={30-(6+Math.abs(Math.sin(i*1.91)*15)+Math.abs(Math.sin(i*.32)*9))} y2={30+(6+Math.abs(Math.sin(i*1.91)*15)+Math.abs(Math.sin(i*.32)*9))}/>{/each}</svg></box>';
  const lines = flatten(parse(source)).filter((n) => n.data?.hName === "line");
  assert.equal(lines.length, 68);
  for (let i = 0; i < 68; i++) {
    const p = lines[i].data.hProperties,
      amplitude = 6 + Math.abs(Math.sin(i * 1.91) * 15) + Math.abs(Math.sin(i * 0.32) * 9);
    assert.equal(Number(p.x1), i * 5 + 2);
    assert.equal(Number(p.y1), 30 - amplitude);
    assert.equal(Number(p.y2), 30 + amplitude);
  }
  assert.deepEqual(
    layoutData("Array.from({length:3},(_,i)=>({x:i,y:Math.max(1,i)}))", {}),
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ].map((x) => Object.assign(Object.create(null), x)),
  );
  assert.equal(layoutData("Math.random()", {}), undefined);
  assert.equal(layoutData('Math.constructor("return globalThis")()', {}), undefined);
  assert.equal(layoutData('Array.from({length:3},(_,i)=>fetch("x"))', {}), undefined);
  assert.equal(
    layoutData("Array.from({length:10000},(_,i)=>Array.from({length:10000},(_,j)=>j))", {}),
    undefined,
  );
});
