// Private per-Windows-user mailbox. Only typed exact-file operations; no network listener.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), cp = require("node:child_process");
const home = path.join(process.env.LOCALAPPDATA || "", "CodexWeb", "file-launch"), state = path.join(home, "state");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail = code => { throw Error(code); };
function target(root, relative) {
  if (typeof root !== "string" || !/^[a-z]:[\\/]/i.test(root) || root.length > 2048 || /[\x00-\x1f"<>|?*]/.test(root) || root.slice(2).includes(":")) fail("LAUNCH_PATH");
  if (typeof relative !== "string" || relative.length > 2048 || /[\\:\x00-\x1f"<>|?*]/.test(relative) || relative.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p))) fail("LAUNCH_PATH");
  const ext = path.win32.extname(relative).toLowerCase(), handler = ext === ".exe" ? "exe" : ext === ".ps1" ? "ps1" : [".cmd", ".bat"].includes(ext) ? "cmd" : null;
  if (!handler) fail("LAUNCH_FORMAT");
  const file = path.win32.resolve(root, relative);
  if (handler === "cmd" && /[%!&^()]/.test(file)) fail("LAUNCH_PATH");
  return { file, handler };
}
function inspect(root, relative) {
  const { file, handler } = target(root, relative);
  if (handler === "ps1") {
    const env = { ...process.env }; delete env.PSExecutionPolicyPreference;
    const policy = cp.execFileSync(path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Get-ExecutionPolicy"], { env, windowsHide: true, timeout: 10000, encoding: "utf8" }).trim();
    if (policy === "Restricted" || policy === "Undefined") fail("LAUNCH_POLICY");
  }
  let cursor = file;
  while (true) {
    const s = fs.lstatSync(cursor); if (s.isSymbolicLink()) fail("LAUNCH_PATH");
    const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent;
  }
  if (fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()) fail("LAUNCH_PATH");
  const fd = fs.openSync(file, "r"), hash = crypto.createHash("sha256"), buffer = Buffer.alloc(1048576);
  try {
    const before = fs.fstatSync(fd); if (!before.isFile()) fail("LAUNCH_PATH");
    let n, bytes = 0;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) {
      if (!bytes && handler === "exe" && buffer.subarray(0, 2).toString() !== "MZ") fail("LAUNCH_FORMAT");
      hash.update(buffer.subarray(0, n)); bytes += n;
    }
    const after = fs.fstatSync(fd);
    if (!bytes || before.size !== bytes || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail("LAUNCH_CHANGED");
    return { path: relative, handler, bytes, sha256: hash.digest("hex") };
  } finally { fs.closeSync(fd); }
}
function file(id, suffix) { if (!uuid.test(id)) fail("LAUNCH_PATH"); return path.join(state, id + suffix); }
function read(id, suffix) { try { return JSON.parse(fs.readFileSync(file(id, suffix), "utf8")); } catch(e) { if (e.code === "ENOENT") return null; throw e; } }
function publish(id, suffix, value) {
  const temp = file(id, "." + crypto.randomUUID() + ".tmp"), fd = fs.openSync(temp, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.linkSync(temp, file(id, suffix)); return true; } catch(e) { if (e.code !== "EEXIST") throw e; return false; } finally { fs.unlinkSync(temp); }
}
function receipt(record) {
  const p = read(record.id, ".progress.json");
  if (p) {
    if (["running", "launching"].includes(p.state) && Date.now() - p.updatedAt > 15000) return { id: record.id, state: "unknown", code: "LAUNCH_UNKNOWN", ...(p.pid ? { pid: p.pid } : {}) };
    const { updatedAt, ...v } = p; return { ...v, id: record.id };
  }
  if (Date.now() > record.expiresAt) return { id: record.id, state: "unknown", code: "LAUNCH_EXPIRED" };
  return { id: record.id, state: read(record.id, ".claim.json") ? "launching" : "queued" };
}
function load(id, root) { const v = read(id, ".request.json"); if (!v || path.win32.resolve(v.root).toLowerCase() !== path.win32.resolve(root).toLowerCase()) fail("LAUNCH_MISSING"); return v; }
async function request(input) {
  if (!input || Object.keys(input).some(k => !["root", "request"].includes(k))) fail("LAUNCH_PATH");
  const q = input.request;
  if (!q || !["prepare", "start", "status"].includes(q.op) || Object.keys(q).some(k => !["op", "id", "path", "sha256", "bytes", "expiresAt"].includes(k))) fail("LAUNCH_PATH");
  if (q.op === "prepare") return inspect(input.root, q.path);
  if (!uuid.test(q.id)) fail("LAUNCH_PATH");
  if (q.op === "status") return receipt(load(q.id, input.root));
  target(input.root, q.path);
  if (!/^[a-f0-9]{64}$/.test(q.sha256) || !Number.isSafeInteger(q.bytes) || q.bytes < 1 || !Number.isSafeInteger(q.expiresAt)) fail("LAUNCH_PATH");
  const identity = crypto.createHash("sha256").update(JSON.stringify([input.root, q.path, q.sha256, q.bytes])).digest("hex");
  fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const previous = read(q.id, ".request.json");
  if (previous) { if (identity !== previous.identity) fail("LAUNCH_KEY_REUSED"); return receipt(previous); }
  if (q.expiresAt < Date.now() || q.expiresAt > Date.now() + 60000) fail("LAUNCH_EXPIRED");
  if (fs.readdirSync(state).filter(n => n.endsWith(".request.json")).length >= 10000) fail("LAUNCH_CAPACITY");
  const v = inspect(input.root, q.path);
  if (v.sha256 !== q.sha256 || v.bytes !== q.bytes) fail("LAUNCH_CHANGED");
  const record = { id: q.id, root: input.root, path: q.path, sha256: q.sha256, bytes: q.bytes, handler: v.handler, identity, expiresAt: q.expiresAt };
  if (!publish(q.id, ".request.json", record)) return request(input);
  try { cp.execFileSync(path.join(process.env.WINDIR, "System32", "schtasks.exe"), ["/Run", "/TN", "CodexWebFileLaunch"], { timeout: 8000, windowsHide: true, stdio: "ignore" }); }
  catch { publish(q.id, ".progress.json", { state: "unknown", code: "LAUNCH_UNKNOWN", updatedAt: Date.now() }); }
  return receipt(record);
}
async function work() {
  fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const children = new Set(); let last = Date.now();
  while (Date.now() - last < 60000) {
    for (const name of fs.readdirSync(state).filter(n => n.endsWith(".request.json") && uuid.test(n.slice(0, -13))).slice(-10000)) {
      const r = read(name.slice(0, -13), ".request.json");
      if (!r || read(r.id, ".claim.json") || read(r.id, ".progress.json")) continue;
      if (!publish(r.id, ".claim.json", { at: Date.now() })) continue;
      if (r.expiresAt < Date.now() || children.size >= 4) { publish(r.id, ".progress.json", { state: "failed", code: r.expiresAt < Date.now() ? "LAUNCH_EXPIRED" : "LAUNCH_BUSY", updatedAt: Date.now() }); continue; }
      const child = cp.spawn(path.join(process.env.WINDIR, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "NativeFileLaunch.ps1"), "-OperationId", r.id], { windowsHide: true, stdio: "ignore" });
      children.add(child); last = Date.now();
      child.on("error", () => {}); child.on("close", () => children.delete(child));
    }
    if (children.size) last = Date.now();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
module.exports = { target, inspect, request, receipt };
if (require.main === module) {
  if (process.argv[2] === "work") work().catch(() => process.exitCode = 1);
  else if (process.argv[2] === "request") {
    let text = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", b => { text += b; if (text.length > 16384) process.exit(2); });
    process.stdin.on("end", async () => { try { process.stdout.write(JSON.stringify({ ok: true, value: await request(JSON.parse(text)) })); } catch(e) { process.stdout.write(JSON.stringify({ ok: false, code: /^LAUNCH_[A-Z_]+$/.test(e.message) ? e.message : "LAUNCH_UNAVAILABLE" })); } });
  }
}
