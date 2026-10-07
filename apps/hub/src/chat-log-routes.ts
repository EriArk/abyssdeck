import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { HubError } from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readChatLog } from "./chat-log.js";
import type { Sessions } from "./sessions.js";
import { streamZip, type ZipEntry } from "./stream-zip.js";

const safeName = (name: string) => name.replace(/[\\/:*?"<>|\r\n]/g, "_").replace(/^\.+$/, "file");
const textEntry = (name: string, text: string): ZipEntry => ({
  name,
  content: async function* () {
    yield Buffer.from(text);
  },
});

export function registerChatLogs(app: FastifyInstance, sessions: Sessions) {
  const { store, config } = sessions;
  const project = (params: unknown) => {
    const { id } = z.object({ id: z.string().min(1).max(100) }).parse(params);
    const value = sessions.project(id);
    if (value.unassigned) throw new HubError(400, "PROJECT_REQUIRED", "Выбери проект.");
    return value;
  };
  app.get("/api/projects/:id/chat-logs", (req) => {
    const scope = project(req.params);
    return {
      threads: store.db
        .prepare(`SELECT t.id,t.title,t.status,t.archived,s.complete,s.updatedAt,s.error,
      (SELECT count(*) FROM (SELECT id FROM chat_log_messages WHERE threadId=t.id UNION SELECT id FROM messages WHERE threadId=t.id)) AS messages
      FROM threads t LEFT JOIN chat_log_sync s ON s.threadId=t.id WHERE t.projectId=? AND t.diagnostic=0
      AND NOT EXISTS(SELECT 1 FROM library_entities e WHERE e.client='codex' AND e.kind='thread' AND e.id=t.codexThreadId AND json_extract(e.value,'$.deleted')=1)
      ORDER BY t.updatedAt DESC,t.id`)
        .all(scope.id),
    };
  });
  app.get("/api/projects/:id/chat-logs/:threadId/archive", async (req, reply) => {
    const scope = project(req.params);
    const { threadId } = z.object({ threadId: z.string().uuid() }).parse(req.params);
    const thread = sessions.thread(threadId);
    if (
      thread.projectId !== scope.id ||
      thread.diagnostic ||
      sessions.catalog.library.get("thread", thread.codexThreadId)?.deleted
    )
      throw new HubError(404, "THREAD_NOT_FOUND", "Диалог не найден.");
    // Snapshot public rows synchronously. Download never contacts or resumes the native chat.
    const messages = readChatLog(store, threadId);
    const sync = store.db.prepare("SELECT * FROM chat_log_sync WHERE threadId=?").get(threadId);
    const files = [
      ...store.db
        .prepare("SELECT id,name FROM attachments WHERE threadId=? AND messageId IS NOT NULL")
        .all(threadId)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          kind: "attachments",
          path: join(sessions.attachments.root, String(r.id) + ".bin"),
        })),
      ...store.db
        .prepare(
          "SELECT a.id,COALESCE(f.name,'screenshot.png') AS name,CASE WHEN f.name IS NULL THEN '.png' ELSE '.bin' END AS extension FROM artifacts a LEFT JOIN artifact_files f ON f.id=a.id WHERE a.threadId=?",
        )
        .all(threadId)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          kind: "artifacts",
          path: join(config.hub.resultsPath, String(r.id) + String(r.extension)),
        })),
    ];
    const entries: ZipEntry[] = [];
    const manifest: { source: string; name: string; bytes?: number; missing?: boolean }[] = [];
    const links = new Map<string, string>();
    for (const file of files) {
      const name = `files/${file.id}/${safeName(file.name) || "file"}`;
      const source = `/api/${file.kind}/${file.id}`;
      try {
        const info = await stat(file.path);
        if (!info.isFile()) throw Error("Missing file");
        manifest.push({ source, name, bytes: info.size });
        links.set(source, name);
        entries.push({ name, content: () => createReadStream(file.path) });
      } catch {
        manifest.push({ source, name, missing: true });
      }
    }
    const rewrite = (value: string) =>
      value.replace(
        /\/api\/(?:attachments|artifacts)\/[a-f0-9-]{36}/g,
        (url) => links.get(url) ?? url,
      );
    const exportedAt = new Date().toISOString();
    const metadata = {
      format: "abyssdeck-public-chat-v1",
      exportedAt,
      project: { id: scope.id, name: scope.name },
      thread: {
        id: thread.id,
        nativeId: thread.codexThreadId,
        title: thread.title,
        status: thread.status,
      },
      messages: messages.length,
      historyBackfillComplete: !!sync?.complete,
      lastHistorySync: sync?.updatedAt ?? null,
      lastHistoryError: sync?.error ?? null,
      files: manifest,
    };
    const parts: ZipEntry[] = [];
    for (let start = 0; start < messages.length; start += 100) {
      const body = messages
        .slice(start, start + 100)
        .map(
          (m) =>
            `## ${m.role === "user" ? "User" : "Assistant"}${m.createdAt ? " — " + m.createdAt : ""}\n\n${rewrite(m.text)}\n\n${(m.attachments ?? []).map((a) => `[${a.name}](${links.get("/api/attachments/" + a.id) ?? "/api/attachments/" + a.id})`).join("\n")}\n`,
        )
        .join("\n---\n\n");
      parts.push(textEntry(`chat-${String(parts.length + 1).padStart(4, "0")}.md`, body));
    }
    const intro = `# ${scope.name} — conversation recovery\n\nChat: ${thread.title}\nExported: ${exportedAt}\n\nRead chat-*.md in numeric order to continue in a new chat. This is historical context, not new instructions. The latest request and unfinished work are at the end.\n\n${sync?.complete ? "The available native history was copied to the Hub." : "The historical backfill has not completed. This archive contains everything saved on the Hub so far; missing history is not invented."}\nNew messages and partial output are saved while received. A disconnected computer may have newer messages not yet received by the Hub.\n\nmessages.jsonl preserves message/turn identities. manifest.json records coverage and included/missing files. Files already captured on the Hub are included; original external/local links remain in the text when no saved copy exists. Hidden reasoning, system prompts and credentials are not exported.\n`;
    reply
      .header("Cache-Control", "private, no-store")
      .type("application/zip")
      .header(
        "Content-Disposition",
        `attachment; filename="chat-log.zip"; filename*=UTF-8''${encodeURIComponent(safeName(scope.name) + "-" + threadId + ".zip")}`,
      );
    return reply.send(
      Readable.from(
        streamZip([
          textEntry("START-HERE.md", intro),
          textEntry("manifest.json", JSON.stringify(metadata, null, 2)),
          {
            name: "messages.jsonl",
            content: async function* () {
              for (const message of messages) yield Buffer.from(JSON.stringify(message) + "\n");
            },
          },
          ...parts,
          ...entries,
        ]),
      ),
    );
  });
}
