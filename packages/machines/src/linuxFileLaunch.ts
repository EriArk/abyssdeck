import type { FileLaunchRequest, FileLaunchResponse } from "@codex-web/shared";

/** Serialized fixed worker. systemd starts programs in the user's graphical session. */
export async function linuxFileLaunch(
  root: string,
  request: FileLaunchRequest,
): Promise<FileLaunchResponse> {
  const fs = await import("node:fs/promises"),
    p = await import("node:path"),
    os = await import("node:os"),
    crypto = await import("node:crypto"),
    child = await import("node:child_process");
  const run = (command: string, args: string[]) =>
    new Promise<string>((resolve, reject) => {
      child.execFile(command, args, { timeout: 15000, maxBuffer: 65536 }, (error, stdout) => {
        if (error) reject(Error("LAUNCH_UNAVAILABLE"));
        else resolve(stdout);
      });
    });
  const base = p.join(os.homedir(), ".local/state/codex-web/file-launch");
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  if ((await fs.realpath(base)) !== base || (await fs.realpath(root)) !== root)
    throw Error("LAUNCH_PATH");
  const readReceipt = async (id: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("LAUNCH_PATH");
    try {
      return JSON.parse(await fs.readFile(p.join(base, id + ".json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const status = async (id: string, receipt: { root: string }) => {
    if (receipt.root !== root) throw Error("LAUNCH_KEY_REUSED");
    const output = await run("systemctl", [
      "--user",
      "show",
      "abyssdeck-launch-" + id + ".service",
      "--property=LoadState,ActiveState,SubState,MainPID,ExecMainStatus",
    ]);
    const value = Object.fromEntries(
      output
        .trim()
        .split("\n")
        .map((line) => line.split("=")),
    );
    if (value.LoadState === "not-found")
      return { id, state: "unknown" as const, code: "LAUNCH_UNKNOWN" };
    if (value.ActiveState === "failed")
      return { id, state: "failed" as const, exitCode: Number(value.ExecMainStatus) };
    if (value.SubState === "exited" || value.ActiveState === "inactive")
      return { id, state: "exited" as const, exitCode: Number(value.ExecMainStatus) };
    return {
      id,
      state: "running" as const,
      ...(Number(value.MainPID) > 0 ? { pid: Number(value.MainPID) } : {}),
    };
  };
  if (request.op === "status") {
    const receipt = await readReceipt(request.id);
    if (!receipt) throw Error("LAUNCH_MISSING");
    return status(request.id, receipt);
  }
  if (request.op === "start") {
    const previous = await readReceipt(request.id);
    if (previous) {
      if (
        previous.path !== request.path ||
        previous.sha256 !== request.sha256 ||
        previous.bytes !== request.bytes
      )
        throw Error("LAUNCH_KEY_REUSED");
      return status(request.id, previous);
    }
    if (!Number.isFinite(request.expiresAt) || request.expiresAt < Date.now())
      throw Error("LAUNCH_EXPIRED");
  }
  if (
    !request.path ||
    p.isAbsolute(request.path) ||
    request.path.split("/").some((s) => !s || s === "." || s === "..") ||
    /[\0\r\n]/.test(request.path)
  )
    throw Error("LAUNCH_PATH");
  const path = p.join(root, request.path);
  if ((await fs.realpath(path)) !== path) throw Error("LAUNCH_PATH");
  const extension = p.extname(path).toLowerCase();
  const handler =
    extension === ".sh"
      ? "sh"
      : extension === ".appimage"
        ? "appimage"
        : extension === ".desktop"
          ? "desktop"
          : extension === ".py"
            ? "python"
            : null;
  if (!handler) throw Error("LAUNCH_FORMAT");
  const file = await fs.open(
    path,
    (await import("node:fs")).constants.O_RDONLY | (await import("node:fs")).constants.O_NOFOLLOW,
  );
  let bytes: number, sha256: string;
  try {
    const before = await file.stat();
    if (!before.isFile()) throw Error("LAUNCH_PATH");
    if (handler === "appimage" && !(before.mode & 0o111)) throw Error("LAUNCH_FORMAT");
    const hash = crypto.createHash("sha256");
    for await (const data of file.createReadStream({ autoClose: false })) hash.update(data);
    const after = await file.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw Error("LAUNCH_CHANGED");
    bytes = before.size;
    sha256 = hash.digest("hex");
  } finally {
    await file.close();
  }
  if (request.op === "prepare") return { path: request.path, handler, sha256, bytes };
  if (request.bytes !== bytes || request.sha256 !== sha256) throw Error("LAUNCH_CHANGED");
  if ((await fs.readdir(base)).length >= 10000) throw Error("LAUNCH_CAPACITY");
  const receipt = { ...request, root };
  let intent: import("node:fs/promises").FileHandle;
  try {
    intent = await fs.open(p.join(base, request.id + ".json"), "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readReceipt(request.id);
    if (
      existing.root !== root ||
      existing.path !== request.path ||
      existing.sha256 !== sha256 ||
      existing.bytes !== bytes
    )
      throw Error("LAUNCH_KEY_REUSED");
    return status(request.id, existing);
  }
  try {
    await intent.writeFile(JSON.stringify(receipt));
    await intent.sync();
  } finally {
    await intent.close();
  }
  const argv =
    handler === "sh"
      ? ["/bin/bash", path]
      : handler === "python"
        ? ["/usr/bin/python3", path]
        : handler === "desktop"
          ? ["/usr/bin/gio", "launch", path]
          : [path];
  await run("systemd-run", [
    "--user",
    "--quiet",
    "--unit=abyssdeck-launch-" + request.id,
    "--property=Type=exec",
    "--property=RemainAfterExit=yes",
    "--working-directory=" + p.dirname(path),
    "--",
    ...argv,
  ]);
  return status(request.id, receipt);
}
