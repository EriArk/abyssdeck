import {
  destinationKey,
  destinationSchema,
  navigationPreferencesSchema,
  shortcutOverridesSchema,
  type WorkspaceDestinationItem,
  workspaceActions,
} from "@codex-web/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Sessions } from "./sessions.js";

/** This module runs inside the actor's private engine/SQLite, never the Team catalog. */
export function registerWorkspaceNavigation(app: FastifyInstance, sessions: Sessions) {
  const store = sessions.store;
  store.db.function("navigation_fold", { deterministic: true }, (value) =>
    String(value ?? "").toLocaleLowerCase(),
  );
  const preferences = () => {
    const raw = store.preferences();
    const parsed = navigationPreferencesSchema.safeParse(raw.navigationPlaces);
    const shortcuts = shortcutOverridesSchema.safeParse(raw.shortcuts);
    return {
      ...(parsed.success ? parsed.data : { recent: [], pinned: [] }),
      shortcuts:
        raw.shortcuts === undefined
          ? {}
          : shortcuts.success
            ? shortcuts.data
            : Object.fromEntries(workspaceActions.map((a) => [a.id, null])),
      shortcutWarning:
        raw.shortcuts !== undefined && !shortcuts.success
          ? "Сохранённые сочетания больше не проходят проверку. Назначь их заново или верни стандартные."
          : "",
    };
  };
  app.get("/api/workspace/navigation", () => preferences());
  app.patch("/api/workspace/navigation", (req) => {
    const change = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("visit"), ref: destinationSchema }).strict(),
        z.object({ action: z.literal("pin"), ref: destinationSchema, value: z.boolean() }).strict(),
        z.object({ action: z.literal("clear") }).strict(),
        z.object({ action: z.literal("shortcuts"), value: shortcutOverridesSchema }).strict(),
      ])
      .parse(req.body);
    const current = preferences();
    if (change.action === "shortcuts") store.setPreferences({ shortcuts: change.value });
    else {
      if (change.action === "clear") current.recent = [];
      else {
        const key = destinationKey(change.ref);
        if (change.action === "visit")
          current.recent = [
            change.ref,
            ...current.recent.filter((r) => destinationKey(r) !== key),
          ].slice(0, 32);
        else
          current.pinned = [
            ...(change.value ? [change.ref] : []),
            ...current.pinned.filter((r) => destinationKey(r) !== key),
          ].slice(0, 16);
      }
      store.setPreferences({
        navigationPlaces: { recent: current.recent, pinned: current.pinned },
      });
    }
    return preferences();
  });
  app.get("/api/workspace/destinations", (req) => {
    const query = z
      .object({
        q: z.string().max(120).default(""),
        client: z.enum(["codex", "gpt"]).optional(),
        projectId: z.string().max(100).optional(),
        id: z.string().max(100).optional(),
      })
      .parse(req.query);
    const output: WorkspaceDestinationItem[] = [];
    const projects = sessions.catalog.projects().filter((p) => {
      const meta = sessions.catalog.library.get("project", p.id);
      return !meta?.deleted && !meta?.archived;
    });
    const projectIds = new Set(projects.map((p) => p.id));
    for (const p of projects) {
      if (p.unassigned) continue;
      output.push({
        ref: { client: "codex", kind: "project", id: p.id },
        title: p.name,
        subtitle: "Проект · Codex",
        projectId: p.id,
      });
      output.push({
        ref: { client: "codex", kind: "discuss", id: p.id },
        title: p.name,
        subtitle: "Обсуждение проекта · GPT",
        projectId: p.id,
      });
    }
    const q = `%${query.q.toLocaleLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const saved = preferences();
    const ids = [...saved.recent, ...saved.pinned].map((r) => r.id);
    if (query.id) ids.push(query.id);
    const placeholders = ids.map(() => "?").join(",") || "NULL";
    // Search bounded metadata only, no native reads, remote directory scans or conversation bodies.
    const threads = store.db
      .prepare(
        `SELECT * FROM threads WHERE (navigation_fold(title) LIKE ? ESCAPE '\\' OR id IN (${placeholders})) AND (? IS NULL OR projectId=?) ORDER BY (id IN (${placeholders})) DESC,updatedAt DESC LIMIT 300`,
      )
      .all(q, ...ids, query.projectId ?? null, query.projectId ?? null, ...ids);
    for (const row of threads) {
      const meta = sessions.catalog.library.get("thread", String(row.codexThreadId));
      if (!projectIds.has(String(row.projectId)) || meta?.deleted || meta?.archived) continue;
      output.push({
        ref: { client: "codex", kind: "thread", id: String(row.id) },
        title: meta?.name || String(row.title),
        subtitle: "Диалог · Codex",
        projectId: String(row.projectId),
      });
    }
    const native = store.db
      .prepare(
        `SELECT id,kind,value FROM library_entities WHERE client='gpt' AND (navigation_fold(json_extract(value,'$.name')) LIKE ? ESCAPE '\\' OR id IN (${placeholders})) AND (? IS NULL OR json_extract(value,'$.projectId')=? OR (kind='project' AND id=?)) ORDER BY (id IN (${placeholders})) DESC LIMIT 300`,
      )
      .all(
        q,
        ...ids,
        query.projectId ?? null,
        query.projectId ?? null,
        query.projectId ?? null,
        ...ids,
      );
    for (const row of native) {
      const entry = JSON.parse(String(row.value));
      if (entry.deleted || entry.archived || String(row.id).startsWith("outbox:")) continue;
      if (entry.projectId) {
        const parent = store.db
          .prepare(
            "SELECT value FROM library_entities WHERE client='gpt' AND kind='project' AND id=?",
          )
          .get(entry.projectId);
        if (
          parent &&
          (JSON.parse(String(parent.value)).deleted || JSON.parse(String(parent.value)).archived)
        )
          continue;
      }
      output.push({
        ref: { client: "gpt", kind: row.kind as "project" | "thread", id: String(row.id) },
        title: entry.name || "Диалог GPT",
        subtitle: row.kind === "project" ? "Проект · GPT" : "Диалог · GPT",
        projectId: entry.projectId,
      });
    }
    const items = output.filter(
      (item) =>
        (!query.id || item.ref.id === query.id) &&
        (!query.client || item.ref.client === query.client) &&
        (!query.projectId || item.projectId === query.projectId) &&
        (!query.q ||
          `${item.title} ${item.subtitle}`
            .toLocaleLowerCase()
            .includes(query.q.toLocaleLowerCase())),
    );
    const priority = new Set([...saved.pinned, ...saved.recent].map(destinationKey));
    items.sort(
      (a, b) =>
        Number(priority.has(destinationKey(b.ref))) - Number(priority.has(destinationKey(a.ref))),
    );
    return { items: items.slice(0, 300), bounded: true };
  });
}
