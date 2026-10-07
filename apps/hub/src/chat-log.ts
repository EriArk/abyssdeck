import type { MessageRecord, Store } from "./store.js";

/** Public chat only. Native tool arguments, hidden reasoning and system prompts never enter this log. */
export function saveChatLog(store: Store, messages: MessageRecord[], epoch: number) {
  const put = store.db.prepare(
    "INSERT INTO chat_log_messages VALUES(?,?,?,?) ON CONFLICT(threadId,id) DO UPDATE SET value=excluded.value,position=excluded.position",
  );
  for (const message of messages) {
    if (!message.id || !["user", "assistant"].includes(message.role)) continue;
    // Native pages are newest first; firstSeq is their negative absolute offset.
    put.run(
      message.threadId,
      message.id,
      JSON.stringify(message),
      epoch + Math.min(0, message.firstSeq),
    );
  }
}

export function readChatLog(store: Store, threadId: string): MessageRecord[] {
  const saved = store.db
    .prepare("SELECT value FROM chat_log_messages WHERE threadId=? ORDER BY position,id")
    .all(threadId)
    .map((row) => JSON.parse(String(row.value)) as MessageRecord);
  const live = store.db
    .prepare("SELECT * FROM messages WHERE threadId=? ORDER BY firstSeq")
    .all(threadId) as unknown as MessageRecord[];
  const positions = new Map(saved.map((m, i) => [m.id, i]));
  for (const message of live) {
    const at = saved.findIndex((m) => m.id === message.id);
    if (at >= 0) {
      // Canonical history may be more complete than a disconnected stream.
      if (message.text.length >= saved[at]!.text.length) saved[at] = message;
      continue;
    }
    // Optimistic user IDs can differ from canonical IDs. Match one occurrence only.
    const match =
      message.role === "user" && message.turnId
        ? saved.findIndex(
            (m) =>
              m.role === "user" &&
              m.turnId === message.turnId &&
              m.text === message.text &&
              !positions.has("matched:" + m.id),
          )
        : -1;
    if (match >= 0) {
      positions.set("matched:" + saved[match]!.id, match);
      continue;
    }
    const next = live.find((m) => m.firstSeq > message.firstSeq && positions.has(m.id));
    if (next)
      saved.splice(
        saved.findIndex((m) => m.id === next.id),
        0,
        message,
      );
    else saved.push(message);
  }
  // Export metadata only; withAttachments also hashes image previews for UI deduplication.
  return saved.map((message) => ({
    ...message,
    attachments: store.db
      .prepare("SELECT * FROM attachments WHERE threadId=? AND messageId=? ORDER BY createdAt")
      .all(threadId, message.id)
      .map((row) => store.attachmentPublic(row)),
    images:
      message.images ??
      store.db
        .prepare("SELECT id,name FROM native_images WHERE threadId=? AND messageId=?")
        .all(threadId, message.id)
        .map((row) => ({
          id: String(row.id),
          name: String(row.name),
          url: `/api/native-images/${row.id}`,
        })),
  }));
}
