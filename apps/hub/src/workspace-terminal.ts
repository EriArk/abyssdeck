import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { spawnWorkspace, stopProcess } from "@codex-web/machines";
import { type DeviceConfig, type HubConfig, HubError, type MachineConfig } from "@codex-web/shared";
import type { IPty } from "node-pty";
import { shellTracking } from "./terminal-activity.js";

export function workspaceDevice(
  config: HubConfig,
  device: DeviceConfig,
): MachineConfig | undefined {
  if (!device.workspaceMachineId) return;
  const machine = config.machines.find(
    (m) => m.id === device.workspaceMachineId && m.type === "server-workspace",
  );
  if (!machine)
    throw new HubError(403, "WORKSPACE_DEVICE_UNAVAILABLE", "Серверное окружение недоступно.");
  return machine;
}
// Runs inside the admitted container. Wire frames are never written into shell history.
export const workspacePtyScript = `import os,sys,pty,select,json,base64,fcntl,termios,struct,signal,tempfile
rc=tempfile.NamedTemporaryFile(mode='w',delete=False,dir='/tmp');rc.write(base64.b64decode(sys.argv[1]).decode());rc.close()
pid,fd=pty.fork()
if pid==0:
 os.environ['TERM']='xterm-256color';os.environ['LANG']='C.UTF-8'
 os.execvp('bash',['bash','--rcfile',rc.name,'-i'])
pending=b''
try:
 while True:
  ready,_,_=select.select([0,fd],[],[])
  if fd in ready:
   try:data=os.read(fd,16384)
   except OSError:break
   if not data:break
   print(json.dumps({'data':base64.b64encode(data).decode()}),flush=True)
  if 0 in ready:
   data=os.read(0,16384)
   if not data:break
   pending+=data
   if len(pending)>65536:raise RuntimeError('FRAME_LIMIT')
   while b'\\n' in pending:
    line,pending=pending.split(b'\\n',1);v=json.loads(line)
    if v.get('type')=='input':
     raw=base64.b64decode(v['data'],validate=True)
     if len(raw)>4096:raise RuntimeError('INPUT_LIMIT')
     while raw:raw=raw[os.write(fd,raw):]
    elif v.get('type')=='resize':
     cols,rows=v['cols'],v['rows']
     if type(cols)!=int or type(rows)!=int or not 2<=cols<=300 or not 2<=rows<=150:raise RuntimeError('SIZE_INVALID')
     fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,0,0))
    else:raise RuntimeError('FRAME_INVALID')
finally:
 os.close(fd);os.unlink(rc.name)
 try:os.killpg(pid,signal.SIGHUP)
 except ProcessLookupError:pass
`;
export function spawnWorkspaceTerminal(machine: MachineConfig, token: string): IPty {
  const child = spawnWorkspace(
    machine,
    [
      "python3",
      "-u",
      "-c",
      workspacePtyScript,
      Buffer.from(shellTracking(token, "linux")).toString("base64"),
    ],
    "/workspace",
  );
  const events = new EventEmitter(),
    decoder = new StringDecoder("utf8");
  let pending = "",
    closed = false;
  const finish = (exitCode: number) => {
    if (!closed) {
      closed = true;
      events.emit("exit", { exitCode, signal: 0 });
    }
  };
  child.stdout.on("data", (chunk) => {
    pending += chunk.toString("utf8");
    if (pending.length > 131072) {
      stopProcess(child);
      return;
    }
    while (pending.includes("\n")) {
      const at = pending.indexOf("\n");
      const line = pending.slice(0, at);
      pending = pending.slice(at + 1);
      try {
        const value = JSON.parse(line);
        if (typeof value.data !== "string" || value.data.length > 24000) throw Error();
        events.emit("data", decoder.write(Buffer.from(value.data, "base64")));
      } catch {
        stopProcess(child);
      }
    }
  });
  child.stderr.on("data", () => {});
  child.on("error", () => finish(1));
  child.stdin.on("error", () => finish(1));
  child.on("close", (code) => finish(code ?? 1));
  const send = (value: object) => {
    if (closed) return;
    if (child.stdin.writableLength > 65536) {
      stopProcess(child);
      return;
    }
    child.stdin.write(JSON.stringify(value) + "\n");
  };
  const on = <T>(name: string, fn: (value: T) => void) => {
    events.on(name, fn);
    return {
      dispose: () => {
        events.off(name, fn);
      },
    };
  };
  return {
    pid: child.pid ?? 0,
    cols: 100,
    rows: 30,
    process: "bash",
    handleFlowControl: false,
    onData: (fn) => on("data", fn),
    onExit: (fn) => on("exit", fn),
    write: (data) => send({ type: "input", data: Buffer.from(data).toString("base64") }),
    resize: (cols, rows) => send({ type: "resize", cols, rows }),
    kill: () => stopProcess(child),
    pause: () => child.stdout.pause(),
    resume: () => child.stdout.resume(),
    clear: () => {},
  } as IPty;
}
