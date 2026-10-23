import { lstatSync, realpathSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { HubError } from "@codex-web/shared";
import type { Store } from "./store.js";

/** Metadata and exact references survive expiry; only Hub-owned result bytes expire. */
export class ArtifactRetention {
  constructor(
    private root: string,
    private store: Store,
  ) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS artifact_expiry(
      id TEXT PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
      bytes INTEGER NOT NULL, state TEXT NOT NULL, createdAt TEXT NOT NULL
    )`);
  }
  assertAvailable(id: string) {
    if (this.store.db.prepare("SELECT 1 FROM artifact_expiry WHERE id=?").get(id))
      throw new HubError(
        410,
        "ARTIFACT_EXPIRED",
        "Файл удалён при очистке старых результатов по лимиту хранилища.",
      );
  }
  used(): number {
    return Number(
      this.store.db.prepare("SELECT coalesce(sum(bytes),0) AS bytes FROM artifacts").get()?.bytes,
    );
  }
  makeRoom(additional: number, maxBytes: number, threadId: string, enabled: boolean) {
    if (additional > maxBytes) return this.full();
    let used = this.used();
    if (used + additional <= maxBytes) return;
    if (!enabled) return this.full();
    // Expiry intent must be durable independently of the caller's transaction.
    if (this.store.db.isTransaction)
      throw new HubError(
        409,
        "STORAGE_TRANSACTION_BUSY",
        "Очистка ожидает завершения сохранения результата.",
      );
    if (realpathSync(this.root) !== resolve(this.root) || lstatSync(this.root).isSymbolicLink())
      throw new HubError(409, "STORAGE_PATH_UNSAFE", "Хранилище требует проверки пути.");
    // Never retire another active/uncertain thread, the current writer, or pinned
    // review/note/GUI evidence. Uploaded attachments live outside this table.
    const candidates = this.store.db
      .prepare(`
      SELECT a.id,a.bytes FROM artifacts a JOIN threads t ON t.id=a.threadId
      WHERE a.bytes>0 AND a.threadId<>? AND t.activeTurnId IS NULL
        AND t.status IN ('idle','completed','interrupted','failed')
        AND coalesce(t.nativeObservedStatus,'') NOT IN ('active','running','starting','waiting_approval','unknown')
        AND NOT EXISTS (SELECT 1 FROM artifact_captures c WHERE c.threadId=t.id AND c.status='capturing')
        AND NOT EXISTS (SELECT 1 FROM commands c WHERE c.state IN ('pending','unknown') AND instr(c.scope,t.id)>0)
        AND NOT EXISTS (SELECT 1 FROM work_reviews r WHERE instr(r.value,a.id)>0)
        AND NOT EXISTS (SELECT 1 FROM workspace_note_sources n WHERE instr(n.source,a.id)>0)
        AND NOT EXISTS (SELECT 1 FROM gui_previews g WHERE instr(g.value,a.id)>0)
        AND NOT EXISTS (SELECT 1 FROM native_images n WHERE n.artifactId=a.id AND (
          EXISTS (SELECT 1 FROM work_reviews r WHERE instr(r.value,n.id)>0) OR
          EXISTS (SELECT 1 FROM workspace_note_sources s WHERE instr(s.source,n.id)>0)))
      ORDER BY a.createdAt,a.id
    `)
      .all(threadId);
    // Don't discard some old files if the protected content still cannot fit.
    const reclaimable = candidates.reduce((sum, r) => sum + Number(r.bytes), 0);
    if (used + additional - reclaimable > maxBytes) return this.full();
    for (const row of candidates) {
      if (used + additional <= maxBytes) break;
      const id = String(row.id);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("INVALID_ARTIFACT_ID");
      const record = this.store.db.prepare("SELECT bytes FROM artifacts WHERE id=?").get(id)!;
      const extension = this.store.db.prepare("SELECT 1 FROM artifact_files WHERE id=?").get(id)
        ? ".bin"
        : ".png";
      const path = join(this.root, id + extension);
      const info = lstatSync(path, { throwIfNoEntry: false });
      if (!info && !this.store.db.prepare("SELECT 1 FROM artifact_expiry WHERE id=?").get(id))
        throw new HubError(409, "STORAGE_NEEDS_REVIEW", "Не найден сохранённый файл результата.");
      if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1))
        throw new HubError(409, "STORAGE_PATH_UNSAFE", "Файл результата требует проверки пути.");
      // Commit intent before unlink. A crash after unlink is reconciled on the
      // next quota pass; missing bytes never masquerade as a transient image.
      this.store.db
        .prepare("INSERT OR IGNORE INTO artifact_expiry VALUES(?,?,'pending',?)")
        .run(id, record.bytes!, new Date().toISOString());
      if (info) unlinkSync(path);
      this.store.db.exec("SAVEPOINT expire_artifact");
      try {
        this.store.db.prepare("UPDATE artifacts SET bytes=0 WHERE id=?").run(id);
        this.store.db.prepare("UPDATE artifact_expiry SET state='removed' WHERE id=?").run(id);
        this.store.db.exec("RELEASE expire_artifact");
        used -= Number(record.bytes);
      } catch (error) {
        this.store.db.exec("ROLLBACK TO expire_artifact; RELEASE expire_artifact");
        throw error;
      }
    }
    if (this.used() + additional > maxBytes) this.full();
  }
  private full(): never {
    throw new HubError(
      507,
      "ARTIFACT_STORAGE_FULL",
      "Хранилище результатов заполнено. Активные и сохранённые материалы защищены.",
    );
  }
}
