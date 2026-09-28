import { HubError, type NotebookLink } from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GptService } from "./gpt.js";
import type { Sessions } from "./sessions.js";

const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ru");
export function searchSnippet(text: string, query: string) {
  const at = normalized(text).indexOf(normalized(query));
  if (at < 0) return null;
  const start = Math.max(0, at - 70);
  return (
    (start ? "…" : "") + text.slice(start, start + 320) + (text.length > start + 320 ? "…" : "")
  );
}
export function registerContentSearch(app: FastifyInstance, sessions: Sessions, gpt: GptService) {
  app.get("/api/workspace/search", async (req) => {
    const q = z
      .object({
        q: z.string().trim().min(2).max(120),
        client: z.enum(["codex", "gpt"]).default("codex"),
        threadId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,100}$/)
          .optional(),
        projectId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,100}$/)
          .optional(),
        kind: z.enum(["all", "messages", "records", "files"]).default("all"),
        limit: z.coerce.number().int().min(1).max(100).default(40),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        revision: z.string().max(100).optional(),
      })
      .parse(req.query);
    const items: { target: NotebookLink; snippet: string }[] = [];
    if (q.threadId && q.client === "gpt") {
      gpt.authorize();
      gpt.library.assertExists("thread", q.threadId);
      const snapshot = await gpt.historyCache.snapshot(q.threadId);
      gpt.authorize();
      gpt.library.assertExists("thread", q.threadId);
      if (q.revision && q.revision !== snapshot.revision)
        throw new HubError(409, "RESULTS_CHANGED", "История изменилась.");
      const records: { target: NotebookLink; text: string; stamp: number }[] = [];
      if (q.kind === "all" || q.kind === "messages") {
        for (const message of snapshot.items) {
          if (message.phase === "commentary") continue;
          records.push({
            target: {
              client: "gpt",
              kind: "thread",
              id: q.threadId,
              threadId: q.threadId,
              messageId: message.id,
              title: message.role === "user" ? "Ваше сообщение" : "Ответ GPT",
              availability: "unknown",
            },
            text: message.text,
            stamp: message.createdAt,
          });
        }
      }
      if (q.kind === "all" || q.kind === "files") {
        for (const result of gpt.resultIndex(q.threadId, snapshot).items) {
          if (!["file", "artifact", "image"].includes(result.type)) continue;
          records.push({
            target: {
              client: "gpt",
              kind: "result",
              id: result.id,
              threadId: q.threadId,
              ...(result.turnId ? { messageId: result.turnId } : {}),
              title: result.title,
              availability: "unknown",
            },
            text: result.title,
            stamp: Date.parse(result.createdAt) / 1000,
          });
        }
      }
      records.reverse();
      records.sort((a, b) => b.stamp - a.stamp);
      const batch = records.slice(q.offset, q.offset + 500);
      let scanned = 0;
      for (const record of batch) {
        scanned++;
        const snippet = searchSnippet(record.text, q.q);
        if (snippet !== null) items.push({ target: record.target, snippet });
        if (items.length >= q.limit) break;
      }
      return {
        items,
        nextOffset: q.offset + scanned < records.length ? q.offset + scanned : null,
        revision: snapshot.revision,
        coverage:
          "Сообщения и названия файлов/изображений Results текущей ветки выбранного чата ChatGPT",
        scanned,
      };
    }
    const db = sessions.store.db;
    // Each explicit page scans a bounded number of existing public records. No native writer,
    // filesystem traversal, background chat crawling or hidden tool/reasoning payloads.
    const filters: string[] = [],
      bindings: (string | number)[] = [];
    if (q.threadId) {
      filters.push("threadId=? AND client='codex'");
      bindings.push(q.threadId);
    } else if (q.projectId) {
      filters.push("projectId=? AND client=?");
      bindings.push(q.projectId, q.client);
    }
    if (q.kind === "messages") filters.push("kind='thread'");
    if (q.kind === "records") filters.push("kind IN ('note','task','plan','report')");
    if (q.kind === "files") filters.push("kind='result'");
    const sql = `SELECT * FROM (
    SELECT id,'note' kind,COALESCE(json_extract(scope,'$.client'),'codex') client,json_extract(scope,'$.projectId') projectId,title,body,NULL threadId,NULL messageId,updatedAt stamp FROM workspace_notes
    UNION ALL SELECT id,'task',COALESCE(json_extract(scope,'$.client'),'codex'),json_extract(scope,'$.projectId'),title,body,NULL,NULL,updatedAt FROM workspace_tasks
    UNION ALL SELECT id,'plan',json_extract(scope,'$.client'),json_extract(scope,'$.projectId'),json_extract(value,'$.title'),search,NULL,NULL,updatedAt FROM project_plans
    UNION ALL SELECT id,'report',json_extract(scope,'$.client'),json_extract(scope,'$.projectId'),title,body,NULL,NULL,createdAt FROM project_reports
    UNION ALL SELECT m.id,'thread','codex',t.projectId,t.title,m.text,m.threadId,m.id,CAST(unixepoch(m.createdAt)*1000 AS INTEGER) FROM messages m JOIN threads t ON t.id=m.threadId WHERE m.role IN ('user','assistant') AND m.phase NOT IN ('analysis','reasoning')
    UNION ALL SELECT r.id,'result','codex',t.projectId,r.title,'',r.threadId,NULL,CAST(unixepoch(r.createdAt)*1000 AS INTEGER) FROM results r JOIN threads t ON t.id=r.threadId WHERE r.type IN ('file','artifact','image')
   ) ${filters.length ? "WHERE " + filters.join(" AND ") : ""} ORDER BY stamp DESC,kind,id LIMIT 501 OFFSET ?`;
    const rows = db.prepare(sql).all(...bindings, q.offset) as Record<string, any>[];
    let scanned = 0;
    for (const row of rows.slice(0, 500)) {
      scanned++;
      const snippet = searchSnippet(String(row.title ?? "") + "\n" + String(row.body ?? ""), q.q);
      if (snippet === null) continue;
      items.push({
        target: {
          client: row.client,
          kind: row.kind,
          id: row.kind === "thread" ? row.threadId : row.id,
          title: row.title ?? "Без названия",
          ...(row.projectId ? { projectId: row.projectId } : {}),
          ...(row.threadId ? { threadId: row.threadId } : {}),
          ...(row.messageId ? { messageId: row.messageId } : {}),
          availability: "unknown",
        },
        snippet,
      });
      if (items.length >= q.limit) break;
    }
    return {
      items,
      nextOffset: rows.length > scanned ? q.offset + scanned : null,
      scanned,
      coverage: q.threadId
        ? "Сохранённые сообщения и названия файлов/изображений Results этого чата Codex"
        : `${q.projectId ? "Только выбранный проект. " : ""}Заметки, задачи, планы, отчёты, сохранённые сообщения и названия файлов/изображений Results Codex. История GPT ищется в выбранном чате.`,
    };
  });
}
