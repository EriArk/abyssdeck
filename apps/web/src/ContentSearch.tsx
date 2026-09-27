import type { NotebookLink } from "@codex-web/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, messageOf } from "./api";
import { Icon } from "./icons";
import "./quick-capture.css";
export type SearchRequest = {
  client: "codex" | "gpt";
  threadId?: string;
  projectId?: string;
  query?: string;
};
type Page = {
  items: { target: NotebookLink; snippet: string }[];
  nextOffset: number | null;
  coverage: string;
  scanned: number;
};
export function openContentSearch(detail: SearchRequest) {
  window.dispatchEvent(new CustomEvent("workspace-content-search", { detail }));
}
export function ContentSearch({
  request,
  onClose,
  onTarget,
}: {
  request: SearchRequest;
  onClose: () => void;
  onTarget: (target: NotebookLink) => void;
}) {
  const [query, setQuery] = useState(request.query ?? ""),
    [scope, setScope] = useState(request.threadId ? "chat" : request.projectId ? "project" : "all"),
    [kind, setKind] = useState("all"),
    [result, setResult] = useState<Page | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef<AbortController | null>(null),
    last = useRef("");
  const reset = () => {
    pending.current?.abort();
    setBusy(false);
    setError("");
    setResult(null);
  };
  useEffect(() => {
    const focus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    dialog.current?.focus({ preventScroll: true });
    return () => {
      pending.current?.abort();
      dialog.current?.close();
      focus?.focus({ preventScroll: true });
    };
  }, []);
  const search = async (more = false) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    if (!more) setResult(null);
    const params = new URLSearchParams({
      q: query.trim(),
      client: request.client,
      offset: String(more ? (result?.nextOffset ?? 0) : 0),
      kind,
    });
    if (scope === "chat" && request.threadId) params.set("threadId", request.threadId);
    if (scope === "project" && request.projectId) params.set("projectId", request.projectId);
    try {
      const page = await api<Page>("/workspace/search?" + params, { signal: controller.signal });
      if (!controller.signal.aborted) {
        last.current = query;
        setResult((old) =>
          more && old
            ? {
                ...page,
                scanned: old.scanned + page.scanned,
                items: [...old.items, ...page.items]
                  .filter(
                    (item, index, all) =>
                      all.findIndex(
                        (other) => JSON.stringify(other.target) === JSON.stringify(item.target),
                      ) === index,
                  )
                  .slice(0, 200),
              }
            : page,
        );
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(messageOf(e));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: The opening query is a one-time handoff, not a live search on each edit.
  useEffect(() => {
    if ((request.query?.trim().length ?? 0) >= 2) void search();
  }, []);
  const labels = {
    note: "Заметка",
    task: "Задача",
    plan: "План",
    report: "Отчёт",
    thread: "Сообщение",
    result: "Файл / изображение",
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="quick-capture-dialog content-search"
      tabIndex={-1}
      aria-label="Поиск по содержимому"
      onCancel={onClose}
    >
      <header>
        <Icon name="search" />
        <h2>Поиск по содержимому</h2>
        <button type="button" className="icon-button" aria-label="Закрыть поиск" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="quick-capture-content">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            type="search"
            aria-label="Искать в тексте"
            value={query}
            maxLength={120}
            onChange={(e) => {
              reset();
              setQuery(e.target.value);
            }}
            placeholder="Текст сообщения, записи или название файла…"
          />
          <select
            aria-label="Где искать"
            value={scope}
            onChange={(e) => {
              reset();
              setScope(e.target.value);
              setKind("all");
            }}
          >
            <option value="all">Везде</option>
            {request.projectId && <option value="project">Этот проект</option>}
            {request.threadId && (
              <option value="chat">Этот чат · {request.client === "gpt" ? "GPT" : "Codex"}</option>
            )}
          </select>
          {!(scope === "chat" && request.client === "gpt") && (
            <select
              aria-label="Что искать"
              value={kind}
              onChange={(e) => {
                reset();
                setKind(e.target.value);
              }}
            >
              <option value="all">Все типы</option>
              <option value="messages">Сообщения</option>
              <option value="records">Записи и планы</option>
              <option value="files">Файлы</option>
            </select>
          )}
          <button type="submit" className="primary" disabled={busy || query.trim().length < 2}>
            Найти
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Ищем…</p>}
        {result && (
          <>
            <details className="content-search-coverage">
              <summary>Найдено: {result.items.length} · Область поиска</summary>
              <p>{result.coverage}</p>
              <small>Проверено элементов: {result.scanned}</small>
            </details>
            {!result.items.length && !busy && <p>В проверенной части совпадений нет.</p>}
            {result.items.map((item) => (
              <button
                type="button"
                className="content-search-result secondary"
                key={JSON.stringify(item.target)}
                onClick={() => {
                  onClose();
                  onTarget(item.target);
                }}
              >
                <small>
                  {labels[item.target.kind as keyof typeof labels] ?? "Источник"} ·{" "}
                  {item.target.client === "gpt" ? "GPT" : "Codex"}
                </small>
                <strong>{item.target.title}</strong>
                {item.snippet.trim() !== item.target.title && <span>{item.snippet}</span>}
              </button>
            ))}
            {result.nextOffset !== null && result.items.length < 200 && (
              <button
                type="button"
                className="secondary"
                disabled={busy || last.current !== query}
                onClick={() => void search(true)}
              >
                Искать дальше
              </button>
            )}
            {result.nextOffset !== null && result.items.length >= 200 && (
              <p>Показано 200 совпадений. Уточни запрос или выбери проект.</p>
            )}
          </>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
