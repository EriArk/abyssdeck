import type { Anchor } from "./pages";

export type ReaderLocation = { chapter: number; anchor: Anchor };
export type ReaderMatch = ReaderLocation & { end: Anchor; excerpt: string };
export type ReaderBookmark = ReaderLocation & {
  id: string;
  book: string;
  excerpt: string;
  created: number;
};
export const BOOKMARK_KEY = "codexweb-reader-bookmarks";
export const SEARCH_LIMIT = 500;
export const SEARCH_TEXT_BUDGET = 8_000_000;
export function validLocation(value: ReaderLocation, chapters: number) {
  return (
    Number.isInteger(value?.chapter) &&
    value.chapter >= 0 &&
    value.chapter < chapters &&
    Number.isInteger(value.anchor?.block) &&
    value.anchor.block >= 0 &&
    Number.isInteger(value.anchor?.char) &&
    value.anchor.char >= 0
  );
}
/** Literal Unicode-insensitive search; whitespace may cross inline nodes or paragraphs. */
export function findReaderMatches(
  texts: string[],
  query: string,
  chapter: number,
  limit = SEARCH_LIMIT,
): ReaderMatch[] {
  const words = query.trim().split(/\s+/u).filter(Boolean);
  if (!words.length || limit < 1) return [];
  const expression = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const regex = new RegExp(expression, "giu");
  const starts: number[] = [];
  let offset = 0;
  for (const text of texts) {
    starts.push(offset);
    offset += text.length + 1;
  }
  const all = texts.join("\n");
  const locate = (at: number): Anchor => {
    let low = 0,
      high = starts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (starts[mid]! <= at) low = mid;
      else high = mid - 1;
    }
    return { block: low, char: Math.min(texts[low]!.length, at - starts[low]!) };
  };
  const matches: ReaderMatch[] = [];
  for (const match of all.matchAll(regex)) {
    matches.push({
      chapter,
      anchor: locate(match.index),
      end: locate(match.index + match[0].length),
      excerpt: all
        .slice(Math.max(0, match.index - 45), match.index + match[0].length + 85)
        .replace(/\s+/gu, " ")
        .trim(),
    });
    if (matches.length >= limit) break;
  }
  return matches;
}
export function parseBookmarks(raw: string | null): ReaderBookmark[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 1000)
    throw Error("Не удалось прочитать сохранённые закладки.");
  if (
    !value.every(
      (v) =>
        typeof v?.id === "string" &&
        v.id.length <= 64 &&
        typeof v.book === "string" &&
        v.book.length <= 150 &&
        validLocation(v, Number.MAX_SAFE_INTEGER) &&
        typeof v.excerpt === "string" &&
        v.excerpt.length <= 240 &&
        Number.isFinite(v.created),
    )
  )
    throw Error("Не удалось прочитать сохранённые закладки.");
  return value;
}
export function appendBookmark(all: ReaderBookmark[], bookmark: ReaderBookmark) {
  if (
    all.some(
      (v) =>
        v.book === bookmark.book &&
        v.chapter === bookmark.chapter &&
        v.anchor.block === bookmark.anchor.block &&
        v.anchor.char === bookmark.anchor.char,
    )
  )
    return all;
  if (all.length >= 1000 || all.filter((v) => v.book === bookmark.book).length >= 200)
    throw Error("Место для закладок заполнено. Удали ненужные закладки.");
  return [...all, bookmark];
}
