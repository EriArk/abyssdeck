import assert from "node:assert/strict";
import test from "node:test";
import remarkParse from "../apps/web/node_modules/remark-parse/index.js";
import { unified } from "../apps/web/node_modules/unified/index.js";
import { bindState, layoutAction, stateBinding } from "../apps/web/src/gptLayoutState.ts";
import { remarkGptLayout } from "../apps/web/src/gptRichMarkdown.ts";
import { mixerSample } from "../apps/web/tests/fixtures/gpt-mixer.ts";

const flatten = (n) => [n, ...(n.children || []).flatMap(flatten)];
function parse(value, states = {}) {
  const tree = unified().use(remarkParse).parse(value);
  remarkGptLayout({ states })(tree, { value });
  const nodes = flatten(tree);
  return {
    nodes,
    of: (tag) =>
      nodes
        .filter((n) => n.data?.hProperties?.dataGptLayout === tag)
        .map((n) => JSON.parse(n.data.hProperties.dataGptAttrs)),
  };
}
test("native mixer expands local states, channels, callbacks and recomputes presentation", () => {
  const initial = parse(mixerSample);
  assert.deepEqual(
    initial.of("slider").map((a) => a.value),
    ["90", "35", "75", "65"],
  );
  assert.equal(initial.of("button").length, 8);
  assert.ok(initial.of("button").every((a) => a.onClick && !a.unavailableAction));
  assert.ok(
    !initial.nodes.some(
      (n) => typeof n.value === "string" && /\{@body|\{#each|ch\.(name|value)/.test(n.value),
    ),
  );
  const key = JSON.parse(initial.of("slider")[0].onChange)[0].key;
  const updated = parse(mixerSample, { [key]: 0 });
  assert.equal(updated.of("slider")[0].value, "0");
  assert.equal(updated.of("icon").filter((a) => a.name === "volume-x").length, 1);
  const pure = JSON.parse(initial.of("button")[5].onClick);
  assert.deepEqual(
    pure.map((a) => a.value),
    [100, 0, 0],
  );
  assert.deepEqual(
    parse(mixerSample, Object.fromEntries(pure.map((a) => [a.key, a.value])))
      .of("slider")
      .map((a) => a.value),
    ["100", "0", "0", "65"],
  );
  assert.deepEqual(
    parse(mixerSample)
      .of("slider")
      .map((a) => a.value),
    ["90", "35", "75", "65"],
  );
});
test("callbacks admit only local setters, never arbitrary execution or partial effects", () => {
  const scope = {};
  assert.equal(
    bindState(stateBinding("{@body const [n,setN]=DIL.useState(5)}", 0), scope, {}),
    true,
  );
  assert.deepEqual(layoutAction("{setN}", scope), [{ key: "0:n:5", input: true }]);
  assert.deepEqual(layoutAction("{(v)=>setN(v)}", scope), [{ key: "0:n:5", input: true }]);
  assert.deepEqual(layoutAction("{()=>setN(n+1)}", scope), [{ key: "0:n:5", value: 6 }]);
  for (const raw of [
    '()=>fetch("/send")',
    '()=>{setN(1);fetch("/send")}',
    "()=>setN(window.x)",
    "()=>setN(x=>x+1)",
    '()=>setN.constructor("alert(1)")',
    "()=>{n=3}",
    "()=>setN(1) junk",
    "()=>setN(globalThis)",
  ])
    assert.equal(layoutAction(raw, scope), undefined, raw);
  assert.equal(stateBinding("{@body const [__proto__,setN]=DIL.useState(0)}", 0), undefined);
  const unsupported = parse(
    '{@body const [n,setN]=DIL.useState(0)}\n<box><button onClick={()=>fetch("/send")}>No</button><text>{n}</text></box>',
  );
  assert.equal(unsupported.of("button")[0].unavailableAction, "true");
  assert.equal(unsupported.of("button")[0].onClick, undefined);
});
test("literal code stays literal and controls support nonnumeric state", () => {
  assert.equal(parse("```text\n" + mixerSample + "\n```").of("slider").length, 0);
  const controls = parse(
    '{@body const [name,setName]=DIL.useState("A")}\n{@body const [checked,setChecked]=DIL.useState(false)}\n<box><input value={name} onChange={setName}/><checkbox checked={checked} onChange={setChecked}/><select value={name} onChange={setName}><option value="A">A</option><option value="B">B</option></select></box>',
  );
  assert.equal(controls.of("input")[0].value, "A");
  assert.equal(controls.of("checkbox")[0].checked, "false");
  assert.equal(controls.of("option").length, 2);
});
