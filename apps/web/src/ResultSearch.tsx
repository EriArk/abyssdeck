import type {
  ResultCategory,
  ResultItem,
  ResultSearchHit,
  ResultSearchPage,
  ResultSearchQuery,
} from "@codex-web/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pageWorkspace } from "./accountStorage";
import { ApiError, api, messageOf } from "./api";
import { Icon } from "./icons";
import { ResultBatchActions, resultSelectable } from "./ResultBatchActions";
import { ResultFilePreview } from "./ResultFilePreview";
import { useWorkspaceDialog } from "./useWorkspaceDialog";
import "./result-search.css";

export function ResultSearch({
  endpoint,
  initialCategory,
  onClose,
  onSelect,
  onTurn,
}: {
  endpoint: string;
  initialCategory: ResultCategory;
  onClose: () => void;
  onSelect: (id: string) => void;
  onTurn?: (id: string, threadId?: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(dialog, true, "result-search");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState<ResultSearchQuery["category"]>(
      initialCategory === "files" || initialCategory === "images" ? initialCategory : "all",
    ),
    [sort, setSort] = useState<ResultSearchQuery["sort"]>("newest");
  const [page, setPage] = useState<ResultSearchPage | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<ResultSearchHit | null>(null),
    [opened, setOpened] = useState<ResultItem | null>(null),
    [openError, setOpenError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<ResultItem[]>([]);
  const [selectBusy, setSelectBusy] = useState(false);
  const selectionRequest = useRef<AbortController | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: selection belongs to one exact Results endpoint.
  useEffect(() => {
    setChosen([]);
    setSelectBusy(false);
    return () => selectionRequest.current?.abort();
  }, [endpoint]);
  const choose = async (hits: ResultSearchHit[]) => {
    if (selectBusy) return;
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelectBusy(true);
    setError("");
    try {
      const items = [...chosen];
      for (const hit of hits) {
        if (items.some((item) => item.id === hit.id) || items.length >= 100) continue;
        const item = await api<ResultItem>(endpoint + "/" + encodeURIComponent(hit.id), {
          signal: controller.signal,
        });
        item.threadId ??=
          hit.threadId ?? endpoint.match(/\/(?:threads|conversations)\/([^/]+)\/results/)?.[1];
        if (!resultSelectable(item)) throw new Error("Этот результат нельзя добавить в пакет.");
        items.push(item);
      }
      if (!controller.signal.aborted) setChosen(items);
    } catch (e) {
      if (!controller.signal.aborted) setError(messageOf(e));
    } finally {
      if (!controller.signal.aborted) setSelectBusy(false);
    }
  };
  const pending = useRef<AbortController | null>(null),
    opening = useRef<AbortController | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const scope = JSON.stringify([endpoint, query.trim(), category, sort]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const load = async (more = false) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const captured = scope;
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ q: query.trim(), category, sort });
    if (more && page?.nextCursor) params.set("cursor", page.nextCursor);
    try {
      const next = await api<ResultSearchPage>(endpoint + "/search?" + params, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || activeScope.current !== captured) return;
      setPage((old) =>
        more && old
          ? {
              ...next,
              scanned: old.scanned + next.scanned,
              items: [
                ...new Map([...old.items, ...next.items].map((item) => [item.id, item])).values(),
              ].slice(0, 200),
            }
          : next,
      );
    } catch (e) {
      if (controller.signal.aborted || activeScope.current !== captured) return;
      if (more && e instanceof ApiError && e.code === "RESULTS_CHANGED") {
        setSelected(null);
        setOpened(null);
        setPage(null);
        void load();
        return;
      }
      setError(messageOf(e));
    } finally {
      if (!controller.signal.aborted && activeScope.current === captured) setBusy(false);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: The scope owns cancellation and replaces the list only on an explicit query/filter change.
  useEffect(() => {
    pending.current?.abort();
    opening.current?.abort();
    setPage(null);
    setError("");
    setSelected(null);
    setOpened(null);
    setBusy(true);
    if (scroll.current) scroll.current.scrollTop = 0;
    const timer = setTimeout(() => void load(), 220);
    return () => {
      clearTimeout(timer);
      pending.current?.abort();
      opening.current?.abort();
    };
  }, [scope]);
  const open = async (hit: ResultSearchHit) => {
    opening.current?.abort();
    const controller = new AbortController();
    opening.current = controller;
    setSelected(hit);
    setOpened(null);
    setOpenError("");
    try {
      const item = await api<ResultItem>(endpoint + "/" + encodeURIComponent(hit.id), {
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        setOpened({
          ...item,
          threadId:
            item.threadId ?? endpoint.match(/\/(?:threads|conversations)\/([^/]+)\/results/)?.[1],
        });
    } catch (e) {
      if (!controller.signal.aborted) setOpenError(messageOf(e));
    }
  };
  const closeFile = () => {
    opening.current?.abort();
    setSelected(null);
    setOpened(null);
  };
  const index = page?.items.findIndex((item) => item.id === selected?.id) ?? -1;
  return createPortal(
    <>
      <dialog
        ref={dialog}
        className="result-search-dialog workspace-window"
        aria-label="Поиск файлов в результатах"
        tabIndex={-1}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <header>
          <Icon name="search" />
          <h2>Файлы в результатах</h2>
          {pageWorkspace && (
            <button
              type="button"
              className="icon-button"
              aria-label="Выбрать несколько найденных файлов"
              aria-pressed={selecting}
              onClick={() => setSelecting((v) => !v)}
            >
              <Icon name="check" />
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть поиск результатов"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="result-search-controls">
          <input
            type="search"
            aria-label="Название файла"
            placeholder="Название или расширение файла…"
            maxLength={120}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Тип результатов"
            value={category}
            onChange={(e) => setCategory(e.target.value as ResultSearchQuery["category"])}
          >
            <option value="all">Все файлы</option>
            <option value="files">Файлы</option>
            <option value="images">Изображения</option>
          </select>
          <select
            aria-label="Порядок результатов"
            value={sort}
            onChange={(e) => setSort(e.target.value as ResultSearchQuery["sort"])}
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="name">По имени</option>
          </select>
        </div>
        <div className="result-search-batch" hidden={!selecting}>
          <button
            type="button"
            className="secondary"
            disabled={selectBusy || !page?.items.length}
            onClick={() => void choose(page!.items)}
          >
            {selectBusy ? "Добавляем файлы…" : "Выбрать найденные на странице"}
          </button>
          <ResultBatchActions
            client={/^(?:\/api)?\/gpt\//.test(endpoint) ? "gpt" : "codex"}
            items={[]}
            selected={chosen}
            onSelect={setChosen}
            onClose={() => setSelecting(false)}
            hideSelectLoaded
            loading={selectBusy}
          />
        </div>
        <div className="result-search-list" ref={scroll}>
          {page?.items.map((hit) => (
            <div className="result-search-row" data-selecting={selecting} key={hit.id}>
              {selecting && (
                <label className="result-search-check">
                  <input
                    type="checkbox"
                    aria-label={`Выбрать ${hit.title}`}
                    checked={chosen.some((item) => item.id === hit.id)}
                    disabled={selectBusy}
                    onChange={(e) =>
                      e.target.checked
                        ? void choose([hit])
                        : setChosen((items) => items.filter((item) => item.id !== hit.id))
                    }
                  />
                </label>
              )}
              <button
                type="button"
                className="result-search-open"
                onClick={() => void open(hit)}
                aria-label={`Открыть ${hit.title}`}
              >
                <Icon name={hit.type === "image" ? "image" : "file"} />
                <span>
                  <strong>{hit.title}</strong>
                  <small>
                    {hit.threadTitle ? hit.threadTitle + " · " : ""}
                    {new Date(hit.createdAt).toLocaleString("ru", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`В ленте: ${hit.title}`}
                title="Показать в ленте результатов"
                onClick={() => {
                  onSelect(hit.id);
                  onClose();
                }}
              >
                <Icon name="results" />
              </button>
            </div>
          ))}
          {busy && <p role="status">Ищем…</p>}
          {error && (
            <p role="status">
              {error}{" "}
              <button type="button" className="secondary" onClick={() => void load(!!page)}>
                Повторить
              </button>
            </p>
          )}
          {!busy && !error && page && !page.items.length && (
            <p>
              {page.nextCursor ? "В проверенной части совпадений нет." : "Подходящих файлов нет."}
            </p>
          )}
          {page?.nextCursor && page.items.length < 200 && (
            <button
              type="button"
              className="secondary result-search-more"
              disabled={busy}
              onClick={() => void load(true)}
            >
              Показать ещё
            </button>
          )}
          {page?.nextCursor && page.items.length >= 200 && (
            <p>Показано 200 файлов. Уточни название или тип.</p>
          )}
        </div>
        <footer>
          <small>По названиям · {page?.items.length ?? 0} найдено</small>
          <button
            type="button"
            className="icon-button"
            aria-label="Обновить поиск результатов"
            disabled={busy}
            onClick={() => {
              setPage(null);
              void load();
            }}
          >
            <Icon name="refresh" />
          </button>
        </footer>
      </dialog>
      {selected && (
        <ResultFilePreview
          result={opened ?? { ...selected, payload: {} }}
          resolving={!opened && !openError}
          resolutionError={openError}
          onClose={closeFile}
          navigation={
            index < 0
              ? undefined
              : {
                  index,
                  count: page?.items.length ?? 0,
                  previous: index > 0 ? () => void open(page!.items[index - 1]!) : undefined,
                  next:
                    index + 1 < (page?.items.length ?? 0)
                      ? () => void open(page!.items[index + 1]!)
                      : undefined,
                }
          }
          onSource={
            opened?.turnId && onTurn
              ? () => {
                  onTurn(opened.turnId!, opened.threadId);
                  onClose();
                }
              : undefined
          }
        />
      )}
    </>,
    document.body,
  );
}
