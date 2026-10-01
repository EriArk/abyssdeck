import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { terminalFormInput } from "../apps/web/src/terminalInput.ts";
import { devicesFixture } from "./devices-fixture.mjs";

const wait = () => new Promise((r) => setTimeout(r, 30));
function token(pty) {
  return (pty.args.join(" ").match(/[A-Za-z0-9+/]{100,}={0,2}/g) || [])
    .map((x) => Buffer.from(x, "base64").toString())
    .find((x) => x.includes("__cw_token="))
    .match(/__cw_token='([a-f0-9]{48})'/)[1];
}
const signal = (pty, phase) => pty.output(`\x1b]777;codexweb;${token(pty)};${phase};234;456;0\x07`);
async function create(f) {
  return (
    await f.app.inject({
      url: "/api/devices/server/terminals",
      method: "POST",
      headers: { ...f.headers, "idempotency-key": randomUUID() },
      payload: { kind: "shell" },
    })
  ).json();
}
const release = (f, id, headers = f.headers) =>
  f.app.inject({ url: `/api/device-terminals/${id}/release`, method: "POST", headers });
test("terminal form adds one Enter after clipboard line endings and preserves multiline content", () => {
  for (const suffix of ["", "\n", "\r\n", "\n\n"])
    assert.equal(terminalFormInput("sudo command" + suffix), "sudo command\r");
  assert.equal(terminalFormInput("one\n two\r\n"), "one\r two\r");
  assert.equal(terminalFormInput(""), "\r");
  assert.equal(terminalFormInput("password with spaces  "), "password with spaces  \r");
});
test("explicit window release closes idle shell; normal detached terminals remain available", async () => {
  const f = await devicesFixture(undefined, {
    executionService: true,
    devices: { terminalProbe: async () => "idle" },
  });
  try {
    const a = await create(f),
      b = await create(f);
    signal(f.processes[0], "prompt");
    signal(f.processes[1], "prompt");
    assert.equal((await release(f, a.id)).statusCode, 200);
    await wait();
    assert(f.processes[0].killed);
    assert(!f.processes[1].killed);
    assert.equal((await release(f, a.id)).statusCode, 200, "duplicate release stays harmless");
    const state = (await f.app.inject({ url: "/internal/terminals/maintenance" })).json();
    assert.equal(state.unknown, 0);
    assert.equal(state.busy, 0);
    assert.equal((await release(f, b.id, { cookie: "codex-session=wrong" })).statusCode, 401);
    assert(!f.processes[1].killed);
  } finally {
    await f.close();
  }
});
test("release waits for completion, process probe and no stale async result", async () => {
  let mode = "busy",
    during;
  const f = await devicesFixture(undefined, {
    devices: {
      terminalProbe: async () => {
        during?.();
        return mode;
      },
    },
  });
  try {
    const a = await create(f),
      p = f.processes[0];
    signal(p, "prompt");
    signal(p, "busy");
    await release(f, a.id);
    await wait();
    assert(!p.killed);
    signal(p, "prompt");
    await wait();
    assert(!p.killed, "child work prevents close");
    mode = "idle";
    during = () => signal(p, "busy");
    signal(p, "prompt");
    await wait();
    assert(!p.killed, "late proof cannot close new work");
    during = undefined;
    signal(p, "prompt");
    await wait();
    assert(p.killed);
    const b = await create(f);
    await release(f, b.id);
    await wait();
    assert(!f.processes[1].killed, "unknown startup is not idle");
  } finally {
    await f.close();
  }
});
