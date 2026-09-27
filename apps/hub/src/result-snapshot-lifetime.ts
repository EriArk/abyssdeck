import { lstatSync, realpathSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { HubError } from "@codex-web/shared";
import type { Communication } from "./communication.js";
import { sharedAssetPath } from "./team-assets.js";

export const snapshotGraceMs = 7 * 86400000;
/** Retain receipts/metadata; collect only unreferenced immutable binary copies. */
export class ResultSnapshotLifetime {
  constructor(
    private owner: Communication,
    private now = Date.now,
  ) {
    const { db, root } = owner;
    if (realpathSync(root) !== resolve(root) || !lstatSync(root).isDirectory())
      throw Error("RESULT_STORAGE_UNSAFE");
    db.exec(`CREATE TABLE IF NOT EXISTS result_snapshot_lifetime(
      id TEXT PRIMARY KEY REFERENCES shared_result_files(id),
      touchedAt INTEGER NOT NULL, collectedAt INTEGER, removedAt INTEGER);
      CREATE INDEX IF NOT EXISTS result_snapshot_lifetime_age ON result_snapshot_lifetime(touchedAt);
      CREATE INDEX IF NOT EXISTS result_share_snapshot_active ON result_share_grants(snapshotId,revoked);
      CREATE INDEX IF NOT EXISTS result_handoff_snapshot_active ON result_ai_handoffs(snapshotId,dismissed);`);
    // Existing installations get a full grace period, never a startup mass deletion.
    db.prepare(`INSERT OR IGNORE INTO result_snapshot_lifetime(id,touchedAt)
      SELECT id,max(createdAt,?) FROM shared_result_files`).run(this.now());
  }
  retained(id: string) {
    if (
      this.owner.db
        .prepare("SELECT 1 FROM result_snapshot_lifetime WHERE id=? AND collectedAt IS NOT NULL")
        .get(id)
    )
      throw new HubError(
        410,
        "RESULT_COPY_EXPIRED",
        "Временная копия очищена. Подготовь пересылку из исходного результата заново.",
      );
  }
  touch(id: string) {
    this.retained(id);
    this.owner.db
      .prepare(`INSERT INTO result_snapshot_lifetime(id,touchedAt) VALUES(?,?)
      ON CONFLICT(id) DO UPDATE SET touchedAt=excluded.touchedAt`)
      .run(id, this.now());
  }
  removed(id: string) {
    return !!this.owner.db
      .prepare("SELECT 1 FROM result_snapshot_lifetime WHERE id=? AND removedAt IS NOT NULL")
      .get(id);
  }
  restore(id: string) {
    this.owner.db
      .prepare(`INSERT INTO result_snapshot_lifetime(id,touchedAt) VALUES(?,?)
      ON CONFLICT(id) DO UPDATE SET touchedAt=excluded.touchedAt,collectedAt=NULL,removedAt=NULL`)
      .run(id, this.now());
  }
  sweep(limit = 50) {
    const { db, root } = this.owner;
    // Both pending (0) and copied (2) handoffs protect the exact snapshot. A copied
    // attachment can still be in an uncertain send or an offline browser draft.
    const ids = (() => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const rows = db
          .prepare(`SELECT l.id FROM result_snapshot_lifetime l
        WHERE l.removedAt IS NULL AND (l.collectedAt IS NOT NULL OR
        (l.touchedAt<? AND NOT EXISTS(SELECT 1 FROM result_share_grants g WHERE g.snapshotId=l.id AND g.revoked=0)
        AND NOT EXISTS(SELECT 1 FROM result_ai_handoffs h WHERE h.snapshotId=l.id AND h.dismissed<>1)))
        ORDER BY coalesce(l.collectedAt,l.touchedAt),l.id LIMIT ?`)
          .all(this.now() - snapshotGraceMs, Math.max(1, Math.min(100, limit)));
        for (const r of rows)
          db.prepare(
            "UPDATE result_snapshot_lifetime SET collectedAt=coalesce(collectedAt,?) WHERE id=?",
          ).run(this.now(), String(r.id));
        db.exec("COMMIT");
        return rows;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    })();
    let removed = 0;
    for (const r of ids) {
      try {
        const path = sharedAssetPath(root, String(r.id));
        try {
          const info = lstatSync(path);
          if (!info.isFile() || info.isSymbolicLink() || realpathSync(path) !== resolve(path))
            continue;
          unlinkSync(path);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") continue;
        }
        db.prepare("UPDATE result_snapshot_lifetime SET removedAt=? WHERE id=?").run(
          this.now(),
          String(r.id),
        );
        removed++;
      } catch {
        /* Keep the tombstone charged to quota and retry next bounded pass. */
      }
    }
    return { examined: ids.length, removed };
  }
}
