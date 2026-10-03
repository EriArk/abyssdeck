import { useEffect, useRef, useState } from "react";
import { accountLocalStorage as storage } from "./accountStorage";
import type { ReadingDocument } from "./bookReader/document";
import {
  appendBookmark,
  BOOKMARK_KEY,
  findReaderMatches,
  parseBookmarks,
  type ReaderBookmark,
  type ReaderLocation,
  type ReaderMatch,
  SEARCH_LIMIT,
  SEARCH_TEXT_BUDGET,
  validLocation,
} from "./bookReader/navigation";
import { readerTextBlocks } from "./bookReader/pages";
import { Icon } from "./icons";

export function ReaderNavigation({
  book,
  mode,
  onClose,
  position,
  jump,
  busy,
}: {
  book: ReadingDocument;
  mode: "search" | "bookmarks" | null;
  onClose(): void;
  position(): (ReaderLocation & { excerpt: string }) | undefined;
  jump(location: ReaderLocation, hit?: ReaderMatch): Promise<boolean>;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ReaderMatch[]>([]);
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);
  const [error, setError] = useState("");
  const job = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const ended = () => {
      live.current = false;
      job.current?.abort();
      setBookmarks([]);
      setMatches([]);
      setSearching(false);
    };
    window.addEventListener("private-session-ended", ended);
    return () => {
      window.removeEventListener("private-session-ended", ended);
      live.current = false;
      job.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!live.current) return;
    setError("");
    if (!mode) {
      job.current?.abort();
      setSearching(false);
      return;
    }
    if (mode === "bookmarks") {
      job.current?.abort();
      setSearching(false);
      try {
        setBookmarks(
          parseBookmarks(storage.getItem(BOOKMARK_KEY)).filter(
            (v) => v.book === book.id && validLocation(v, book.titles.length),
          ),
        );
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }, [mode, book]);
  const search = async () => {
    if (!live.current) return;
    job.current?.abort();
    const controller = new AbortController();
    job.current = controller;
    const current = () => live.current && !controller.signal.aborted;
    setMatches([]);
    setError("");
    setStatus("");
    if (!query.trim()) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const found: ReaderMatch[] = [];
    let scanned = 0,
      partial = false;
    try {
      for (let chapter = 0; chapter < book.titles.length; chapter++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!current()) return;
        const value = await book.chapter(chapter);
        if (!current()) return;
        const dom = document.createElement("article");
        dom.innerHTML = value;
        const blocks = readerTextBlocks(dom);
        const length = blocks.reduce((sum, block) => sum + block.text.length, 0);
        if (scanned + length > SEARCH_TEXT_BUDGET) {
          partial = true;
          break;
        }
        scanned += length;
        found.push(
          ...findReaderMatches(
            blocks.map((v) => v.text),
            query,
            chapter,
            SEARCH_LIMIT - found.length,
          ),
        );
        if (found.length >= SEARCH_LIMIT) {
          partial = true;
          break;
        }
        setStatus(`Поиск: раздел ${chapter + 1} из ${book.titles.length}`);
      }
      if (current()) {
        setMatches(found);
        setStatus(
          partial
            ? `Показано ${found.length}. Поиск неполный: достигнут бюджет. Уточни запрос.`
            : found.length
              ? `Найдено: ${found.length}`
              : "Совпадений нет.",
        );
      }
    } catch {
      if (current()) {
        setMatches(found);
        setError("Не удалось закончить поиск по книге.");
        setStatus(`Найдено: ${found.length}. Поиск неполный.`);
      }
    } finally {
      if (current()) setSearching(false);
    }
  };
  const add = () => {
    const at = position();
    if (!live.current || !at || busy) return;
    try {
      const all = appendBookmark(parseBookmarks(storage.getItem(BOOKMARK_KEY)), {
        ...at,
        anchor: { ...at.anchor },
        excerpt: at.excerpt.slice(0, 240),
        book: book.id,
        id: crypto.randomUUID(),
        created: Date.now(),
      });
      storage.setItem(BOOKMARK_KEY, JSON.stringify(all));
      setBookmarks(all.filter((v) => v.book === book.id));
      setError("");
    } catch (e) {
      setError((e as Error).message || "Не удалось сохранить закладку.");
    }
  };
  const remove = (id: string) => {
    if (!live.current) return;
    try {
      const all = parseBookmarks(storage.getItem(BOOKMARK_KEY)).filter(
        (v) => !(v.book === book.id && v.id === id),
      );
      storage.setItem(BOOKMARK_KEY, JSON.stringify(all));
      setBookmarks(all.filter((v) => v.book === book.id));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const go = async (at: ReaderLocation, hit?: ReaderMatch) => {
    setError("");
    if (await jump(at, hit)) onClose();
    else if (live.current) setError("Не удалось перейти к этому месту.");
  };
  if (!mode) return null;
  return (
    <section
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="reader-navigation"
      aria-label={mode === "search" ? "Поиск по книге" : "Закладки книги"}
    >
      <div className="reader-navigation-heading">
        <strong>{mode === "search" ? "Поиск по книге" : "Закладки"}</strong>
        <button
          className="icon-button"
          type="button"
          aria-label="Закрыть навигацию книги"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {mode === "search" ? (
        <>
          <form
            className="reader-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              type="search"
              aria-label="Найти в книге"
              placeholder="Найти в книге"
              maxLength={256}
              value={query}
              onChange={(e) => {
                job.current?.abort();
                setSearching(false);
                setQuery(e.target.value);
                setMatches([]);
                setStatus("");
              }}
            />
            <button
              className="icon-button"
              type="submit"
              aria-label="Искать в книге"
              disabled={!query.trim()}
            >
              <Icon name="search" />
            </button>
          </form>
          <small role="status">{searching ? status || "Поиск…" : status}</small>
        </>
      ) : (
        <>
          <button
            className="secondary reader-bookmark-add"
            type="button"
            disabled={busy}
            onClick={add}
          >
            <Icon name="plus" /> Закладка здесь
          </button>
          <small>Личные закладки в этом браузере.</small>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="reader-navigation-list">
        {mode === "search" ? (
          matches.map((hit, i) => (
            <button
              key={`${hit.chapter}:${hit.anchor.block}:${hit.anchor.char}`}
              className="reader-navigation-entry"
              type="button"
              disabled={busy}
              onClick={() => void go(hit, hit)}
            >
              <strong>
                {i + 1}. {book.titles[hit.chapter]}
              </strong>
              <span>{hit.excerpt}</span>
            </button>
          ))
        ) : bookmarks.length ? (
          bookmarks.map((mark) => (
            <div key={mark.id} className="reader-bookmark-row">
              <button
                className="reader-navigation-entry"
                type="button"
                disabled={busy}
                onClick={() => void go(mark)}
              >
                <strong>{book.titles[mark.chapter]}</strong>
                <span>{mark.excerpt || "Начало раздела"}</span>
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Удалить закладку: ${mark.excerpt || book.titles[mark.chapter]}`}
                onClick={() => remove(mark.id)}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))
        ) : (
          <p>Закладок пока нет.</p>
        )}
      </div>
    </section>
  );
}
