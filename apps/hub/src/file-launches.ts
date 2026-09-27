import { createHash, randomUUID } from "node:crypto";
import { win32 } from "node:path";
import { authorizeMachine, fileLaunchMessage, runFileLaunch } from "@codex-web/machines";
import {
  type FileLaunchOperation,
  type FileLaunchPrepared,
  fileLaunchReceiptSchema,
  HubError,
  runnableFile,
} from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sessions } from "./sessions.js";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const fail = (code: string) => new HubError(409, code, fileLaunchMessage(code));
type Prepared = FileLaunchPrepared & { binding: string; source: string; artifactId?: string };
export function registerFileLaunches(
  app: FastifyInstance,
  sessions: Sessions,
  probe = runFileLaunch,
) {
  const db = sessions.store.db,
    busy = new Map<string, Promise<FileLaunchOperation>>();
  db.exec(`CREATE TABLE IF NOT EXISTS file_launch_preparations(id TEXT PRIMARY KEY,value TEXT NOT NULL,createdAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS file_launch_operations(id TEXT PRIMARY KEY,value TEXT NOT NULL,createdAt INTEGER NOT NULL);`);
  const context = (id: string) => {
    sessions.authorizeExecution();
    const project = sessions.project(id),
      machine = sessions.catalog.machine(project.machineId);
    const entry = sessions.catalog.library.get("project", id);
    if (project.unassigned || entry?.deleted || entry?.archived || machine.type !== "ssh-windows")
      throw fail("LAUNCH_PATH");
    authorizeMachine(machine);
    return { project, machine, binding: hash([project.id, project.workingDirectory, machine]) };
  };
  const bound = (p: Prepared) => {
    const c = context(p.projectId);
    if (p.binding !== c.binding) throw fail("LAUNCH_PATH");
    if (p.artifactId) {
      const row = db
        .prepare(
          "SELECT a.threadId,f.sha256 FROM artifacts a JOIN artifact_files f ON f.id=a.id WHERE a.id=?",
        )
        .get(p.artifactId);
      if (!row || sessions.thread(String(row.threadId)).projectId !== p.projectId)
        throw fail("LAUNCH_PATH");
    }
    return c;
  };
  const prepared = (id: string): Prepared => {
    const row = db.prepare("SELECT value FROM file_launch_preparations WHERE id=?").get(id);
    if (!row) throw fail("LAUNCH_EXPIRED");
    const p = JSON.parse(String(row.value)) as Prepared;
    bound(p);
    return p;
  };
  const publicPrepared = ({ binding: _, source: __, artifactId: ___, ...p }: Prepared) => p;
  const get = (id: string): FileLaunchOperation => {
    const row = db.prepare("SELECT value FROM file_launch_operations WHERE id=?").get(id);
    if (!row) throw fail("LAUNCH_MISSING");
    return JSON.parse(String(row.value));
  };
  const save = (v: FileLaunchOperation) => {
    db.prepare(
      "INSERT INTO file_launch_operations VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    ).run(v.id, JSON.stringify(v), Date.now());
    return v;
  };
  app.post("/api/file-launches/prepare", async (req) => {
    const { source } = z
      .object({ source: z.string().max(4096) })
      .strict()
      .parse(req.body);
    let projectId: string,
      path: string,
      expected: string | undefined,
      artifactId: string | undefined;
    const artifact = source.match(/^\/api\/artifacts\/([a-f0-9-]{36})$/i);
    const working = source.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/files\/content\?([^#]+)$/);
    if (artifact) {
      artifactId = artifact[1]!;
      const row = db
        .prepare(
          "SELECT a.threadId,f.sourcePath,f.sha256 FROM artifacts a JOIN artifact_files f ON f.id=a.id WHERE a.id=?",
        )
        .get(artifactId);
      if (!row) throw fail("LAUNCH_PATH");
      projectId = sessions.thread(String(row.threadId)).projectId;
      path = String(row.sourcePath);
      expected = String(row.sha256);
    } else if (working) {
      const q = new URLSearchParams(working[2]);
      if (q.size !== 1 || !q.has("path")) throw fail("LAUNCH_PATH");
      projectId = working[1]!;
      path = q.get("path")!;
    } else throw fail("LAUNCH_PATH");
    const c = context(projectId),
      root = win32.resolve(c.project.workingDirectory);
    if (artifact) {
      if (!win32.isAbsolute(path)) throw fail("LAUNCH_PATH");
      path = win32.relative(root, path);
    }
    path = path.replaceAll("\\", "/");
    if (
      !path ||
      win32.isAbsolute(path) ||
      path.split("/").some((p) => !p || p === "." || p === "..") ||
      !runnableFile(path)
    )
      throw fail("LAUNCH_PATH");
    const inspected = z
      .object({
        path: z.string(),
        handler: z.enum(["exe", "cmd", "ps1"]),
        sha256: sha,
        bytes: z.number().int().nonnegative(),
      })
      .parse(await probe(c.machine, root, { op: "prepare", path }));
    if (inspected.path !== path || context(projectId).binding !== c.binding)
      throw fail("LAUNCH_PATH");
    const provenance = artifactId
      ? db
          .prepare("SELECT root,machineBinding FROM artifact_source_bindings WHERE id=?")
          .get(artifactId)
      : undefined;
    const unverified =
      !!artifactId &&
      (!provenance ||
        win32.resolve(String(provenance.root)).toLowerCase() !== root.toLowerCase() ||
        provenance.machineBinding !== hash(c.machine));
    const p: Prepared = {
      ...inspected,
      id: randomUUID(),
      projectId,
      projectName: c.project.name,
      machineId: c.machine.id,
      machineName: c.machine.name,
      remoteAvailable: !!c.machine.remote,
      unverified,
      changed: !!expected && expected !== inspected.sha256,
      expiresAt: Date.now() + 5 * 60000,
      binding: c.binding,
      source,
      ...(artifactId ? { artifactId } : {}),
    };
    // Keep preparation metadata bounded; never discard a preparation with a launch receipt.
    db.prepare(
      "DELETE FROM file_launch_preparations WHERE createdAt<? AND id NOT IN (SELECT json_extract(value,'$.prepared.id') FROM file_launch_operations)",
    ).run(Date.now() - 86400000);
    if (Number(db.prepare("SELECT count(*) n FROM file_launch_preparations").get()?.n) >= 10000)
      throw fail("LAUNCH_CAPACITY");
    db.prepare("INSERT INTO file_launch_preparations VALUES(?,?,?)").run(
      p.id,
      JSON.stringify(p),
      Date.now(),
    );
    return publicPrepared(p);
  });
  app.put("/api/file-launches/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { preparedId } = z.object({ preparedId: z.string().uuid() }).strict().parse(req.body);
    const p = prepared(preparedId),
      c = bound(p);
    const row = db.prepare("SELECT value FROM file_launch_operations WHERE id=?").get(id);
    if (row) {
      const old = get(id);
      if (old.prepared.id !== p.id) throw fail("LAUNCH_KEY_REUSED");
      return busy.get(id) ?? old;
    }
    if (p.expiresAt < Date.now()) throw fail("LAUNCH_EXPIRED");
    if (p.changed || p.unverified) throw fail("LAUNCH_CHANGED");
    if (busy.size >= 2) throw fail("LAUNCH_BUSY");
    if (Number(db.prepare("SELECT count(*) n FROM file_launch_operations").get()?.n) >= 10000)
      throw fail("LAUNCH_CAPACITY");
    const old = save({ id, state: "unknown", prepared: publicPrepared(p) });
    // Durable receipt BEFORE dispatch; repeats and reads never dispatch this operation again.
    const task = (async () => {
      try {
        bound(p);
        const v = fileLaunchReceiptSchema.parse(
          await probe(c.machine, c.project.workingDirectory, {
            op: "start",
            id,
            path: p.path,
            sha256: p.sha256,
            bytes: p.bytes,
            expiresAt: Date.now() + 30000,
          }),
        );
        bound(p);
        if (v.id !== id) throw fail("LAUNCH_UNKNOWN");
        return save({ ...old, code: undefined, ...v });
      } catch (e) {
        const code =
          e instanceof HubError &&
          [
            "LAUNCH_CHANGED",
            "LAUNCH_POLICY",
            "LAUNCH_PATH",
            "LAUNCH_FORMAT",
            "LAUNCH_EXPIRED",
            "LAUNCH_BUSY",
            "LAUNCH_CAPACITY",
          ].includes(e.code)
            ? e.code
            : "LAUNCH_UNKNOWN";
        return save({ ...old, state: code === "LAUNCH_UNKNOWN" ? "unknown" : "failed", code });
      }
    })();
    busy.set(id, task);
    reply.code(202);
    try {
      return await task;
    } finally {
      busy.delete(id);
    }
  });
  app.get("/api/file-launches/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
      old = get(id);
    const p = prepared(old.prepared.id),
      c = bound(p);
    if (busy.has(id)) return busy.get(id);
    if (["exited", "failed"].includes(old.state)) return old;
    const task = (async () => {
      const receipt = fileLaunchReceiptSchema.parse(
        await probe(c.machine, c.project.workingDirectory, { op: "status", id }),
      );
      bound(p);
      if (receipt.id !== id) throw fail("LAUNCH_UNKNOWN");
      return save({ ...old, code: undefined, ...receipt });
    })();
    busy.set(id, task);
    try {
      return await task;
    } finally {
      busy.delete(id);
    }
  });
  app.addHook("preClose", async () => {
    await Promise.allSettled(busy.values());
  });
}
