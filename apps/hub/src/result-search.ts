import { createHash } from "node:crypto";
import {
  HubError,
  type ResultItem,
  type ResultSearchHit,
  type ResultSearchPage,
  type ResultSearchQuery,
} from "@codex-web/shared";
import { z } from "zod";
import type { Store } from "./store.js";

export const resultSearchText = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ru");
const cursorSchema = z
  .object({
    binding: z.string(),
    revision: z.string().optional(),
    offset: z.number().int().nonnegative().optional(),
    ceiling: z.number().int().nonnegative().optional(),
    row: z.number().int().nonnegative().optional(),
    name: z.string().max(10000).optional(),
  })
  .strict();
const changed = () => new HubError(409, "RESULTS_CHANGED", "Список результатов изменился.");
const binding = (scope: string, query: ResultSearchQuery) =>
  createHash("sha256")
    .update(JSON.stringify([scope, resultSearchText(query.q), query.category, query.sort]))
    .digest("hex");
const encode = (value: z.infer<typeof cursorSchema>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function cursor(scope: string, query: ResultSearchQuery) {
  const key = binding(scope, query);
  if (!query.cursor) return { binding: key };
  try {
    const value = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString()));
    if (value.binding !== key) throw changed();
    return value;
  } catch {
    throw changed();
  }
}
export function resultSearchHit(item: ResultSearchHit): ResultSearchHit {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    createdAt: item.createdAt,
    turnId: item.turnId,
    ...(item.threadId ? { threadId: item.threadId } : {}),
    ...(item.threadTitle ? { threadTitle: item.threadTitle } : {}),
  };
}
const types = (category: ResultSearchQuery["category"]) =>
  category === "images"
    ? ["image"]
    : category === "files"
      ? ["file", "artifact"]
      : ["file", "artifact", "image"];

export function searchGptResults(
  scope: string,
  items: ResultItem[],
  revision: string,
  query: ResultSearchQuery,
): ResultSearchPage {
  const after = cursor(scope, query);
  if (after.revision && after.revision !== revision) throw changed();
  const allowed = types(query.category),
    term = resultSearchText(query.q);
  const sorted = items.filter((item) => allowed.includes(item.type));
  if (query.sort === "oldest") sorted.reverse();
  if (query.sort === "name")
    sorted.sort((a, b) => {
      const left = resultSearchText(a.title),
        right = resultSearchText(b.title);
      return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const offset = after.offset ?? 0,
    found: ResultSearchHit[] = [];
  let scanned = 0;
  for (const item of sorted.slice(offset, offset + 500)) {
    scanned++;
    if (resultSearchText(item.title).includes(term)) found.push(resultSearchHit(item));
    if (found.length === 40) break;
  }
  return {
    items: found,
    scanned,
    nextCursor:
      offset + scanned < sorted.length
        ? encode({ binding: after.binding, revision, offset: offset + scanned })
        : null,
  };
}

const registered = new WeakSet<Store>();
export function searchStoredResults(
  store: Store,
  scope: { threadId: string } | { projectId: string },
  query: ResultSearchQuery,
): ResultSearchPage {
  if (!registered.has(store)) {
    store.db.function("result_search_name", { deterministic: true }, (text) =>
      resultSearchText(String(text ?? "")),
    );
    registered.add(store);
  }
  const where = "threadId" in scope ? "r.threadId=?" : "t.projectId=?";
  const id = "threadId" in scope ? scope.threadId : scope.projectId;
  const after = cursor(JSON.stringify(scope), query),
    allowed = types(query.category);
  const base = `FROM results r JOIN threads t ON t.id=r.threadId WHERE ${where} AND r.type IN (${allowed.map(() => "?").join(",")})`;
  const ceiling =
    after.ceiling ??
    Number(store.db.prepare(`SELECT COALESCE(max(r.rowid),0) n ${base}`).get(id, ...allowed)?.n);
  const params: (string | number)[] = [id, ...allowed, ceiling];
  let condition = " AND r.rowid<=?";
  const order =
    query.sort === "name"
      ? "result_search_name(r.title),r.rowid"
      : `r.rowid ${query.sort === "newest" ? "DESC" : "ASC"}`;
  if (after.row !== undefined) {
    const previous = store.db
      .prepare(`SELECT r.rowid,result_search_name(r.title) name ${base} AND r.rowid=?`)
      .get(id, ...allowed, after.row);
    if (!previous || (query.sort === "name" && previous.name !== after.name)) throw changed();
    if (query.sort === "name") {
      condition +=
        " AND (result_search_name(r.title)>? OR (result_search_name(r.title)=? AND r.rowid>?))";
      params.push(after.name ?? "", after.name ?? "", after.row);
    } else {
      condition += ` AND r.rowid${query.sort === "newest" ? "<" : ">"}?`;
      params.push(after.row);
    }
  }
  const rows = store.db
    .prepare(
      `SELECT r.rowid AS row,r.id,r.threadId,r.turnId,r.title,r.type,r.createdAt,t.title threadTitle ${base}${condition} ORDER BY ${order} LIMIT 501`,
    )
    .all(...params) as unknown as (ResultSearchHit & { row: number })[];
  const found: ResultSearchHit[] = [],
    term = resultSearchText(query.q);
  let scanned = 0;
  for (const item of rows.slice(0, 500)) {
    scanned++;
    if (resultSearchText(item.title).includes(term)) found.push(resultSearchHit(item));
    if (found.length === 40) break;
  }
  const last = rows[scanned - 1];
  return {
    items: found,
    scanned,
    nextCursor:
      last && rows.length > scanned
        ? encode({
            binding: after.binding,
            ceiling,
            row: last.row,
            name: resultSearchText(last.title),
          })
        : null,
  };
}
