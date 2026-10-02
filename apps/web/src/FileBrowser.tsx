import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "./icons";
import { PanelDivider } from "./PanelDivider";
import "./file-browser.css";

export type BrowserEntry = {
  path: string;
  name: string;
  kind: "directory" | "file";
  size?: number;
  modifiedAt?: number;
};
export type BrowserLocation = { path: string; name: string };
type Sort = "name" | "modified" | "size";
const sizeLabel = (n: number) =>
  n < 1024
    ? `${n} Б`
    : n < 1048576
      ? `${Math.ceil(n / 1024)} КБ`
      : `${(n / 1048576).toFixed(1)} МБ`;

// Sources own reads, permissions and mutations. This component only navigates and presents entries.
// Key each instance by its account/source so history cannot cross a source boundary.
export function FileBrowser({
  path,
  rootLabel,
  locations,
  parent,
  entries,
  busy = false,
  selected = "",
  onNavigate,
  onSelect,
  onEntryMenu,
  search: remoteSearch,
  sort: remoteSort,
  selection,
  onCheck,
  actions,
  tools,
  footer,
  preview,
  onClosePreview,
  scrollerRef,
  pathLabel = "Путь в проекте",
  emptyLabel = "Файлов не найдено",
  children,
}: {
  path: string;
  rootLabel: string;
  locations?: BrowserLocation[];
  parent?: string | null;
  entries: BrowserEntry[];
  busy?: boolean;
  selected?: string;
  onNavigate: (path: string) => void;
  onSelect?: (entry: BrowserEntry) => void;
  onEntryMenu?: (entry: BrowserEntry) => void;
  search?: { value: string; onChange: (value: string) => void; onSubmit: () => void };
  sort?: { value: Sort; onChange: (value: Sort) => void };
  selection?: string[];
  onCheck?: (path: string, checked: boolean) => void;
  actions?: (entry: BrowserEntry) => ReactNode;
  tools?: ReactNode;
  footer?: ReactNode;
  preview?: ReactNode;
  onClosePreview?: () => void;
  children?: ReactNode;
  scrollerRef?: RefObject<HTMLDivElement | null>;
  pathLabel?: string;
  emptyLabel?: string;
}) {
  const [history, setHistory] = useState({ paths: [path], index: 0 });
  const [placesOpen, setPlacesOpen] = useState(() => matchMedia("(min-width: 1100px)").matches),
    [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(path),
    [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name"),
    [view, setView] = useState<"list" | "icons">("list");
  const breadcrumbs = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reveal the current breadcrumb after navigation or leaving address editing.
  useLayoutEffect(() => {
    if (breadcrumbs.current) breadcrumbs.current.scrollLeft = breadcrumbs.current.scrollWidth;
  }, [path, editing]);
  const ownScroller = useRef<HTMLDivElement>(null),
    scroll = scrollerRef ?? ownScroller;
  const positions = useRef(new Map<string, number>()),
    previousPath = useRef(path);
  useEffect(() => {
    setAddress(path);
    setEditing(false);
    setQuery("");
  }, [path]);
  const traversal = useRef<{ path: string; index: number } | null>(null);
  useEffect(() => {
    if (busy) return;
    const pending = traversal.current;
    traversal.current = null;
    setHistory((h) =>
      pending?.path === path
        ? { ...h, index: pending.index }
        : h.paths[h.index] === path
          ? h
          : {
              paths: [...h.paths.slice(0, h.index + 1), path].slice(-50),
              index: Math.min(h.index + 1, 49),
            },
    );
  }, [path, busy]);
  useEffect(() => {
    const media = matchMedia("(min-width: 1100px)");
    const change = () => setPlacesOpen(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    if (busy) return;
    if (scroll.current && previousPath.current !== path)
      scroll.current.scrollTop = positions.current.get(path) ?? 0;
    previousPath.current = path;
  }, [path, busy, scroll]);
  const navigate = (next: string) => {
    if (busy) return;
    if (scroll.current) positions.current.set(path, scroll.current.scrollTop);
    if (positions.current.size > 50)
      positions.current.delete(positions.current.keys().next().value!);
    if (!matchMedia("(min-width: 1100px)").matches) setPlacesOpen(false);
    setEditing(false);
    onNavigate(next);
  };
  const travel = (index: number) => {
    const next = history.paths[index];
    if (next === undefined) return;
    traversal.current = { path: next, index };
    navigate(next);
  };
  const roots = locations?.length ? locations : [{ path: "", name: rootLabel }];
  const normalize = (s: string) => s.replaceAll("\\", "/").replace(/\/$/, "");
  const current = normalize(path);
  const root = [...roots]
    .sort((a, b) => b.path.length - a.path.length)
    .find(
      (r) =>
        !r.path || current === normalize(r.path) || current.startsWith(normalize(r.path) + "/"),
    );
  const tail = root ? current.slice(normalize(root.path).length).replace(/^\//, "") : "";
  const parts = tail.split("/").filter(Boolean);
  const crumbs = root
    ? [
        root,
        ...parts.map((name, i) => ({
          name,
          path:
            (root.path === "/" ? "/" : normalize(root.path) ? normalize(root.path) + "/" : "") +
            parts.slice(0, i + 1).join("/"),
        })),
      ]
    : [{ path, name: path || rootLabel }];
  const up =
    parent !== undefined
      ? parent
      : path
        ? current.split("/").slice(0, -1).join("/") || (current.startsWith("/") ? "/" : "")
        : null;
  const visibleEntries = remoteSearch
    ? entries
    : entries.filter((e) => e.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const ordered = remoteSort
    ? visibleEntries
    : [...visibleEntries].sort(
        (a, b) =>
          Number(b.kind === "directory") - Number(a.kind === "directory") ||
          (sort === "size"
            ? (b.size ?? 0) - (a.size ?? 0)
            : sort === "modified"
              ? (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0)
              : 0) ||
          a.name.localeCompare(b.name, "ru", { numeric: true }),
      );
  const search = remoteSearch ?? { value: query, onChange: setQuery, onSubmit: () => {} };
  return (
    <section
      className="file-browser"
      data-view={view}
      data-preview={!!preview}
      aria-label="Навигация по файлам"
    >
      <div className="file-browser-navigation">
        <div className="file-browser-travel">
          <button
            type="button"
            className="icon-button"
            aria-label="Расположения"
            aria-expanded={placesOpen}
            onClick={() => setPlacesOpen(!placesOpen)}
          >
            <Icon name="menu" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Назад по папкам"
            disabled={busy || history.index === 0}
            onClick={() => travel(history.index - 1)}
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Вперёд по папкам"
            disabled={busy || history.index >= history.paths.length - 1}
            onClick={() => travel(history.index + 1)}
          >
            <Icon name="chevron" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Папка выше"
            disabled={busy || up === null}
            onClick={() => up !== null && navigate(up)}
          >
            <Icon name="arrow-up" />
          </button>
        </div>
        {editing ? (
          <form
            className="file-browser-address"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(address.trim());
            }}
          >
            <input
              aria-label={pathLabel}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="icon-button"
              disabled={busy}
              aria-label="Открыть папку"
            >
              <Icon name="check" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Отменить ввод пути"
              onClick={() => setEditing(false)}
            >
              <Icon name="close" />
            </button>
          </form>
        ) : (
          <div className="file-browser-address">
            <nav ref={breadcrumbs} aria-label="Путь к папке">
              {crumbs.map((c, i) => (
                <span key={c.path}>
                  {i > 0 && <Icon name="chevron" size={12} />}
                  <button
                    type="button"
                    disabled={busy}
                    title={c.path || rootLabel}
                    aria-current={i === crumbs.length - 1 ? "location" : undefined}
                    onClick={() => navigate(c.path)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <button
              type="button"
              className="icon-button"
              aria-label="Ввести путь"
              onClick={() => {
                setAddress(path);
                setEditing(true);
              }}
            >
              <Icon name="edit" size={16} />
            </button>
          </div>
        )}
        <form
          className="file-browser-search"
          onSubmit={(e) => {
            e.preventDefault();
            search.onSubmit();
          }}
        >
          <input
            type="search"
            aria-label="Найти в папке"
            placeholder="Найти в папке"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
          <button type="submit" className="icon-button" aria-label="Найти" disabled={busy}>
            <Icon name="search" size={18} />
          </button>
        </form>
      </div>
      {tools && <div className="file-browser-commands">{tools}</div>}
      <div className="file-browser-body">
        <PanelDivider
          target=".file-browser-places"
          peer=".file-browser-main"
          label="Ширина расположений"
          storageKey="files-places"
          variable="--places-width"
          min={140}
          max={300}
        />
        {preview && (
          <PanelDivider
            target=".file-browser-detail"
            peer=".file-browser-main"
            label="Ширина просмотра"
            storageKey="files-preview"
            variable="--preview-width"
            min={250}
            // The neighboring list supplies the effective limit. A 700px cap
            // could be smaller than the initial 56% pane and reverse a resize.
            max={Number.MAX_SAFE_INTEGER}
            trailing
          />
        )}
        <nav
          className="file-browser-places"
          data-open={placesOpen}
          aria-label="Расположения файлов"
        >
          <strong>Расположения</strong>
          {roots.map((r) => (
            <button
              type="button"
              key={r.path}
              disabled={busy}
              aria-current={path === r.path ? "location" : undefined}
              onClick={() => navigate(r.path)}
            >
              <Icon name="folder" size={18} />
              <span title={r.name}>{r.name}</span>
            </button>
          ))}
          {crumbs.length > 1 && (
            <>
              <strong>Текущая папка</strong>
              {crumbs.slice(1).map((c) => (
                <button type="button" key={c.path} disabled={busy} onClick={() => navigate(c.path)}>
                  <Icon name="folder" size={18} />
                  <span title={c.name}>{c.name}</span>
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="file-browser-main">
          <div className="file-browser-tools">
            <div className="file-browser-view">
              <select
                aria-label="Сортировка файлов"
                value={remoteSort?.value ?? sort}
                onChange={(e) => (remoteSort?.onChange ?? setSort)(e.target.value as Sort)}
              >
                <option value="name">По имени</option>
                {(remoteSort || entries.some((e) => e.modifiedAt !== undefined)) && (
                  <option value="modified">По дате</option>
                )}
                {(remoteSort || entries.some((e) => e.size !== undefined)) && (
                  <option value="size">По размеру</option>
                )}
              </select>
              <button
                type="button"
                className="icon-button"
                aria-label="Список файлов"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <Icon name="plan" size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Значки файлов"
                aria-pressed={view === "icons"}
                onClick={() => setView("icons")}
              >
                <Icon name="grid" size={18} />
              </button>
            </div>
          </div>
          <div className="file-browser-scroll" ref={scroll} aria-busy={busy}>
            {busy && (
              <p role="status" className="file-browser-loading">
                <span className="spinner" /> Загружаю…
              </p>
            )}
            <ul className="file-browser-entries inspector-list">
              {ordered.map((entry) => (
                <li
                  key={entry.path}
                  data-file-path={entry.path}
                  className={
                    selected === entry.path || selection?.includes(entry.path) ? "selected" : ""
                  }
                >
                  {selection && onCheck && (
                    <label className="file-browser-checkbox">
                      <input
                        type="checkbox"
                        aria-label={`Выбрать: ${entry.path}`}
                        checked={selection.includes(entry.path)}
                        onChange={(e) => onCheck(entry.path, e.target.checked)}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="file-browser-entry inspector-entry"
                    disabled={busy}
                    aria-expanded={entry.kind === "file" ? selected === entry.path : undefined}
                    onContextMenu={
                      onEntryMenu
                        ? (event) => {
                            event.preventDefault();
                            onEntryMenu(entry);
                          }
                        : undefined
                    }
                    onClick={() =>
                      entry.kind === "directory" ? navigate(entry.path) : onSelect?.(entry)
                    }
                  >
                    <Icon name={entry.kind === "directory" ? "folder" : "file"} size={22} />
                    <span className="file-browser-name">
                      <span className="file-browser-label" title={entry.name}>
                        {entry.name}
                      </span>
                      <small>
                        {entry.kind === "directory"
                          ? "Папка"
                          : entry.name.split(".").length > 1
                            ? entry.name.split(".").at(-1)?.toUpperCase()
                            : "Файл"}
                      </small>
                    </span>
                    {entry.size !== undefined && (
                      <span className="file-browser-size">
                        {entry.kind === "file" ? sizeLabel(entry.size) : "—"}
                      </span>
                    )}
                    {entry.modifiedAt !== undefined && (
                      <time
                        className="file-browser-date"
                        dateTime={new Date(entry.modifiedAt).toISOString()}
                      >
                        {new Date(entry.modifiedAt).toLocaleDateString("ru")}
                      </time>
                    )}
                  </button>
                  {actions && <div className="file-browser-row-actions">{actions(entry)}</div>}
                </li>
              ))}
            </ul>
            {!busy && !ordered.length && <p className="inspector-empty">{emptyLabel}</p>}
            {children}
            {footer}
          </div>
        </div>
        {preview && (
          <section className="file-browser-detail" aria-label="Выбранный файл">
            <header>
              <strong>{selected.split("/").at(-1) || "Просмотр"}</strong>
              <button
                type="button"
                className="icon-button"
                aria-label="Закрыть файл"
                onClick={onClosePreview}
              >
                <Icon name="close" />
              </button>
            </header>
            {preview}
          </section>
        )}
      </div>
    </section>
  );
}
