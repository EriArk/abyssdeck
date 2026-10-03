import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  type ResultItem,
  type ResultTimelineItem,
  type ResultTimelinePage,
  resultCategory,
} from "@codex-web/shared";

/** A read projection, never a native history scan or writer. Unlinked old work stays intact. */
function turns(scope: "threadId" | "projectId") {
  // Disjoint positive cursor ranges retain stable anchors for live messages and
  // legacy result-only turns. Native history reads must not reorder existing turns.
  return `WITH selected AS (SELECT id,title FROM threads WHERE ${scope === "threadId" ? "id" : "projectId"}=?),
    anchors AS (
      SELECT m.threadId,m.turnId,2000000000000 + MIN(m.firstSeq) cursor FROM messages m JOIN selected s ON s.id=m.threadId WHERE m.turnId IS NOT NULL GROUP BY m.threadId,m.turnId
      UNION ALL
      SELECT r.threadId,r.turnId,1000000000000 + MIN(r.rowid) cursor FROM results r JOIN selected s ON s.id=r.threadId WHERE r.turnId IS NOT NULL GROUP BY r.threadId,r.turnId
    ), turns AS (SELECT threadId,turnId,MAX(cursor) cursor FROM anchors GROUP BY threadId,turnId)`;
}
export function codexRequestCount(db: DatabaseSync, scope: "threadId" | "projectId", id: string) {
  return Number(db.prepare(turns(scope) + " SELECT count(*) n FROM turns").get(id)?.n ?? 0);
}
export function codexRequests(
  db: DatabaseSync,
  scope: "threadId" | "projectId",
  id: string,
  before: number,
) {
  const rows = db
    .prepare(
      turns(scope) +
        ` , page AS MATERIALIZED (SELECT * FROM turns WHERE cursor<? ORDER BY cursor DESC LIMIT 21)
    SELECT turns.*,s.title threadTitle,
    COALESCE((SELECT text FROM messages m WHERE m.threadId=turns.threadId AND m.turnId=turns.turnId AND role='user' ORDER BY firstSeq LIMIT 1),
      (SELECT json_extract(payload,'$.text') FROM results r WHERE r.threadId=turns.threadId AND r.turnId=turns.turnId AND type='reasoning-request' ORDER BY rowid LIMIT 1)) request,
    (SELECT createdAt FROM messages m WHERE m.threadId=turns.threadId AND m.turnId=turns.turnId ORDER BY firstSeq LIMIT 1) createdAt,
    (SELECT MAX(seq) FROM events e WHERE e.threadId=turns.threadId AND e.turnId=turns.turnId) revision
    FROM page turns JOIN selected s ON s.id=turns.threadId ORDER BY cursor DESC`,
    )
    .all(id, before);
  return {
    items: rows.slice(0, 20).map(
      (row): ResultItem => ({
        id:
          "reasoning-" +
          createHash("sha256")
            .update(JSON.stringify([row.threadId, row.turnId]))
            .digest("hex")
            .slice(0, 32),
        cursor: Number(row.cursor),
        threadId: String(row.threadId),
        threadTitle: String(row.threadTitle),
        turnId: String(row.turnId),
        type: "reasoning",
        title: String(row.request || "Ход задачи"),
        createdAt: String(row.createdAt || ""),
        payload: {
          codexTurn: true,
          revision: Number(row.revision || 0),
          text: String(row.request || "Ход задачи"),
        },
      }),
    ),
    nextBefore: rows.length > 20 ? Number(rows[19]!.cursor) : null,
  };
}

