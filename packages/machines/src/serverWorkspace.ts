import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { HubError, type MachineConfig } from "@codex-web/shared";
import { authorizeMachine } from "./authority.js";

export type WorkspaceHost = {
  ssh: { target: string; configFile: string };
  keyFile: string;
};
type Binding = WorkspaceHost & { owner: string; authorize: () => void };
const bindings = new WeakMap<MachineConfig, Binding>();
const quote = (value: string) => {
  if (/\0/u.test(value)) throw new Error("WORKSPACE_ARGUMENT_INVALID");
  return `'${value.replaceAll("'", "'\\''")}'`;
};
const unavailable = () =>
  new HubError(
    503,
    "SERVER_WORKSPACE_UNAVAILABLE",
    "Серверное окружение недоступно. Операция не повторялась.",
  );

// Also prepares older installed images; no image replacement or credential copying.
export const workspaceHomeScript = `const fs=require('node:fs');process.umask(0o077);for(const path of ['/workspace/home/.codex','/workspace/home/.config','/workspace/home/.cache','/workspace/home/.local/bin']){fs.mkdirSync(path,{recursive:true,mode:0o700});if(fs.realpathSync(path)!==path)throw Error('WORKSPACE_HOME_INVALID');}`;

/** Runtime-only authority: deserializing a machine never grants broker access. */
export function bindServerWorkspace(machine: MachineConfig, binding: Binding) {
  if (
    machine.type !== "server-workspace" ||
    bindings.has(machine) ||
    !/^[a-f0-9-]{36}$/.test(binding.owner)
  )
    throw new Error("WORKSPACE_BINDING_INVALID");
  bindings.set(machine, binding);
}
export function workspaceCommand(machine: MachineConfig, argv: readonly string[], cwd: string) {
  authorizeMachine(machine);
  const binding = bindings.get(machine);
  if (!binding) throw unavailable();
  binding.authorize();
  if (!cwd.startsWith("/") || argv.length < 1) throw unavailable();
  return workspaceHostCommand(binding, binding.owner, "exec", argv, cwd);
}
export function workspaceHostCommand(
  host: WorkspaceHost,
  owner: string,
  op: "status" | "create" | "start" | "stop" | "revoke" | "exec",
  argv: readonly string[] = [],
  cwd = "/workspace",
) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(owner))
    throw unavailable();
  return [
    "-F",
    host.ssh.configFile,
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ClearAllForwardings=yes",
    host.ssh.target,
    [
      "/usr/bin/python3",
      "/opt/codex-workspace-broker/client.py",
      "--key-file",
      host.keyFile,
      "--owner",
      owner,
      "--cwd",
      cwd,
      op,
      ...argv,
    ]
      .map(quote)
      .join(" "),
  ];
}
export function spawnWorkspace(
  machine: MachineConfig,
  argv: readonly string[],
  cwd = "/workspace",
) {
  return spawn("ssh", workspaceCommand(machine, argv, cwd), {
    stdio: "pipe",
    detached: process.platform !== "win32",
    windowsHide: true,
  });
}
export function collectWorkspace(
  child: ChildProcessWithoutNullStreams,
  input: string | Buffer,
  timeout = 90000,
  limit = 64 * 1024 * 1024,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0,
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        child.stdin.destroy();
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill();
        } catch {}
        reject(error);
      } else resolve(Buffer.concat(chunks, bytes));
    };
    const timer = setTimeout(() => finish(unavailable()), timeout);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) finish(unavailable());
      else chunks.push(chunk);
    });
    child.stderr.on("data", () => {});
    child.on("error", () => finish(unavailable()));
    child.stdin.on("error", () => finish(unavailable()));
    child.on("close", (code) => finish(code === 0 ? undefined : unavailable()));
    child.stdin.end(input);
  });
}
export async function workspaceProbe<A extends unknown[], T>(
  machine: MachineConfig,
  probe: (...args: A) => Promise<T>,
  args: A,
  timeout = 90000,
  limit = 64 * 1024 * 1024,
): Promise<T> {
  const script = `(${probe.toString()})(...${JSON.stringify(args)}).then(value=>process.stdout.write(JSON.stringify({value}))).catch(error=>process.stdout.write(JSON.stringify({error:/^[A-Z][A-Z0-9_]{1,100}$/.test(error.message)?error.message:'WORKSPACE_OPERATION_FAILED'})));`;
  const bytes = await collectWorkspace(
    spawnWorkspace(machine, ["node", "--no-warnings", "-"]),
    script,
    timeout,
    limit,
  );
  const value = JSON.parse(bytes.toString("utf8"));
  if (value.error)
    throw new HubError(
      409,
      value.error,
      "Операция в серверном окружении не завершена. Проверь её состояние.",
    );
  return value.value;
}
