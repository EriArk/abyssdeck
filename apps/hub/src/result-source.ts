import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

/** Actual source metadata only: never turn a cache URL or display name into a path. */
export function resultSourcePath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || /[\r\n\0]/.test(value)) return;
  if (/^\/[a-z]:[\\/]/i.test(value)) return value.slice(1);
  if (/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/(?!\/|api\/))/i.test(value)) return value;
}

export function readResult(db: DatabaseSync, row: Record<string, SQLOutputValue>) {
  const payload = JSON.parse(String(row.payload));
  if (["file", "artifact", "image", "preview"].includes(String(row.type))) {
    let path = resultSourcePath(payload.sourcePath);
    const url = typeof payload.url === "string" ? payload.url : "";
    const artifact = /^\/api\/artifacts\/([a-f0-9-]{36})$/.exec(url);
    const image = /^\/api\/native-images\/([a-f0-9-]{36})$/.exec(url);
    if (!path && artifact)
      path = resultSourcePath(
        db
          .prepare(
            "SELECT f.sourcePath FROM artifact_files f JOIN artifacts a ON a.id=f.id WHERE a.id=? AND a.threadId=?",
          )
          .get(artifact[1]!, row.threadId!)?.sourcePath,
      );
    if (!path && image)
      path = resultSourcePath(
        db
          .prepare("SELECT source FROM native_images WHERE id=? AND threadId=?")
          .get(image[1]!, row.threadId!)?.source,
      );
    if (!path && typeof payload.captureId === "string")
      path = resultSourcePath(
        db
          .prepare("SELECT path FROM artifact_captures WHERE id=? AND threadId=?")
          .get(payload.captureId, row.threadId!)?.path,
      );
    if (path) payload.sourcePath = path;
    else delete payload.sourcePath;
  }
  return { ...row, payload };
}
