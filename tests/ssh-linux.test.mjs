import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { remoteProvider } from "../apps/hub/dist/remote.js";
import { bindMachineAuthority } from "../packages/machines/dist/authority.js";
import {
  readProjectFile,
  stageAttachment,
  verifyProjectRoot,
} from "../packages/machines/dist/index.js";
import { linuxSshCommand, remoteProbe } from "../packages/machines/dist/remoteLinux.js";
import { configSchema } from "../packages/shared/dist/index.js";

test("Linux SSH config requires its target and POSIX paths; Unix sockets are Linux-only", () => {
  const config = {
    hub: {
      publicBaseUrl: "https://fixture.invalid",
      databasePath: ":memory:",
      resultsPath: "/tmp/results",
    },
    auth: {},
    machines: [
      {
        id: "pc",
        name: "PC",
        type: "ssh-linux",
        ssh: { target: "pc" },
        codex: {
          appServerSocket: "/run/user/1000/app.sock",
          activityNode: "/usr/bin/node",
          launcher: "/private/bridge.mjs",
        },
      },
    ],
    projects: [{ id: "p", name: "P", machineId: "pc", workingDirectory: "/projects" }],
  };
  assert.equal(configSchema.parse(config).machines[0].type, "ssh-linux");
  assert.throws(() =>
    configSchema.parse({ ...config, machines: [{ ...config.machines[0], ssh: undefined }] }),
  );
  assert.throws(() =>
    configSchema.parse({
      ...config,
      projects: [{ ...config.projects[0], workingDirectory: "C:\\Projects" }],
    }),
  );
  assert.throws(() =>
    configSchema.parse({ ...config, machines: [{ ...config.machines[0], type: "local-linux" }] }),
  );
});

test("SSH quoting preserves Unicode, newlines and shell metacharacters as data", () => {
  const machine = {
    type: "ssh-linux",
    ssh: { target: "pc", configFile: "/private/config" },
    codex: { command: "/bin/printf", activityNode: process.execPath },
  };
  const text = "space 'quote' $HOME $(false) `false`; Русский\nline two";
  const args = linuxSshCommand(machine, ["/usr/bin/printf", "%s", text], tmpdir());
  const result = spawnSync("/bin/sh", ["-c", args.at(-1)], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, text);
  assert(args.includes("StrictHostKeyChecking=yes"));
  assert(args.includes("ForwardAgent=no"));
  assert.throws(() => linuxSshCommand(machine, ["echo", "bad\0value"]));
  bindMachineAuthority(machine, () => {
    throw Error("REVOKED");
  });
  assert.throws(() => linuxSshCommand(machine, ["echo"]), /REVOKED/);
});

test("Linux files and probes execute remotely, reject escaping symlinks and preserve uploads", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "abyssdeck-linux-"));
  const bin = join(dir, "bin"),
    root = join(dir, "project ' Русский");
  await mkdir(bin);
  await mkdir(root);
  await writeFile(
    join(bin, "ssh"),
    "#!/usr/bin/python3\nimport os,sys\nos.execl('/bin/sh','sh','-c',sys.argv[-1])\n",
    { mode: 0o700 },
  );
  const originalPath = process.env.PATH;
  process.env.PATH = bin + ":" + originalPath;
  t.after(async () => {
    process.env.PATH = originalPath;
    await rm(dir, { recursive: true, force: true });
  });
  const machine = {
    id: "pc",
    name: "PC",
    type: "ssh-linux",
    ssh: { target: "fixture" },
    allowedProjectRoots: [root],
    codex: { command: process.execPath, activityNode: process.execPath },
  };
  await writeFile(join(root, "hello.txt"), "Linux transfer ✓");
  await verifyProjectRoot(machine, root);
  assert.equal((await readProjectFile(machine, root, "hello.txt")).toString(), "Linux transfer ✓");
  const remote = await remoteProbe(
    machine,
    async () => ({ platform: process.platform, value: "remote" }),
    [],
  );
  assert.equal(remote.value, "remote");
  await assert.rejects(() => readProjectFile(machine, root, "../outside"));
  await symlink(tmpdir(), join(root, "escape"));
  await assert.rejects(() => verifyProjectRoot(machine, join(root, "escape")));
  const uploaded = await stageAttachment(
    machine,
    "project",
    randomUUID(),
    "hello.txt",
    join(root, "hello.txt"),
  );
  t.after(async () => {
    await rm(join(uploaded, ".."), { recursive: true, force: true });
  });
  assert.equal(await readFile(uploaded, "utf8"), "Linux transfer ✓");
  assert.match(uploaded, /\/\.codex-web\/uploads\/[a-f0-9-]{36}\/upload-hello.txt$/);
});

test("RDP certificate pin is explicit; ordinary certificate verification remains enabled", () => {
  process.env.ABYSSDECK_TEST_REMOTE_PASSWORD = "test-only";
  try {
    const fingerprint = "sha256:" + Array(32).fill("aa").join(":");
    const result = remoteProvider({
      remote: {
        provider: "rdp",
        host: "private",
        port: 3389,
        passwordSecret: "ABYSSDECK_TEST_REMOTE_PASSWORD",
        certificateFingerprint: fingerprint,
      },
    });
    assert.equal(result.parameters["cert-fingerprints"], fingerprint);
    assert.equal(result.parameters["ignore-cert"], "false");
    assert.equal(result.parameters.security, "nla");
  } finally {
    delete process.env.ABYSSDECK_TEST_REMOTE_PASSWORD;
  }
});
