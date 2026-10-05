import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const { pasteRemoteText } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(await readFile("apps/web/src/remoteClipboard.ts", "utf8"))).toString("base64")}`
);
function fixture() {
  const packets = [];
  return { packets, client: { sendKeyEvent: (pressed, key) => packets.push([pressed, key]) } };
}
test("paste sends Unicode scalars, paired key events and exactly the supplied line breaks", async () => {
  const { client, packets } = fixture(),
    text = "Text Привет שלום 🖥\r\n\t".repeat(20);
  await pasteRemoteText(client, text, new AbortController().signal);
  const decoded = [];
  for (let i = 0; i < packets.length; i += 2) {
    const [pressed, key] = packets[i];
    assert.equal(pressed, 1);
    assert.deepEqual(packets[i + 1], [0, key]);
    decoded.push(
      key === 0xff0d ? "\n" : key === 0xff09 ? "\t" : String.fromCodePoint(key & 0xffffff),
    );
  }
  assert.equal(decoded.join(""), text.replace(/\r\n/g, "\n"));
  assert.equal(packets.at(-1)[1], 0xff09, "no implicit Enter after the text");
});
test("closing mid-transfer stops without replay and leaves no pressed keys", async () => {
  const { client, packets } = fixture(),
    cancel = new AbortController();
  const sending = pasteRemoteText(client, "x".repeat(4000), cancel.signal);
  await new Promise((resolve) => setTimeout(resolve, 5));
  cancel.abort();
  await assert.rejects(sending, /остановлена/);
  const count = packets.length;
  assert(count > 0 && count < 8000);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(packets.length, count);
  assert.equal(packets.at(-1)[0], 0);
});
test("oversized, control-bearing and already-cancelled input never sends", async () => {
  const { client, packets } = fixture();
  await assert.rejects(pasteRemoteText(client, "я".repeat(524289), new AbortController().signal));
  await assert.rejects(pasteRemoteText(client, "hello", AbortSignal.abort()));
  await assert.rejects(pasteRemoteText(client, "bad\x1b", new AbortController().signal));
  assert.equal(packets.length, 0);
});
