import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { HubError, type MachineConfig } from "@codex-web/shared";
import { spawnWorkspace, workspaceProbe } from "./serverWorkspace.js";

// All filesystem access below executes in the personal container, never on Hub.
export async function workspaceRead(root: string, path: string, limit: number) {
  const fs = await import("node:fs/promises"),
    p = await import("node:path");
  const actualRoot = await fs.realpath(root),
    actual = await fs.realpath(path);
  const relative = p.relative(actualRoot, actual);
  if (
    actualRoot !== root ||
    actual !== path ||
    !relative ||
    relative === ".." ||
    relative.startsWith("../") ||
    p.isAbsolute(relative)
  )
    throw Error("INVALID_PROJECT_FILE");
  const { constants } = await import("node:fs");
  const file = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > limit) throw Error("INVALID_PROJECT_FILE");
    const data = Buffer.alloc(before.size + 1);
    let size = 0;
    while (size < data.length) {
      const r = await file.read(data, size, data.length - size);
      if (!r.bytesRead) break;
      size += r.bytesRead;
    }
    const after = await file.stat();
    if (
      before.size !== size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw Error("FILE_CHANGED");
    return data.subarray(0, size).toString("base64");
  } finally {
    await file.close();
  }
}
export async function readWorkspaceFile(
  machine: MachineConfig,
  root: string,
  path: string,
  limit: number,
) {
  return Buffer.from(
    await workspaceProbe(
      machine,
      workspaceRead,
      [root, path, limit],
      90000,
      Math.ceil((limit * 4) / 3) + 4096,
    ),
    "base64",
  );
}

export async function stageWorkspaceFile(
  machine: MachineConfig,
  source: string,
  bytes: number,
  sha256: string,
  name = "upload",
) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !/^[a-f0-9]{64}$/.test(sha256))
    throw Error("INVALID_UPLOAD");
  if (
    !name ||
    name === "." ||
    name === ".." ||
    Array.from(name).some((c) => c.charCodeAt(0) < 32 || c === "/" || c === "\\") ||
    name.length > 160
  )
    throw Error("INVALID_UPLOAD");
  const path = `/workspace/home/.codex-web/uploads/${randomUUID()}/${name}`;
  async function receive(path: string, bytes: number, expected: string) {
    const fs = await import("node:fs/promises"),
      streams = await import("node:fs"),
      p = await import("node:path"),
      crypto = await import("node:crypto"),
      stream = await import("node:stream"),
      promises = await import("node:stream/promises");
    const dir = p.dirname(path);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await fs.realpath(dir)) !== dir) throw Error("INVALID_UPLOAD");
    let size = 0;
    const hash = crypto.createHash("sha256");
    try {
      await promises.pipeline(
        process.stdin,
        new stream.Transform({
          transform(chunk: Buffer, _encoding, cb) {
            size += chunk.length;
            hash.update(chunk);
            cb(size > bytes ? Error("UPLOAD_CHANGED") : null, chunk);
          },
        }),
        streams.createWriteStream(path, { flags: "wx", mode: 0o600 }),
      );
      if (size !== bytes || hash.digest("hex") !== expected) throw Error("UPLOAD_CHANGED");
      process.stdout.write("STAGED");
    } catch (error) {
      await fs.unlink(path).catch(() => {});
      throw error;
    }
  }
  const code = `(${receive.toString()})(${JSON.stringify(path)},${bytes},${JSON.stringify(sha256)}).catch(()=>process.exitCode=1);`;
  const child = spawnWorkspace(machine, ["node", "--no-warnings", "-e", code]);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-100);
  });
  child.stderr.on("data", () => {});
  const closed = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 && output === "STAGED"
        ? resolve()
        : reject(
            new HubError(503, "UPLOAD_FAILED", "Не удалось передать файл в серверное окружение."),
          ),
    );
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 1800000);
  try {
    await Promise.all([pipeline(createReadStream(source), child.stdin), closed]);
    return path;
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}

// Bounded streaming export. The caller verifies this receipt against received bytes.
export const workspaceTransferScript = `import os,sys,hashlib,stat
root,path,limit=sys.argv[1],sys.argv[2],int(sys.argv[3])
assert os.path.realpath(root)==root and os.path.realpath(path)==path
assert os.path.commonpath([root,path])==root and path!=root
fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
try:
 before=os.fstat(fd);assert stat.S_ISREG(before.st_mode) and before.st_size<=limit
 h=hashlib.sha256();size=0
 while True:
  data=os.read(fd,65536)
  if not data:break
  size+=len(data);assert size<=limit;h.update(data);sys.stdout.buffer.write(data)
 after=os.fstat(fd);assert size==before.st_size and (before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_size,after.st_mtime_ns,after.st_ctime_ns)
 sys.stdout.buffer.flush();print('CWFILE '+str(size)+' '+h.hexdigest(),file=sys.stderr)
finally:os.close(fd)
`;
