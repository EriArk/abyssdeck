// biome-ignore-all lint/suspicious/noArrayIndexKey: Cell coordinates are stable identities; filtering never changes their source row.
import { useEffect, useMemo, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import "./file-format-tools.css";
import { cellChange, detectDelimiter, parseDelimited } from "./delimitedText";
import { Icon } from "./icons";
import "./delimited-table.css";

export function DelimitedTable({
  text,
  name,
  onChange,
  disabled = false,
}: {
  text: string;
  name: string;
  disabled?: boolean;
  onChange?: (change: { from: number; to: number; insert: string }) => void;
}) {
  const [delimiter, setDelimiter] = useState(() => detectDelimiter(text, name));
  const [header, setHeader] = useState(true),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const parsed = useMemo(() => {
    try {
      return { rows: parseDelimited(text, delimiter), error: "" };
    } catch (e) {
      return { rows: [], error: (e as Error).message };
    }
  }, [text, delimiter]);
  const rows = parsed.rows,
    columns = rows.reduce((width, row) => Math.max(width, row.cells.length), 1);
  const filtered = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row, index }) =>
            !(header && index === 0) &&
            (!query ||
              row.cells.some((c) =>
                c.value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
              )),
        ),
    [rows, query, header],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 50)),
    current = Math.min(page, pages - 1);
  const [edit, setEdit] = useState<{
    row: number;
    column: number;
    value: string;
    original: string;
  } | null>(null);
  return (
    <section className="delimited-table" data-editing={!!edit} aria-label="Таблица CSV/TSV">
      <div
        className="file-format-tools format-tool-row"
        role="toolbar"
        aria-label="Инструменты таблицы"
      >
        <select
          aria-label="Разделитель"
          value={delimiter}
          disabled={!!edit}
          onChange={(e) => {
            setDelimiter(e.target.value);
            setPage(0);
          }}
        >
          <option value=",">Запятая</option>
          <option value=";">Точка с запятой</option>
          <option value={"\t"}>Табуляция</option>
          <option value="|">Вертикальная черта</option>
        </select>
        <button
          type="button"
          className="icon-button"
          title="Первая строка — заголовки"
          aria-label="Первая строка — заголовки"
          aria-pressed={header}
          disabled={!!edit}
          onClick={() => {
            setHeader(!header);
            setPage(0);
          }}
        >
          <Icon name="table-header" />
        </button>
        <input
          type="search"
          aria-label="Фильтр строк"
          placeholder="Найти в таблице"
          value={query}
          disabled={!!edit}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>
      {parsed.error ? (
        <p role="alert">{parsed.error} Правка исходного текста остаётся доступна.</p>
      ) : (
        <>
          {edit && (
            <div className="table-cell-editor">
              <label>
                Строка {edit.row + 1}, столбец {edit.column + 1}
                <AutoTextarea
                  aria-label="Значение ячейки"
                  value={rows[edit.row]?.cells[edit.column]?.value ?? ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const cell = rows[edit.row]?.cells[edit.column];
                    if (cell) onChange?.(cellChange(cell, e.target.value, delimiter));
                  }}
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label="Закончить правку ячейки"
                title="Закончить правку ячейки"
                onClick={() => setEdit(null)}
              >
                <Icon name="check" />
              </button>
            </div>
          )}
          <div className="delimited-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">№</th>
                  {Array.from({ length: columns }, (_, c) => (
                    <th scope="col" key={c}>
                      {header && rows[0]?.cells[c] ? (
                        <button
                          type="button"
                          disabled={!onChange || disabled || !!edit}
                          onClick={() =>
                            setEdit({
                              row: 0,
                              column: c,
                              value: rows[0]!.cells[c]!.value,
                              original: rows[0]!.cells[c]!.value,
                            })
                          }
                        >
                          {rows[0]!.cells[c]!.value || `Столбец ${c + 1}`}
                        </button>
                      ) : (
                        `Столбец ${c + 1}`
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(current * 50, (current + 1) * 50).map(({ row, index }) => (
                  <tr key={index}>
                    <th scope="row">{index + 1}</th>
                    {row.cells.map((cell, c) => (
                      <td key={c}>
                        {onChange ? (
                          <button
                            type="button"
                            aria-label={`Строка ${index + 1}, столбец ${c + 1}`}
                            disabled={disabled || !!edit}
                            onClick={() =>
                              setEdit({
                                row: index,
                                column: c,
                                value: cell.value,
                                original: cell.value,
                              })
                            }
                          >
                            {cell.value || "\u00a0"}
                          </button>
                        ) : (
                          cell.value
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="file-pages">
            <button
              type="button"
              aria-label="Предыдущие строки"
              disabled={current === 0 || !!edit}
              onClick={() => setPage(current - 1)}
            >
              ‹
            </button>
            <span>
              {filtered.length} строк · {current + 1} / {pages}
            </span>
            <button
              type="button"
              aria-label="Следующие строки"
              disabled={current + 1 >= pages || !!edit}
              onClick={() => setPage(current + 1)}
            >
              ›
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export default function DelimitedFilePreview({ file }: { file: File }) {
  const [text, setText] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void file
      .arrayBuffer()
      .then((bytes) => {
        const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (live) setText(value);
      })
      .catch(() => {
        if (live) setError("Таблица не в UTF-8. Оригинал доступен для скачивания.");
      });
    return () => {
      live = false;
    };
  }, [file]);
  return error ? (
    <p role="alert">{error}</p>
  ) : text === null ? (
    <p role="status">Открываю таблицу…</p>
  ) : (
    <DelimitedTable text={text} name={file.name} />
  );
}
