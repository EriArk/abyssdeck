import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { FileCopySave } from "./FileCopySave";
import { FileWorkspaceContext } from "./fileWorkspaceContext";
import { githubDraftStorage as storage } from "./githubDraftStorage";
import { Icon } from "./icons";
import type { OfficeDocument } from "./officePackage";
import {
  type CellEdit,
  cellAt,
  columnName,
  coordinate,
  copyRange,
  editedValues,
  editReason,
  exportWorkbook,
  range,
  visibleValue,
} from "./xlsxEditing";
import "./xlsx-workspace.css";

type Draft = { version: 1; edits: CellEdit[]; index: number };
export default function XlsxWorkspace({
  file,
  doc,
  source,
  enabled,
}: {
  file: File;
  doc: OfficeDocument;
  source?: string;
  enabled: boolean;
}) {
  const [sheet, setSheet] = useState(0),
    [page, setPage] = useState(0),
    [query, setQuery] = useState(""),
    [zoom, setZoom] = useState(100);
  const [selection, setSelection] = useState("A1"),
    [extend, setExtend] = useState(false),
    [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ version: 1, edits: [], index: 0 }),
    [key, setKey] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [closing, setClosing] = useState(false),
    [copy, setCopy] = useState<File | null>(null);
  const workspace = useContext(FileWorkspaceContext),
    guard = workspace?.closeGuard;
  const finish = useRef<() => void>(() => {}),
    state = useRef({ draft, key, busy }),
    live = useRef(true);
  state.current = { draft, key, busy };
  useEffect(() => {
    live.current = true;
    let current = true;
    void (async () => {
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const id = `workspace-xlsx-draft:${JSON.stringify([source || "local", file.name, hash])}`,
        saved = await storage.getItem(id);
      if (!current) return;
      if (saved) {
        const value = JSON.parse(saved) as Draft;
        if (
          value.version !== 1 ||
          !Array.isArray(value.edits) ||
          !Number.isInteger(value.index) ||
          value.index < 0 ||
          value.index > value.edits.length ||
          !value.edits.every(
            (e) =>
              Number.isInteger(e.sheet) &&
              !!doc.pages[e.sheet] &&
              !!coordinate(e.ref) &&
              typeof e.value === "string" &&
              ["text", "number", "boolean", "blank"].includes(e.type),
          )
        )
          throw Error("Не удалось восстановить черновик книги.");
        setDraft(value);
      }
      setKey(id);
    })().catch((e) => {
      if (current) setError(e.message);
    });
    return () => {
      current = false;
      live.current = false;
    };
  }, [file, source, doc]);
  const persist = async () => {
    const value = state.current;
    if (!value.key) return false;
    try {
      await storage.setItem(value.key, JSON.stringify(value.draft));
      return true;
    } catch {
      if (live.current)
        setError("Не удалось сохранить черновик книги. Сохрани копию перед закрытием.");
      return false;
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: Every draft revision persists the current ref snapshot.
  useEffect(() => {
    if (key) void persist();
  }, [key, draft]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Persist reads current state through its ref, including on pagehide.
  useEffect(() => {
    const save = () => {
      void persist();
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);
  useEffect(() => {
    if (!guard || !enabled) return;
    const close = (done: () => void) => {
      if (state.current.busy) return;
      if (state.current.draft.index) {
        finish.current = done;
        setClosing(true);
      } else done();
    };
    guard.current = close;
    return () => {
      if (guard.current === close) guard.current = null;
    };
  }, [guard, enabled]);
  const edits = useMemo(() => draft.edits.slice(0, draft.index), [draft]),
    values = useMemo(() => editedValues(edits), [edits]);
  const status = workspace?.setContentStatus;
  useEffect(() => {
    if (enabled) status?.(draft.index ? "Черновик XLSX · оригинал сохранён" : "");
    return () => {
      if (enabled) status?.("");
    };
  }, [enabled, draft.index, status]);
  const current = doc.pages[sheet]!,
    selected = selection.split(":").at(-1)!.toUpperCase(),
    box = range(selection),
    cell = cellAt(current, selected),
    edit = values.get(`${sheet}:${selected}`);
  const value = edit?.value ?? cell?.value ?? "",
    type =
      edit?.type ??
      (cell?.type === "b"
        ? "boolean"
        : cell?.type === "n" && cell.value !== ""
          ? "number"
          : "text");
  const reason = doc.truncated
    ? "Книга показана частично. Доступны просмотр и копирование."
    : doc.readOnlyReason || editReason(current, selected);
  const changedMatches = new Set(
    [...values.values()]
      .filter(
        (e) =>
          e.sheet === sheet &&
          visibleValue(e).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
      .map((e) => coordinate(e.ref)![1]),
  );
  const rows = (current.rows ?? []).filter(
    (row) =>
      !query.trim() ||
      changedMatches.has(row.number) ||
      row.cells.some((c) => {
        const changed = values.get(`${sheet}:${columnName(c.column)}${row.number}`);
        return ((changed ? visibleValue(changed) : c.value) + (c.formula ?? ""))
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase());
      }),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 50)),
    shownPage = Math.min(page, pages - 1);
  const commit = (nextValue: string, nextType = type) => {
    if (!editing || reason || busy) return;
    setDraft((old) => ({
      version: 1,
      edits: [
        ...old.edits.slice(0, old.index),
        { sheet, ref: selected, value: nextValue, type: nextType },
      ],
      index: old.index + 1,
    }));
    setError("");
  };
  const choose = (ref: string, rangeSelect = false) => {
    setSelection((old) => (rangeSelect || extend ? `${old.split(":")[0]}:${ref}` : ref));
    setNotice("");
  };
  const saveCopy = async () => {
    if (busy || !edits.length) return;
    setBusy(true);
    setError("");
    try {
      const bytes = exportWorkbook(new Uint8Array(await file.arrayBuffer()), edits, doc);
      if (live.current)
        setCopy(
          new File([bytes], file.name.replace(/\.xlsx$/i, "") + "-edited.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        );
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : "Не удалось сохранить книгу.");
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const keyButton = (
    label: string,
    icon: string,
    action: () => void,
    disabled = false,
    pressed?: boolean,
  ) => (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={action}
    >
      <Icon name={icon} />
    </button>
  );
  return (
    <div className={`package-viewer xlsx-workspace${editing ? " xlsx-editing" : ""}`}>
      <div className="office-tools">
        <select
          aria-label="Лист"
          value={sheet}
          onChange={(e) => {
            setSheet(Number(e.target.value));
            setPage(0);
            setSelection("A1");
          }}
        >
          {doc.pages.map((p, i) => (
            <option key={p.path ?? i} value={i}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Размер текста"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        >
          {[80, 100, 125, 150, 200].map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Поиск в документе"
          placeholder="Найти текст"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <div className="xlsx-tools" role="toolbar" aria-label="Инструменты книги">
        <div className="xlsx-tool-group">
          {enabled &&
            keyButton(
              editing ? "Просмотр книги" : "Редактировать значения",
              editing ? "file" : "edit",
              () => setEditing(!editing),
              !key || busy || doc.truncated || !!doc.readOnlyReason,
              editing,
            )}
          {enabled &&
            keyButton("Сохранить копию XLSX", "save", () => void saveCopy(), !draft.index || busy)}
          {enabled &&
            keyButton(
              "Отменить изменение ячейки",
              "undo",
              () => setDraft((d) => ({ ...d, index: d.index - 1 })),
              !draft.index || busy,
            )}
          {enabled &&
            keyButton(
              "Повторить изменение ячейки",
              "redo",
              () => setDraft((d) => ({ ...d, index: d.index + 1 })),
              draft.index >= draft.edits.length || busy,
            )}
        </div>
        <div className="xlsx-tool-group xlsx-range-tools">
          <input
            aria-label="Диапазон ячеек"
            value={selection}
            onChange={(e) => setSelection(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && box) {
                const at = rows.findIndex((r) => r.number >= box[1]);
                if (at >= 0) setPage(Math.floor(at / 50));
              }
            }}
            placeholder="A1:B5"
          />
          {keyButton("Расширять выделение", "select", () => setExtend(!extend), false, extend)}
          {keyButton(
            "Копировать диапазон",
            "copy",
            () => {
              setError("");
              try {
                const text = copyRange(current, sheet, selection, edits);
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setNotice("Диапазон скопирован."))
                  .catch(() => setError("Не удалось скопировать. Разреши доступ к буферу обмена."));
              } catch (e) {
                setError((e as Error).message);
              }
            },
            !box,
          )}
        </div>
      </div>
      {editing && (
        <div className="xlsx-cell-editor">
          <div className="xlsx-cell-type">
            <strong>{selected}</strong>
            <select
              aria-label="Тип значения ячейки"
              value={type}
              disabled={!!reason || busy}
              onChange={(e) => commit(value, e.target.value as CellEdit["type"])}
            >
              <option value="text">Текст</option>
              <option value="number">Число</option>
              <option value="boolean">Логическое</option>
              <option value="blank">Пустая ячейка</option>
            </select>
            {keyButton("Закончить правку ячейки", "check", () => setEditing(false))}
          </div>
          {reason ? (
            <p>{reason}</p>
          ) : type !== "text" ? (
            <input
              aria-label="Значение ячейки XLSX"
              inputMode={type === "number" ? "decimal" : "text"}
              value={type === "blank" ? "" : value}
              disabled={busy || type === "blank"}
              onChange={(e) => commit(e.target.value)}
            />
          ) : (
            <AutoTextarea
              aria-label="Значение ячейки XLSX"
              value={value}
              disabled={busy}
              onChange={(e) => commit(e.target.value)}
            />
          )}
        </div>
      )}
      {(error || notice) && (
        <p className="xlsx-feedback" role={error ? "alert" : "status"}>
          {error || notice}
        </p>
      )}
      <div className="package-scroll xlsx-scroll">
        <table className="office-sheet xlsx-sheet" style={{ fontSize: `${zoom}%` }}>
          <thead>
            <tr>
              <th scope="col">№</th>
              {Array.from({ length: current.columns ?? 0 }, (_, i) => (
                <th scope="col" key={columnName(i + 1)}>
                  {columnName(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(shownPage * 50, (shownPage + 1) * 50).map((row) => {
              const cells = new Map(row.cells.map((c) => [c.column, c]));
              return (
                <tr key={row.number}>
                  <th scope="row">{row.number}</th>
                  {Array.from({ length: current.columns ?? 0 }, (_, i) => {
                    const ref = `${columnName(i + 1)}${row.number}`,
                      c = cells.get(i + 1),
                      changed = values.get(`${sheet}:${ref}`),
                      highlighted =
                        box &&
                        i + 1 >= box[0] &&
                        i + 1 <= box[2] &&
                        row.number >= box[1] &&
                        row.number <= box[3];
                    return (
                      <td
                        key={ref}
                        data-selected={highlighted || undefined}
                        data-changed={!!changed || undefined}
                      >
                        <button
                          type="button"
                          className="xlsx-cell"
                          aria-label={`Ячейка ${ref}`}
                          aria-pressed={!!highlighted}
                          onClick={(e) => choose(ref, e.shiftKey)}
                          onKeyDown={(e) => {
                            const deltas: Record<string, [number, number]> = {
                                ArrowLeft: [-1, 0],
                                ArrowRight: [1, 0],
                                ArrowUp: [0, -1],
                                ArrowDown: [0, 1],
                              },
                              delta = deltas[e.key];
                            if (!delta) return;
                            e.preventDefault();
                            const col = Math.max(
                                1,
                                Math.min(current.columns ?? 1, i + 1 + delta[0]),
                              ),
                              rowIndex = rows.findIndex((r) => r.number === row.number),
                              nextRow =
                                rows[Math.max(0, Math.min(rows.length - 1, rowIndex + delta[1]))]!;
                            const next = `${columnName(col)}${nextRow.number}`;
                            choose(next, e.shiftKey);
                            setPage(Math.floor(rows.indexOf(nextRow) / 50));
                            requestAnimationFrame(() =>
                              document
                                .querySelector<HTMLButtonElement>(
                                  `.xlsx-cell[aria-label="Ячейка ${next}"]`,
                                )
                                ?.focus(),
                            );
                          }}
                        >
                          {changed ? visibleValue(changed) : c?.value || "\u00a0"}
                        </button>
                        {c?.formula !== undefined && (
                          <details className="office-formula">
                            <summary aria-label={`Формула ${ref}`}>ƒ</summary>
                            <code>={c.formula || "Общая формула"}</code>
                          </details>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p>Нет содержимого по этому выбору.</p>}
      </div>
      <details className="office-notes">
        <summary>
          О книге{doc.truncated ? " · Показана часть" : draft.index ? " · Есть изменения" : ""}
        </summary>
        <p>
          {doc.readOnlyReason} Значения и формулы показаны без пересчёта. Форматирование и диаграммы
          сохраняются в копии, но не воспроизводятся здесь. После правки результаты формул могут
          устареть; копия запрашивает пересчёт при открытии в табличном приложении. Защищённые
          листы, объединённые ячейки и формулы доступны для чтения. Диапазон: Shift + выбор ячейки,
          стрелки или кнопка расширения; адрес можно ввести вручную. Копирование включает скрытые
          фильтром строки.
        </p>
      </details>
      <div className="package-pages">
        <span>{rows.length} строк</span>
        {keyButton("Предыдущие строки", "back", () => setPage(shownPage - 1), shownPage === 0)}
        <output>
          {shownPage + 1} / {pages}
        </output>
        {keyButton(
          "Следующие строки",
          "chevron",
          () => setPage(shownPage + 1),
          shownPage + 1 >= pages,
        )}
      </div>
      {copy && (
        <FileCopySave file={copy} onClose={() => setCopy(null)} onSaved={() => setCopy(null)} />
      )}
      {closing && (
        <div className="xlsx-close" role="alert">
          <p>Оставить изменения книги в черновике?</p>
          <div className="xlsx-close-actions">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void persist().then((ok) => {
                  if (ok) finish.current();
                })
              }
            >
              Оставить черновик
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void storage
                  .removeItem(key)
                  .then(() => finish.current())
                  .catch(() => setError("Не удалось удалить черновик."))
              }
            >
              Удалить черновик
            </button>
            <button type="button" className="secondary" onClick={() => setClosing(false)}>
              Продолжить правку
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