/** First sequence is the order anchor, latest snapshot supplies content. No timestamp parentage. */
export function codexTimeline(
  db: DatabaseSync,
  threadId: string,
  turnId: string,
  after = 0,
): ResultTimelinePage {
  const rows = db
    .prepare(`WITH source AS (
    SELECT e.seq,e.type,e.payload,
      CASE WHEN e.type='result.created' THEN 'item:' || COALESCE((SELECT sourceKey FROM results r WHERE r.id=json_extract(e.payload,'$.id') AND r.threadId=e.threadId AND r.turnId=e.turnId),e.seq)
        WHEN COALESCE(json_extract(e.payload,'$.itemId'),json_extract(e.payload,'$.id')) IS NOT NULL THEN 'item:' || COALESCE(json_extract(e.payload,'$.itemId'),json_extract(e.payload,'$.id'))
        ELSE 'event:' || e.seq END key
      FROM events e WHERE threadId=? AND turnId=? AND type IN ('activity.summary','activity.command','activity.tool','turn.progress','error','result.created')
    UNION ALL
    SELECT firstSeq,CASE WHEN role='user' THEN 'request' ELSE 'message' END,json_object('text',text),'message:' || id
      FROM messages WHERE threadId=? AND turnId=? AND (role='user' OR phase='commentary')
  ), grouped AS (SELECT *,MIN(seq) OVER (PARTITION BY key) firstSeq,ROW_NUMBER() OVER (PARTITION BY key ORDER BY seq DESC) rank FROM source)
  SELECT * FROM grouped WHERE rank=1 AND firstSeq>? ORDER BY firstSeq LIMIT 41`)
    .all(threadId, turnId, threadId, turnId, after);
  const items: ResultTimelineItem[] = [];
  for (const row of rows.slice(0, 40)) {
    const p = JSON.parse(String(row.payload));
    const base = { id: String(row.key), label: String(p.label || p.tool || "Действие Codex") };
    if (row.type === "result.created") {
      const result = db
        .prepare("SELECT * FROM results WHERE id=? AND threadId=? AND turnId=?")
        .get(String(p.id), threadId, turnId);
      if (result && resultCategory(String(result.type)) === "work")
        items.push({
          ...base,
          kind: "work",
          label: String(result.title),
          result: {
            ...result,
            payload: JSON.parse(String(result.payload)),
          } as unknown as ResultItem,
        });
    } else if (["activity.summary", "message", "request"].includes(String(row.type))) {
      items.push({
        ...base,
        kind: row.type === "activity.summary" ? "summary" : (row.type as "message" | "request"),
        label: row.type === "request" ? "Вы" : "Codex",
        text: String(p.text || ""),
      });
    } else {
      const itemId = String(p.itemId || p.id || "");
      items.push({
        ...base,
        kind: "work",
        label:
          row.type === "activity.command"
            ? "Команда"
            : row.type === "error"
              ? "Ошибка"
              : base.label,
        text: String(p.command || p.detail || p.message || ""),
        result: p.command
          ? {
              id: base.id,
              threadId,
              turnId,
              title: "Команда",
              type: "command",
              createdAt: "",
              payload: { command: p.command, status: p.status, exitCode: p.exitCode },
            }
          : undefined,
        logUrl:
          row.type === "activity.command" && itemId
            ? `/api/threads/${encodeURIComponent(threadId)}/commands/${encodeURIComponent(itemId)}?turnId=${encodeURIComponent(turnId)}`
            : undefined,
      });
    }
  }
  return { items, nextAfter: rows.length > 40 ? Number(rows[39]!.firstSeq) : null };
}

export function unlinkedTurnWork(
  db: DatabaseSync,
  threadId: string,
  turnId: string,
  before = Number.MAX_SAFE_INTEGER,
) {
  const rows = db
    .prepare(`SELECT rowid cursor,* FROM results r WHERE threadId=? AND turnId=? AND rowid<?
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.threadId=r.threadId AND e.turnId=r.turnId AND e.type='result.created' AND json_extract(e.payload,'$.id')=r.id)
    ORDER BY rowid DESC LIMIT 41`)
    .all(threadId, turnId, before);
  return {
    items: rows
      .slice(0, 40)
      .filter((r) => resultCategory(String(r.type)) === "work")
      .map((r) => ({ ...r, payload: JSON.parse(String(r.payload)) })),
    nextBefore: rows.length > 40 ? Number(rows[39]!.cursor) : null,
  };
}
