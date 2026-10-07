import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import {
  codexArtifactPath,
  copyCodexArtifact,
  PREVIEW_LIMIT,
  previewPath,
  readMachinePreview,
  readMachinePreviewAsset,
} from "@codex-web/machines";
import { HubError, type MachineConfig, visualizationReferences } from "@codex-web/shared";
import type { Artifacts } from "./artifacts.js";
import { bundlePreview } from "./preview-bundle.js";
import { previewImages } from "./preview-images.js";
import { previewControls } from "./previewControls.js";
import { previewIcons } from "./previewIcons.js";
import type { Store, ThreadRecord } from "./store.js";

export const previewFrameSources = (origin: string) => [
  origin.replace(/\/$/, "") + "/api/previews/",
  origin.replace(/\/$/, "") + "/api/gpt/previews/",
  origin.replace(/\/$/, "") + "/api/team/result-shares/",
];
export function assertPreviewFrame(headers: Record<string, unknown>) {
  if (headers["sec-fetch-dest"] !== "iframe" || headers["sec-fetch-site"] !== "same-origin")
    throw new HubError(403, "PREVIEW_FRAME_REQUIRED", "Открой демо из результатов.");
}
export const previewCsp =
  "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";
export function previewMarkup(html: string): string {
  const icons = previewIcons(html);
  return (
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;}body{padding:12px;box-sizing:border-box;background:#fff;color:#202624}</style>' +
    previewControls +
    icons.before +
    html +
    icons.after
  );
}
type Source = { title: string; path?: string; html?: string; captureId?: string };
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

