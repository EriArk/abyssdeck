import { spawn } from "node:child_process";
import { posix } from "node:path";
import { HubError, type MachineConfig } from "@codex-web/shared";
import { authorizeMachine } from "./authority.js";
import { collectWorkspace, spawnWorkspace, workspaceProbe } from "./serverWorkspace.js";

export function quoteShell(value: string) {
  if (/\0/u.test(value)) throw new HubError(400, "INVALID_COMMAND_VALUE", "Invalid shell argument");
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function linuxSshCommand(machine: MachineConfig, argv: readonly string[], cwd = "/") {
  authorizeMachine(machine);
  if (machine.type !== "ssh-linux" || !machine.ssh || !cwd.startsWith("/") || !argv.length)
    throw new HubError(503, "SSH_NOT_CONFIGURED", "Linux SSH target is not configured");
  const node = machine.codex.activityNode;
  const command = argv[0] === "node" && node ? [node, ...argv.slice(1)] : argv;
  const directories = [node, machine.codex.command]
    .filter((path): path is string => !!path?.startsWith("/"))
    .map((path) => posix.dirname(path));
  const path = directories.length ? `${directories.join(":")}:` : "";
  const script = `cd -- ${quoteShell(cwd)} && export PATH=${quoteShell(path)}"$HOME/.local/bin:$PATH" && exec ${command.map(quoteShell).join(" ")}`;
  return [
    ...(machine.ssh.configFile ? ["-F", machine.ssh.configFile] : []),
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
    machine.ssh.target,
    "sh -c " + quoteShell(script),
  ];
}

export function spawnRemote(machine: MachineConfig, argv: readonly string[], cwd?: string) {
  if (machine.type === "server-workspace") return spawnWorkspace(machine, argv, cwd);
  return spawn("ssh", linuxSshCommand(machine, argv, cwd), {
    stdio: "pipe",
    detached: process.platform !== "win32",
    windowsHide: true,
  });
}

/** Fixed probes execute on the selected Linux machine, never in the Hub process. */
export async function remoteProbe<A extends unknown[], T>(
  machine: MachineConfig,
  probe: (...args: A) => Promise<T>,
  args: A,
  timeout = 90000,
  limit = 64 * 1024 * 1024,
): Promise<T> {
  if (machine.type === "server-workspace")
    return workspaceProbe(machine, probe, args, timeout, limit);
  const program = `(${probe.toString()})(...${JSON.stringify(args)}).then(value=>process.stdout.write(JSON.stringify({value}))).catch(error=>process.stdout.write(JSON.stringify({error:/^[A-Z][A-Z0-9_]{1,100}$/.test(error.code||error.message)?(error.code||error.message):'REMOTE_OPERATION_FAILED'})));`;
  const bytes = await collectWorkspace(
    spawnRemote(machine, ["node", "--no-warnings", "-"]),
    program,
    timeout,
    limit,
  );
  const reply = JSON.parse(bytes.toString("utf8"));
  if (reply.error)
    throw new HubError(
      409,
      reply.error,
      "Операция на компьютере не завершена. Проверь её состояние.",
    );
  return reply.value;
}
