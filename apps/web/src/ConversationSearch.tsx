import { useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
import { Icon } from "./icons";

type Hit = {
  seq: number;
  author: { id: string; name: string };
  text: string;
  files: string[];
  createdAt: number;
};
export function ConversationSearch({
  path,
  onChoose,
  onClose,
}: {
  path: string;
  onChoose: (seq: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<Hit[]>([]),
    [before, setBefore] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  async function search(more = false) {
    const q = query.trim();
    if (!q) return;
    const token = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ items: Hit[]; before: number | null }>(
        `${path}/search?${new URLSearchParams({ q, ...(more && before ? { before: String(before) } : {}) })}`,
        { signal: request.signal },
      );
      if (token !== generation.current) return;
      setItems((old) => (more ? [...old, ...r.items].slice(-100) : r.items));
      setBefore(r.before);
      setSearched(true);
    } catch (e) {
      if (token === generation.current && !request.signal.aborted) setError(messageOf(e));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  return (
    <section className="conversation-search" aria-label="Поиск по переписке">
      <form
        className="conversation-search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          type="search"
          aria-label="Текст или имя файла"
          placeholder="Текст или имя файла"
          maxLength={120}
          value={query}
          onChange={(e) => {
            generation.current++;
            controller.current?.abort();
            setBusy(false);
            setQuery(e.target.value);
            setItems([]);
            setBefore(null);
            setError("");
            setSearched(false);
          }}
        />
        <button
          type="submit"
          className="icon-button"
          aria-label="Найти в переписке"
          disabled={busy || !query.trim()}
        >
          <Icon name="search" />
        </button>
        <button type="button" className="icon-button" aria-label="Закрыть поиск" onClick={onClose}>
          <Icon name="close" />
        </button>
      </form>
      {busy && <small role="status">Ищем…</small>}
      {error && <p role="alert">{error}</p>}
      <div className="conversation-search-hits">
        {items.map((hit) => (
          <button
            type="button"
            className="conversation-search-hit secondary"
            key={hit.seq}
            onClick={() => onChoose(hit.seq)}
          >
            <small>
              {hit.author.name} · {new Date(hit.createdAt).toLocaleString()}
            </small>
            <span>{hit.text || "Файл"}</span>
            {hit.files.length > 0 && <small>{hit.files.join(" · ")}</small>}
          </button>
        ))}
      </div>
      {before !== null && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void search(true)}
        >
          Искать дальше
        </button>
      )}
      {!busy && !error && items.length === 0 && before !== null && (
        <small>В этой части переписки совпадений нет.</small>
      )}
      {searched && !busy && !error && items.length === 0 && before === null && (
        <small>Совпадений не найдено.</small>
      )}
    </section>
  );
}