export function previewSources(item: Record<string, unknown>): Source[] {
  const sources: Source[] = [];
  if (item.type === "fileChange" && Array.isArray(item.changes))
    for (const change of item.changes) {
      const path = text(obj(change).path);
      if (
        /\.html?$/i.test(path) &&
        !["delete", "remove"].includes(text(obj(obj(change).kind).type) || text(obj(change).kind))
      )
        sources.push({ path, title: path.split(/[\\/]/).at(-1) || "Демо" });
    }
  if (item.type === "mcpToolCall" && Array.isArray(obj(item.result).content)) {
    for (const block of obj(item.result).content as unknown[]) {
      const resource = obj(obj(block).resource);
      if (
        obj(block).type === "resource" &&
        text(resource.mimeType).split(";")[0] === "text/html" &&
        typeof resource.text === "string"
      )
        sources.push({ title: "Интерактивное демо", html: resource.text });
    }
  }
  if (item.type === "agentMessage") {
    const body = text(item.text);
    for (const reference of visualizationReferences(body))
      sources.push({ title: reference.path.split(/[\\/]/).at(-1) || "Демо", path: reference.path });
    for (const match of body.matchAll(
      /(?:^|\n)(?:\x60{3}|~{3})html[ \t]*\r?\n([\s\S]*?)\r?\n(?:\x60{3}|~{3})(?=\s|$)/gi,
    ))
      if (/<(?:html|div|main|section|body|canvas|svg)\b/i.test(match[1] ?? ""))
        sources.push({ title: "Интерактивное демо", html: match[1] });
    // Markdown links produced by Codex; external URLs are intentionally not local previews.
    for (const match of body.matchAll(/\[([^\]\n]{1,200})\]\((?:<([^>\n]+)>|([^\s)]+))\)/g)) {
      const path = (match[2] || match[3] || "").replace(/:\d+(?::\d+)?$/, "");
      if (/\.html?$/i.test(path) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(path))
        sources.push({ title: match[1] || "Демо", path });
    }
  }
  return sources.slice(0, 8);
}
export class Previews {
  private pending = new Map<string, Promise<string>>();
  constructor(
    readonly root: string,
    readonly store: Store,
    private target: (threadId: string) => { machine: MachineConfig; root: string },
    private captured?: (id: string) => Promise<Buffer>,
    private artifacts?: Artifacts,
  ) {}
  inline(scope: string, itemId: string, html: string): string | undefined {
    if (!html || Buffer.byteLength(html) > PREVIEW_LIMIT) return;
    const source = { title: "Интерактивное демо", html };
    const id = createHash("sha256")
      .update(JSON.stringify([scope, itemId, source]))
      .digest("hex");
    if (
      !this.store.db.prepare("SELECT 1 FROM html_previews WHERE id=?").get(id) &&
      Number(this.store.db.prepare("SELECT count(*) AS n FROM html_previews").get()?.n) >= 2000
    )
      return;
    this.store.db
      .prepare("INSERT OR IGNORE INTO html_previews VALUES(?,?,?,?)")
      .run(id, scope, JSON.stringify(source), new Date().toISOString());
    return id;
  }
  observe(thread: ThreadRecord, turnId: string | null, item: Record<string, unknown>): string[] {
    const results: string[] = [];
    for (const source of previewSources(item)) {
      if (source.html && Buffer.byteLength(source.html) > PREVIEW_LIMIT) continue;
      try {
        if (source.path) {
          const target = this.target(thread.id);
          if (item.type === "agentMessage" && this.captured) {
            source.path = codexArtifactPath(target.machine, target.root, source.path);
            source.captureId = createHash("sha256")
              .update(JSON.stringify([thread.id, turnId, item.id, source.path]))
              .digest("hex");
          } else source.path = previewPath(target.machine, target.root, source.path);
        }
      } catch {
        continue;
      }
      const id = createHash("sha256")
        .update(JSON.stringify([thread.id, item.id, source]))
        .digest("hex");
      const old = this.store.db.prepare("SELECT 1 FROM html_previews WHERE id=?").get(id);
      if (
        !old &&
        Number(this.store.db.prepare("SELECT count(*) AS n FROM html_previews").get()?.n) >= 2000
      )
        continue;
      this.store.db
        .prepare("INSERT OR IGNORE INTO html_previews VALUES(?,?,?,?)")
        .run(id, thread.id, JSON.stringify(source), new Date().toISOString());
      const result = this.store.result(
        thread.id,
        turnId,
        "html:" + id,
        "preview",
        source.title.slice(0, 200),
        { url: "/api/previews/" + id, ...(source.path ? { sourcePath: source.path } : {}) },
      );
      if (result) results.push(result);
    }
    return results;
  }
  thread(id: string): string {
    const row = this.store.db.prepare("SELECT threadId FROM html_previews WHERE id=?").get(id);
    if (!row) throw new HubError(404, "PREVIEW_NOT_FOUND", "Демо не найдено.");
    return String(row.threadId);
  }
  async document(id: string, interactive = false): Promise<string> {
    const row = this.store.db.prepare("SELECT * FROM html_previews WHERE id=?").get(id);
    if (!row) throw new HubError(404, "PREVIEW_NOT_FOUND", "Демо не найдено.");
    const cacheKey = id + (interactive && this.artifacts ? ".interactive" : "");
    const pending = this.pending.get(cacheKey);
    if (pending) return pending;
    if (this.pending.size >= 4)
      throw new HubError(429, "PREVIEW_BUSY", "Другое демо ещё загружается.");
    const action = (async () => {
      const file = join(this.root, cacheKey + ".html");
      let html: string;
      try {
        html = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const source = JSON.parse(String(row.source)) as Source;
        const bytes =
          source.captureId && this.captured
            ? await this.captured(source.captureId)
            : source.html
              ? Buffer.from(source.html)
              : await (async () => {
                  const target = this.target(String(row.threadId));
                  return readMachinePreview(target.machine, target.root, source.path ?? "");
                })();
        if (bytes.length > PREVIEW_LIMIT)
          throw new HubError(413, "PREVIEW_TOO_LARGE", "Демо больше 2 МБ.");
        html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (source.path) {
          const target = this.target(String(row.threadId));
          const paths = target.machine.type !== "ssh-windows" ? posix : win32;
          const imagePaths: Record<string, string> = {};
          const image =
            interactive && this.artifacts
              ? (asset: string) => {
                  const base = source.captureId ? paths.dirname(source.path!) : target.root;
                  const path = paths.resolve(base, asset),
                    relative = paths.relative(base, path);
                  if (
                    !relative ||
                    relative === ".." ||
                    relative.startsWith(".." + paths.sep) ||
                    paths.isAbsolute(relative)
                  )
                    throw new HubError(400, "INVALID_PREVIEW_PATH", "Неверный путь ресурса демо.");
                  const key = createHash("sha256").update(path).digest("hex");
                  imagePaths[key] = path;
                  return key;
                }
              : undefined;
          if (source.captureId) {
            // Explicit exports use the captured HTML. Related static assets are
            // resolved beside that exact export, on the same authorized machine.
            const directory = paths.dirname(source.path);
            html = await bundlePreview(
              html,
              paths.basename(source.path),
              async (asset) => {
                const path = paths.resolve(directory, asset),
                  relative = paths.relative(directory, path);
                if (!relative || relative.startsWith("..") || paths.isAbsolute(relative))
                  throw new HubError(400, "INVALID_PREVIEW_PATH", "Неверный путь ресурса демо.");
                const temporary = await mkdtemp(join(tmpdir(), "codex-preview-"));
                try {
                  const destination = join(temporary, "asset");
                  await copyCodexArtifact(
                    target.machine,
                    target.root,
                    path,
                    destination,
                    PREVIEW_LIMIT,
                  );
                  return await readFile(destination);
                } finally {
                  await rm(temporary, { recursive: true, force: true });
                }
              },
              image,
            );
          } else {
            const entry = paths.relative(target.root, source.path);
            html = await bundlePreview(
              html,
              entry,
              (path) => readMachinePreviewAsset(target.machine, target.root, path),
              image,
            );
          }
          if (image) {
            await mkdir(this.root, { recursive: true, mode: 0o700 });
            await writeFile(
              join(this.root, cacheKey + ".json"),
              JSON.stringify({
                binding: this.binding(target),
                paths: imagePaths,
              }),
              { mode: 0o600 },
            );
            html += previewImages;
          }
        }
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const temp = file + ".pending";
        try {
          await writeFile(temp, html, { mode: 0o600 });
          await rename(temp, file);
        } finally {
          await unlink(temp).catch(() => {});
        }
      }
      // Prefix works for full documents as well as visualize-style HTML fragments.
      return previewMarkup(html);
    })().finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, action);
    return action;
  }
  private binding(target: { machine: MachineConfig; root: string }) {
    return createHash("sha256").update(JSON.stringify(target)).digest("hex");
  }
  private imagePending = new Map<string, Promise<{ url: string }>>();
  async image(id: string, key: string): Promise<{ url: string }> {
    const threadId = this.thread(id);
    if (!this.artifacts || !/^[a-f0-9]{64}$/.test(key))
      throw new HubError(404, "PREVIEW_IMAGE_NOT_FOUND", "Изображение не найдено.");
    await this.document(id, true);
    const manifest = JSON.parse(await readFile(join(this.root, id + ".interactive.json"), "utf8"));
    const target = this.target(threadId);
    if (manifest.binding !== this.binding(target))
      throw new HubError(409, "PREVIEW_SOURCE_CHANGED", "Компьютер или папка демо изменились.");
    const path = Object.hasOwn(manifest.paths, key) && manifest.paths[key];
    if (typeof path !== "string")
      throw new HubError(404, "PREVIEW_IMAGE_NOT_FOUND", "Изображение не найдено.");
    const source = `preview-image:${id}:${key}:${manifest.binding}`;
    const saved = this.store.db
      .prepare(
        "SELECT a.id FROM artifacts a JOIN artifact_files f ON f.id=a.id WHERE a.threadId=? AND f.sourcePath=?",
      )
      .get(threadId, source);
    if (saved) return { url: `/api/artifacts/${saved.id}` };
    const pending = this.imagePending.get(source);
    if (pending) return pending;
    const action = this.artifacts
      .putStream(
        threadId,
        null,
        path.split(/[\\/]/).at(-1)!,
        source,
        imageMime(path),
        (destination, limit) =>
          copyCodexArtifact(target.machine, target.root, path, destination, limit),
      )
      .then((file) => ({ url: file.url }))
      .finally(() => this.imagePending.delete(source));
    this.imagePending.set(source, action);
    return action;
  }
}

function imageMime(path: string) {
  const ext = path.split(".").at(-1)!.toLowerCase();
  return (
    (
      {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        svg: "image/svg+xml",
        ico: "image/x-icon",
      } as Record<string, string>
    )[ext] ?? `image/${ext}`
  );
}
