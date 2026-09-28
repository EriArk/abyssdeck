// Run only with the disposable rootless runtime supplied by server-workspace-runtime.py.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { spawnWorkspaceTerminal } from "../apps/hub/dist/workspace-terminal.js";
import { runFileTools } from "../packages/machines/dist/fileTools.js";
import { spawnCodex, stageAttachment, stopProcess } from "../packages/machines/dist/index.js";
import { inspectProject } from "../packages/machines/dist/inspector.js";
import { readMachineResources } from "../packages/machines/dist/resources.js";
import {
  bindServerWorkspace,
  collectWorkspace,
  spawnWorkspace,
  workspaceHomeScript,
  workspaceProbe,
} from "../packages/machines/dist/serverWorkspace.js";

const machine = {
  id: "server-workspace",
  name: "Test",
  type: "server-workspace",
  allowedProjectRoots: ["/workspace/projects"],
  codex: { command: "codex", shell: "powershell", activityNode: "node" },
};
bindServerWorkspace(machine, {
  owner: process.env.CW_RUNTIME_OWNER,
  ssh: { target: "fixture", configFile: "/fixture" },
  keyFile: "/fixture",
  authorize: () => {},
});
const root = "/workspace/projects/demo";
await collectWorkspace(spawnWorkspace(machine, ["node", "-e", workspaceHomeScript]), "");
await workspaceProbe(
  machine,
  async (root) => {
    const fs = await import("node:fs/promises"),
      cp = await import("node:child_process");
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(root + "/readme.md", "original\r\n");
    cp.execFileSync("git", ["init", "-q", root]);
  },
  [root],
);
const before = await runFileTools(machine, root, { op: "read", path: "readme.md" });
const save = {
  op: "save",
  path: before.path,
  fingerprint: before.fingerprint,
  bom: before.bom,
  text: "changed\r\n",
  id: randomUUID(),
};
const saved = await runFileTools(machine, root, save);
assert.deepEqual(await runFileTools(machine, root, save), saved);
assert.equal(
  (await runFileTools(machine, root, { op: "read", path: "readme.md" })).text,
  "changed\r\n",
);
await assert.rejects(runFileTools(machine, "/workspace/home", { op: "read", path: "anything" }));
const git = await inspectProject(machine, root, { op: "git" });
assert.ok(git);
const bytes = Buffer.from([0, 255, 1, 10]);
const source = process.env.CW_RUNTIME_TMP + "/input.bin";
await writeFile(source, bytes);
const staged = await stageAttachment(machine, "demo", randomUUID(), "model.step", source);
assert.ok(staged.endsWith("model.step"));
assert.equal(
  await workspaceProbe(
    machine,
    async (path) =>
      (await import("node:fs/promises")).readFile(path).then((b) => b.toString("hex")),
    [staged],
  ),
  bytes.toString("hex"),
);
const metrics = await readMachineResources(machine, root);
assert.equal(metrics.memoryTotal, 2 * 1024 ** 3);
const terminal = spawnWorkspaceTerminal(machine, randomBytes(24).toString("hex"));
let output = "";
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    terminal.kill();
    reject(Error("PTY timeout " + output));
  }, 15000);
  terminal.onData((data) => (output += data));
  terminal.onExit(() => {
    clearTimeout(timer);
    output.includes("PTY-PASSED") ? resolve() : reject(Error(output));
  });
  terminal.resize(83, 28);
  terminal.write("printf 'PTY-%s\\n' PASSED; stty size; exit\n");
});
assert.match(output, /28 83/);
const child = spawnCodex(machine, root);
let pending = "",
  diagnostic = "";
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Codex handshake timeout: " + diagnostic + pending)),
      15000,
    );
    child.stderr.on("data", (data) => (diagnostic = (diagnostic + data).slice(-4000)));
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(Error("Codex exit " + code + ": " + diagnostic));
    });
    child.stdout.on("data", (c) => {
      pending += c;
      while (pending.includes("\n")) {
        const at = pending.indexOf("\n");
        const line = pending.slice(0, at);
        pending = pending.slice(at + 1);
        const value = JSON.parse(line);
        if (value.id === 1) {
          clearTimeout(timer);
          value.result ? resolve() : reject(Error(JSON.stringify(value)));
        }
      }
    });
    child.stdin.write(
      JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "workspace-acceptance", version: "1" },
          capabilities: { experimentalApi: true },
        },
      }) + "\n",
    );
  });
} finally {
  stopProcess(child);
}
console.log(
  "Workspace runtime: file read/save/receipt, roots, Git, binary staging, quota metrics, PTY and native Codex handshake passed.",
);
