import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { shellTracking, TerminalActivity } from "../apps/hub/dist/terminal-activity.js";
import { terminalProbeScript } from "../apps/hub/dist/terminal-probe.js";
import { terminalFormInput } from "../apps/web/src/terminalInput.ts";

const require = createRequire(new URL("../apps/hub/package.json", import.meta.url));
test("real Linux PTY classifies child password entry without treating ordinary typeahead as a response", {
  skip: process.platform !== "linux",
}, async () => {
  const { spawn } = require("node-pty"),
    dir = await mkdtemp(join(tmpdir(), "cw-noecho-"));
  const a = new TerminalActivity(),
    rc = join(dir, "rc");
  await writeFile(rc, shellTracking(a.token, "linux"));
  const p = spawn("/bin/bash", ["--noprofile", "--rcfile", rc, "-i"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: dir,
    env: { ...process.env, HOME: dir },
  });
  let output = "";
  p.onData((data) => {
    output += a.output(data);
  });
  const wait = async (predicate) => {
    const until = Date.now() + 8000;
    while (!predicate()) {
      if (Date.now() > until) throw Error("PTY phase timed out");
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  const probe = (input) => {
    const r = spawnSync("sh", ["-c", terminalProbeScript("linux", a.identity, input)], {
      encoding: "utf8",
      timeout: 2000,
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  try {
    await wait(() => a.candidate());
    assert.equal(probe(true), "unknown");
    const cmd = terminalFormInput(
      `python3 -c 'import sys,termios; old=termios.tcgetattr(0); mode=termios.tcgetattr(0); mode[3]&=~termios.ECHO; termios.tcsetattr(0,termios.TCSANOW,mode); print("PASSWORD_READY",flush=True); input(); termios.tcsetattr(0,termios.TCSANOW,old)'\n`,
    );
    a.input(cmd);
    p.write(cmd);
    await wait(() => a.executing && output.includes("PASSWORD_READY\r\n"));
    assert.equal(probe(true), "response");
    a.input("fixture-response\r", true);
    p.write("fixture-response\r");
    await wait(() => !a.executing);
    assert(a.candidate(Date.now() + 2000));
    assert.equal(probe(false), "idle");
    assert(!output.includes("fixture-response"), "response was not echoed");
  } finally {
    p.kill();
    await rm(dir, { recursive: true, force: true });
  }
});
