import { z } from "zod";
import type { ResultItem } from "./results.js";

export const resultSearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  category: z.enum(["all", "files", "images"]).default("all"),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
  cursor: z.string().max(4096).optional(),
});
export type ResultSearchQuery = z.infer<typeof resultSearchQuerySchema>;
/** No URLs, paths, binary data, excerpts or tool payloads. Resolve the exact item on opening. */
export type ResultSearchHit = Pick<
  ResultItem,
  "id" | "title" | "type" | "createdAt" | "turnId" | "threadId" | "threadTitle"
>;
export type ResultSearchPage = {
  items: ResultSearchHit[];
  nextCursor: string | null;
  scanned: number;
};
