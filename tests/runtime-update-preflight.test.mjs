import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { probeCandidate } from "../ops/windows/runtime-update/candidate-probe.mjs";

function fake(overrides = {}) {
  const methods = [];
  let ended = false;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    ended = true;
    child.emit("close", 0);
  };
  child.stdin = new Writable({
    write(chunk, encoding, done) {
      const m = JSON.parse(chunk.toString());
      methods.push(m.method);
      if (m.id) {
        const values = {
          initialize: { userAgent: "test/0.166.0" },
          "account/read": {
            account: { type: "chatgpt", email: "owner@example.test", workspaceName: "Работа" },
          },
          "model/list": { data: [{ id: "test" }] },
          "command/exec": { exitCode: 0, stdout: "abyssdeck-preflight" },
        };
        const value = m.method in overrides ? overrides[m.method] : values[m.method];
        const data = Buffer.from(
          JSON.stringify({ id: m.id, ...(value?.error ? value : { result: value }) }) + "\n",
        );
        queueMicrotask(() => {
          for (const byte of data) child.stdout.write(Buffer.from([byte]));
        });
      }
      done();
    },
    final(done) {
      ended = true;
      child.emit("close", 0);
      done();
    },
  });
  return {
    methods,
    child,
    launch: () => child,
    get ended() {
      return ended;
    },
  };
}
test("candidate preflight verifies actual account/catalog/executor without threads or replay", async () => {
  const f = fake();
  const result = await probeCandidate("candidate.exe", f.launch);
  assert.equal(result.account.workspaceName, "Работа");
  assert.equal(result.models, 1);
  assert.deepEqual(f.methods, [
    "initialize",
    "initialized",
    "account/read",
    "model/list",
    "command/exec",
  ]);
  assert(f.ended);
});
for (const [method, value] of [
  ["account/read", { account: null }],
  ["model/list", { data: [] }],
  ["command/exec", { exitCode: 1, stdout: "" }],
  ["initialize", { error: { code: -32600, message: "incompatible" } }],
]) {
  test("candidate preflight rejects " + method + " incompatibility before activation", async () => {
    const f = fake({ [method]: value });
    await assert.rejects(probeCandidate("candidate.exe", f.launch));
    assert.equal(f.methods.filter((x) => x === method).length, 1);
    assert(f.ended);
    assert(!f.methods.some((x) => x.startsWith("thread/") || x.startsWith("turn/")));
  });
}
