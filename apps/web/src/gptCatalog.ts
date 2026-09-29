import type { GptConversation, GptProject } from "@codex-web/shared";
import type { LibraryEntity } from "./EntityMenu";

export interface GptCatalogPage {
  items: GptConversation[];
  nextOffset: number | null;
  pinnedIds?: string[];
  library?: LibraryEntity[];
}

// Refresh the already loaded prefix as one snapshot. A page is not a change feed:
// keeping its missing rows resurrects native deletions, archives and moved chats.
// Re-reading the prefix also rebases offset pagination after insertions/removals.
export async function readGptNavigation(
  page: (offset: number) => Promise<GptCatalogPage>,
  projects: () => Promise<{ items: GptProject[]; conversations: GptConversation[] }>,
  throughOffset = 0,
) {
  const [first, projectList] = await Promise.all([page(0), projects()]);
  const rows = new Map(first.items.map((row) => [row.id, row]));
  let last = first;
  let lastOffset = 0;
  while (last.nextOffset !== null && last.nextOffset <= throughOffset) {
    const offset = last.nextOffset;
    if (!Number.isSafeInteger(offset) || offset <= lastOffset || offset > 10000)
      throw new Error("Invalid GPT catalog cursor");
    last = await page(offset);
    lastOffset = offset;
    for (const row of last.items) if (!rows.has(row.id)) rows.set(row.id, row);
  }
  const metadata = new Map(
    (last.library ?? first.library ?? []).filter((e) => e.kind === "thread").map((e) => [e.id, e]),
  );
  const projectIds = new Set(
    projectList.items.filter((p) => !p.deleted && !p.archived).map((p) => p.id),
  );
  for (const row of projectList.conversations) {
    if (row.projectId && projectIds.has(row.projectId)) rows.set(row.id, row);
  }
  return {
    items: [...rows.values()].map((row) => ({
      ...row,
      title: metadata.get(row.id)?.name || row.title,
      pinned: first.pinnedIds ? first.pinnedIds.includes(row.id) : row.pinned,
      pinnedOrder: first.pinnedIds ? first.pinnedIds.indexOf(row.id) : row.pinnedOrder,
      archived: metadata.get(row.id)?.archived ?? row.archived,
      deleted: metadata.get(row.id)?.deleted ?? row.deleted,
    })),
    projects: projectList.items,
    nextOffset: last.nextOffset,
    lastOffset,
  };
}
