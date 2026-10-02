import type { ResultPage } from "@codex-web/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import { resultPreview } from "./resultPreview";
import type { Result } from "./types";

// A viewer's image sequence is independent of the feed's category and scroll.
// Read only while open; changing the account/conversation discards late responses.
export function useResultImages(
  endpoint: string | undefined,
  active: boolean,
  current: Result | null,
  known: Result[],
  onSelect: (result: Result) => void,
) {
  const [page, setPage] = useState<{
    endpoint: string;
    items: Result[];
    cursor: string | number | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const currentId = useRef(current?.id);
  useLayoutEffect(() => {
    currentId.current = current?.id;
  }, [current?.id]);
  const generation = useRef(0),
    lock = useRef(false);
  useEffect(() => {
    const serial = ++generation.current;
    setPage(null);
    lock.current = false;
    setBusy(false);
    if (!endpoint || !active) return;
    const abort = new AbortController();
    lock.current = true;
    setBusy(true);
    void api<ResultPage>(endpoint + "?category=images", { signal: abort.signal })
      .then((value) => {
        if (serial === generation.current)
          setPage({ endpoint, items: value.items, cursor: value.nextBefore });
      })
      .catch(() => {})
      .finally(() => {
        if (serial === generation.current) {
          lock.current = false;
          setBusy(false);
        }
      });
    return () => {
      abort.abort();
      generation.current++;
    };
  }, [endpoint, active]);
  const saved = page?.endpoint === endpoint ? page : null;
  const images = [
    ...new Map(
      [...(saved?.items ?? []), ...known.filter((r) => resultPreview(r).kind === "image")].map(
        (r) => [r.id, r],
      ),
    ).values(),
  ];
  if (current && !images.some((r) => r.id === current.id)) images.unshift(current);
  const index = Math.max(
    0,
    images.findIndex((r) => r.id === current?.id),
  );
  const older = async () => {
    if (!endpoint || lock.current || !saved || saved.cursor === null) return;
    lock.current = true;
    setBusy(true);
    const serial = generation.current;
    const selectedId = currentId.current;
    try {
      const value = await api<ResultPage>(
        endpoint + "?" + new URLSearchParams({ category: "images", before: String(saved.cursor) }),
      );
      if (serial !== generation.current) return;
      const next = value.items.find((r) => !images.some((old) => old.id === r.id));
      setPage({ endpoint, items: [...saved.items, ...value.items], cursor: value.nextBefore });
      if (next && currentId.current === selectedId) onSelect(next);
    } catch {
      /* Keep the current image and allow a fresh explicit retry. */
    } finally {
      if (serial === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  return {
    index,
    count: images.length,
    previous: index > 0 ? () => onSelect(images[index - 1]!) : undefined,
    next:
      index + 1 < images.length
        ? () => onSelect(images[index + 1]!)
        : !busy && saved?.cursor != null
          ? () => void older()
          : undefined,
  };
}
