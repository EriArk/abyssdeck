import type { GptMessage } from "@codex-web/shared";
import type { Store } from "./store.js";

/** Per-account read markers. A catalog timestamp is never completion evidence. */
export class GptAttention {
  constructor(private store: Pick<Store, "db">) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS gpt_attention(conversationId TEXT PRIMARY KEY, completedId TEXT NOT NULL, seenId TEXT NOT NULL, observedAt INTEGER NOT NULL)",
    );
    if (
      !store.db
        .prepare("PRAGMA table_info(gpt_attention)")
        .all()
        .some((r) => r.name === "pending")
    )
      store.db.exec("ALTER TABLE gpt_attention ADD COLUMN pending INTEGER NOT NULL DEFAULT 0");
  }
  observe(id: string, messages: GptMessage[]) {
    const final = messages.findLast(
      (m) => m.role === "assistant" && m.phase !== "commentary" && m.complete !== false,
    );
    const lastUser = messages.findLast((m) => m.role === "user");
    const completedId = final?.id ?? "";
    const pending = !!lastUser && (!final || messages.indexOf(lastUser) > messages.indexOf(final));
    const previous = this.store.db
      .prepare("SELECT completedId FROM gpt_attention WHERE conversationId=?")
      .get(id);
    if (!previous) {
      // Establish a baseline for old history; newly completed Hub work is unread.
      const fresh = final && Date.now() - final.createdAt * 1000 < 300000;
      this.store.db
        .prepare(
          "INSERT INTO gpt_attention(conversationId,completedId,seenId,observedAt) VALUES(?,?,?,?)",
        )
        .run(id, completedId, fresh ? "" : completedId, Date.now());
    } else if (previous.completedId !== completedId) {
      this.store.db
        .prepare("UPDATE gpt_attention SET completedId=?,observedAt=? WHERE conversationId=?")
        .run(completedId, Date.now(), id);
    }
    this.store.db
      .prepare("UPDATE gpt_attention SET pending=? WHERE conversationId=? AND pending<>?")
      .run(Number(pending), id, Number(pending));
    return { pending };
  }
  pendingIds() {
    return this.store.db
      .prepare(
        "SELECT conversationId FROM gpt_attention WHERE pending=1 ORDER BY observedAt DESC LIMIT 32",
      )
      .all()
      .map((r) => String(r.conversationId));
  }
  list() {
    return this.store.db
      .prepare(
        "SELECT conversationId,completedId FROM gpt_attention WHERE completedId<>'' AND completedId<>seenId ORDER BY observedAt DESC LIMIT 1000",
      )
      .all()
      .map((r) => ({
        conversationId: String(r.conversationId),
        completedId: String(r.completedId),
      }));
  }
  seen(id: string, completedId: string) {
    // A late read acknowledgement cannot swallow a newer completion.
    this.store.db
      .prepare("UPDATE gpt_attention SET seenId=? WHERE conversationId=? AND completedId=?")
      .run(completedId, id, completedId);
  }
}
