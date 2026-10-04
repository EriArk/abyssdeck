import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { probeDevice, terminalCommand } from "../apps/hub/dist/device-transport.js";
import { ServerWorkspaces, workspaceRuntime } from "../apps/hub/dist/server-workspaces.js";
import { Store } from "../apps/hub/dist/store.js";
import { createTeamSnapshot, restoreTeamSnapshot } from "../apps/hub/dist/team-maintenance.js";
import { TeamStore } from "../apps/hub/dist/team-store.js";
import { probeTerminal } from "../apps/hub/dist/terminal-probe.js";
import { workspaceDevice, workspacePtyScript } from "../apps/hub/dist/workspace-terminal.js";
import { runProjectSetup } from "../packages/machines/dist/projectSetup.js";
import {
  workspaceCommand,
  workspaceHostCommand,
} from "../packages/machines/dist/serverWorkspace.js";
import { workspaceRead } from "../packages/machines/dist/workspaceFiles.js";
import { configSchema } from "../packages/shared/dist/index.js";

async function fixture(t, enabled = true) {
  const dir = await mkdtemp(join(tmpdir(), "cw-server-integration-"));
  const config = configSchema.parse({
    hub: {
      publicBaseUrl: "https://fixture.invalid",
      databasePath: join(dir, "owner.db"),
      resultsPath: join(dir, "results"),
    },
    auth: { username: "owner" },
    machines: [],
    projects: [],
    team: { enabled: true, root: join(dir, "team") },
    ...(enabled
      ? {
          serverWorkspaces: {
            ssh: { target: "private-host", configFile: "/private/ssh" },
            keyFile: "/private/key",
          },
        }
      : {}),
  });
  const store = new Store(config.hub.databasePath);
  store.db.prepare("INSERT INTO users VALUES('owner','fixture')").run();
  const registry = new TeamStore(join(config.team.root, "team.db"), config, store);
  const member = registry.accept(
    registry.invite(registry.ownerId, "Member", "member").token,
    "member",
    "Member",
    "unused",
    10,
  );
  const service = new ServerWorkspaces(config, registry);
  t.after(async () => {
    await service.close();
    registry.db.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, config, registry, service, member, userId: member.id };
}
test("creation is coalesced; lost reply reconciles status without a second create", async (t) => {
  const { service, registry, userId } = await fixture(t);
  const calls = [];
  let ready = false;
  service.command = async (owner, op) => {
    calls.push([owner, op]);
    if (!ready) throw Error("lost response");
    return { state: "ready", running: true };
  };
  const a = service.create(userId),
    b = service.create(userId);
  assert.equal(a, b);
  await assert.rejects(a);
  assert.equal(service.view(userId).state, "creating");
  ready = true;
  await service.create(userId);
  assert.deepEqual(
    calls.map((x) => x[1]),
    ["create", "status"],
  );
});
test("unconfigured and restored installations cannot allocate a workspace", async (t) => {
  const { service, registry, config, userId } = await fixture(t, false);
  assert.throws(() => service.create(userId), { code: "WORKSPACE_UNAVAILABLE" });
  assert.equal(service.view(userId).state, "absent");
  config.serverWorkspaces = { ssh: { target: "host", configFile: "/ssh" }, keyFile: "/key" };
  registry.db.prepare("INSERT OR REPLACE INTO team_meta VALUES('nativeAdmission','blocked')").run();
  assert.throws(() => service.create(userId), { code: "RESTORE_ADMISSION_REQUIRED" });
});
test("creation failure stays uncertain until authoritative missing status; maintenance blocks new work", async (t) => {
  const { service, registry, userId } = await fixture(t);
  service.command = async () => {
    throw Error("lost");
  };
  await assert.rejects(service.create(userId));
  service.command = async () => {
    throw Object.assign(Error("missing"), { code: "WORKSPACE_MISSING" });
  };
  await assert.rejects(service.create(userId));
  assert.equal(service.view(userId).state, "absent");
  service.canRun = () => false;
  assert.throws(() => service.create(userId), { code: "ENGINE_MAINTENANCE" });
});
test("project setup reaches personal worker with POSIX roots and exact durable receipt", async (t) => {
  const { dir, config, registry, userId } = await fixture(t);
  registry.db.prepare("INSERT INTO team_server_workspaces VALUES(?,'ready',0)").run(userId);
  const machine = workspaceRuntime(config, registry, userId).machines[0];
  machine.allowedProjectRoots = [dir];
  const bin = join(dir, "bin");
  await mkdir(bin);
  await writeFile(
    join(bin, "ssh"),
    `#!/usr/bin/python3\nimport os,sys,shlex\na=shlex.split(sys.argv[-1]);assert a[8]=='exec';os.execvp(a[9],a[9:])\n`,
    { mode: 0o700 },
  );
  const before = { PATH: process.env.PATH, HOME: process.env.HOME };
  process.env.PATH = bin + ":" + process.env.PATH;
  process.env.HOME = dir;
  t.after(() => {
    process.env.PATH = before.PATH;
    process.env.HOME = before.HOME;
  });
  const input = {
    machineId: machine.id,
    name: "Demo",
    workingDirectory: join(dir, "new"),
    createDirectory: true,
    repository: { mode: "none", owner: "", name: "", visibility: "private", description: "" },
  };
  const review = await runProjectSetup(machine, { op: "inspect", input });
  const request = { op: "apply", input, id: randomUUID(), fingerprint: review.fingerprint };
  assert.equal((await runProjectSetup(machine, request)).state, "complete");
  assert.equal((await runProjectSetup(machine, request)).state, "complete");
  await assert.rejects(
    runProjectSetup(machine, { ...request, input: { ...input, workingDirectory: "/etc/new" } }),
  );
});
test("same visible machine ID binds two distinct owners; copied config grants nothing; revocation persists", async (t) => {
  const { service, registry, config, member } = await fixture(t);
  const admin = registry.accept(
    registry.invite(registry.ownerId, "Admin", "admin").token,
    "admin",
    "Admin",
    "unused",
    10,
  );
  for (const owner of [admin.id, member.id])
    registry.db.prepare("INSERT INTO team_server_workspaces VALUES(?,'ready',0)").run(owner);
  const a = workspaceRuntime(config, registry, admin.id),
    b = workspaceRuntime(config, registry, member.id);
  const cmd = (machine) =>
    workspaceCommand(machine, ["node", "-e", "process.stdout.write('hello')"], "/workspace");
  assert.ok(cmd(a.machines[0]).at(-1).includes(admin.id));
  assert.ok(cmd(b.machines[0]).at(-1).includes(member.id));
  assert.throws(() => cmd(structuredClone(a.machines[0])));
  registry.db.prepare("UPDATE team_users SET state='disabled' WHERE id=?").run(member.id);
  service.command = async () => {
    throw Error("offline");
  };
  await assert.rejects(service.revokeDisabled(member.id));
  assert.equal(
    registry.db.prepare("SELECT state FROM team_server_workspaces WHERE owner=?").get(member.id)
      .state,
    "revoking",
  );
  assert.throws(() => cmd(b.machines[0]));
  assert.doesNotThrow(() => cmd(a.machines[0]));
  service.command = async () => ({ state: "revoked" });
  await service.revokeDisabled(member.id);
  assert.equal(workspaceRuntime(config, registry, member.id).machines.length, 0);
});
test("workspace devices never fall through to a host shell or host process probe", async (t) => {
  const { config, userId } = await fixture(t);
  const device = {
    id: "server-workspace",
    workspaceMachineId: "server-workspace",
    name: "Private",
    platform: "linux",
    ssh: config.serverWorkspaces.ssh,
  };
  assert.throws(() => workspaceDevice(config, device));
  assert.throws(() => terminalCommand(device, { kind: "shell" }));
  await assert.rejects(probeDevice(device));
  assert.equal(await probeTerminal(device, { pid: 1, birth: "1" }), "unknown");
});
test("explicit start reconciles an existing container and never creates or restarts a running one", async (t) => {
  const { service, registry, userId } = await fixture(t);
  registry.db.prepare("INSERT INTO team_server_workspaces VALUES(?,'ready',0)").run(userId);
  let running = false;
  const calls = [];
  service.command = async (_owner, op) => {
    calls.push(op);
    if (op === "start") running = true;
    return { state: "ready", running };
  };
  await service.start(userId);
  await service.start(userId);
  assert.deepEqual(calls, ["status", "start", "status"]);
});
test("team checkpoint retains workspace owners and blocks execution after restore", async (t) => {
  const { dir, config, registry, member, userId } = await fixture(t);
  registry.db.prepare("UPDATE team_namespaces SET initialized=1 WHERE userId=?").run(userId);
  for (const owner of [userId, member.id])
    registry.db.prepare("INSERT INTO team_server_workspaces VALUES(?,'ready',0)").run(owner);
  const snapshot = await createTeamSnapshot(config, join(dir, "backups"));
  await restoreTeamSnapshot(snapshot, join(dir, "restore"));
  const db = new DatabaseSync(join(dir, "restore/team/team.db"));
  try {
    assert.deepEqual(
      db
        .prepare("SELECT owner FROM team_server_workspaces ORDER BY owner")
        .all()
        .map((r) => r.owner),
      [userId, member.id].sort(),
    );
    assert.equal(
      db.prepare("SELECT value FROM team_meta WHERE key='nativeAdmission'").get().value,
      "blocked",
    );
  } finally {
    db.close();
  }
});
test("fixed SSH command preserves literal quoting and rejects forged owner", () => {
  const host = { ssh: { target: "host", configFile: "/ssh" }, keyFile: "/key" };
  assert.throws(() => workspaceHostCommand(host, "--evil", "status"));
  const command = workspaceHostCommand(host, randomUUID(), "exec", [
    "bash",
    "-c",
    "printf '%s' '$HOME';\necho ok",
  ]);
  assert.ok(command.includes("ForwardAgent=no"));
  assert.ok(command.at(-1).includes("'\\''"));
});
test("workspace text reader preserves bytes and rejects links and path escapes", async (t) => {
  const { dir, userId } = await fixture(t);
  const root = join(dir, "project");
  await mkdir(root);
  await writeFile(join(root, "a.txt"), Buffer.from([0, 255, 10]));
  assert.deepEqual(
    Buffer.from(await workspaceRead(root, join(root, "a.txt"), 3), "base64"),
    Buffer.from([0, 255, 10]),
  );
  await symlink(join(root, "a.txt"), join(root, "link"));
  await assert.rejects(workspaceRead(root, join(root, "link"), 3));
  await assert.rejects(workspaceRead(root, join(dir, "owner.db"), 100000));
  await assert.rejects(workspaceRead(root, join(root, "a.txt"), 2));
});
test("container PTY accepts resize and exact interactive input, exits without replay", {
  timeout: 10000,
}, async (t) => {
  const child = spawn(
    "python3",
    ["-u", "-c", workspacePtyScript, Buffer.from("PS1='ready> '").toString("base64")],
    { stdio: "pipe" },
  );
  t.after(() => child.kill());
  let text = "",
    pending = "",
    err = "";
  child.stderr.on("data", (c) => (err += c));
  child.stdout.on("data", (c) => {
    pending += c;
    while (pending.includes("\n")) {
      const at = pending.indexOf("\n");
      const line = pending.slice(0, at);
      pending = pending.slice(at + 1);
      text += Buffer.from(JSON.parse(line).data, "base64").toString();
    }
  });
  child.stdin.write(JSON.stringify({ type: "resize", cols: 82, rows: 27 }) + "\n");
  child.stdin.write(
    JSON.stringify({
      type: "input",
      data: Buffer.from("stty size; printf 'hello-%s\\n' 'мир'; exit\n").toString("base64"),
    }) + "\n",
  );
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  assert.equal(code, 0, err);
  assert.match(text, /27 82/);
  assert.match(text, /hello-мир/);
});

test("personal Linux keeps terminal authority without an automatic Codex worker", async (t) => {
  const { config, registry, userId } = await fixture(t);
  registry.db.prepare("INSERT INTO team_server_workspaces VALUES(?,'ready',0)").run(userId);
  const { machines, devices } = workspaceRuntime(config, registry, userId);
  assert.equal(machines[0].codex.enabled, false);
  assert.equal(machines[0].codex.activityNode, undefined);
  assert.equal(devices[0].workspaceMachineId, machines[0].id);
  const { spawnCodex } = await import("../packages/machines/dist/index.js");
  assert.throws(() => spawnCodex(machines[0], "/workspace/projects"), {
    code: "CODEX_COMPONENT_DISABLED",
  });
  const cmd = workspaceCommand(machines[0], ["bash"], "/workspace");
  assert.ok(cmd.at(-1).includes("'exec' 'bash'"), "ordinary owner-bound terminal remains usable");
});

test("installation owner keeps host access without a personal workspace; saved state remains", async (t) => {
  const { service, registry, config } = await fixture(t);
  registry.db
    .prepare("INSERT INTO team_server_workspaces VALUES(?,'ready',0)")
    .run(registry.ownerId);
  assert.equal(service.view(registry.ownerId).available, false);
  assert.equal(service.view(registry.ownerId).state, "ready");
  assert.deepEqual(workspaceRuntime(config, registry, registry.ownerId), {
    machines: [],
    devices: [],
  });
  for (const action of ["create", "start", "requirePersonal"])
    assert.throws(() => service[action](registry.ownerId), { code: "WORKSPACE_NOT_NEEDED" });
  assert.equal(
    registry.db
      .prepare("SELECT state FROM team_server_workspaces WHERE owner=?")
      .get(registry.ownerId).state,
    "ready",
  );
});
