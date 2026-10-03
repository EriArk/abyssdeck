// biome-ignore-all lint/suspicious/noArrayIndexKey: Append-only annotation order owns the stateless SVG primitives.
import type { PageViewport } from "pdfjs-dist";
import { type PointerEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { FileCopySave } from "./FileCopySave";
import { FileWorkspaceContext } from "./fileWorkspaceContext";
import { githubDraftStorage as storage } from "./githubDraftStorage";
import { Icon } from "./icons";
import type { PdfMark } from "./pdfAnnotations";
import "./file-format-tools.css";
import "./pdf-markup.css";

type Draft = { version: 1; marks: PdfMark[]; index: number };
export default function PdfMarkup({
  file,
  source,
  enabled,
  page,
  viewport,
  zoom,
  ready,
  children,
  readingTools,
  navigation,
}: {
  file: File;
  source?: string;
  enabled: boolean;
  page: number;
  viewport: PageViewport | null;
  zoom: number;
  ready: boolean;
  children: ReactNode;
  readingTools?: ReactNode;
  navigation?: ReactNode;
}) {
  const [draft, setDraft] = useState<Draft>({ version: 1, marks: [], index: 0 }),
    [key, setKey] = useState("");
  const [editing, setEditing] = useState(false),
    [tool, setTool] = useState<PdfMark["tool"] | "pan">("marker");
  const [color, setColor] = useState("#ffcc00"),
    [width, setWidth] = useState(10),
    [caption, setCaption] = useState("");
  const [pending, setPending] = useState<PdfMark | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<File | null>(null),
    [closing, setClosing] = useState(false);
  const workspace = useContext(FileWorkspaceContext),
    guard = workspace?.closeGuard;
  const active = useRef(true),
    state = useRef({ key, draft, busy }),
    finish = useRef<() => void>(() => {});
  const stroke = useRef<{ id: number; mark: PdfMark } | null>(null),
    touches = useRef(new Set<number>());
  state.current = { key, draft, busy };
  // biome-ignore lint/correctness/useExhaustiveDependencies: A changed page, transform or tool cancels an unfinished gesture.
  useEffect(() => {
    stroke.current = null;
    touches.current.clear();
    setPending(null);
  }, [page, viewport, editing, tool]);
  useEffect(() => {
    active.current = true;
    let live = true;
    if (enabled)
      void (async () => {
        const hash = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const id = `workspace-pdf-draft:${JSON.stringify([source || "local", file.name, hash])}`;
        const saved = await storage.getItem(id);
        if (!live) return;
        if (saved) {
          const parsed = JSON.parse(saved) as Draft;
          if (
            parsed.version !== 1 ||
            !Array.isArray(parsed.marks) ||
            parsed.index < 0 ||
            parsed.index > parsed.marks.length ||
            !Number.isInteger(parsed.index) ||
            !parsed.marks.every(
              (mark) =>
                Number.isInteger(mark.page) &&
                mark.page > 0 &&
                ["pen", "marker", "comment"].includes(mark.tool) &&
                /^#[0-9a-f]{6}$/i.test(mark.color) &&
                Number.isFinite(mark.width) &&
                mark.width > 0 &&
                Array.isArray(mark.points) &&
                mark.points.length > 0 &&
                mark.points.every(
                  (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
                ) &&
                (mark.text === undefined || typeof mark.text === "string"),
            )
          )
            throw Error("Не удалось восстановить разметку PDF.");
          setDraft(parsed);
        }
        setKey(id);
      })().catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      active.current = false;
    };
  }, [enabled, file, source]);
  const persist = async () => {
    const value = state.current;
    if (!value.key) return false;
    try {
      await storage.setItem(value.key, JSON.stringify(value.draft));
      return true;
    } catch {
      if (active.current)
        setError("Не удалось сохранить черновик PDF. Сохрани копию перед закрытием.");
      return false;
    }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Persist every draft revision using the latest closure.
  useEffect(() => {
    if (key) void persistRef.current();
  }, [key, draft]);
  useEffect(() => {
    const save = () => {
      void persistRef.current();
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);
  useEffect(() => {
    if (!enabled || !guard) return;
    const close = (complete: () => void) => {
      if (state.current.busy) return;
      if (state.current.draft.index) {
        finish.current = complete;
        setClosing(true);
      } else complete();
    };
    guard.current = close;
    return () => {
      if (guard.current === close) guard.current = null;
    };
  }, [guard, enabled]);
  const status = workspace?.setContentStatus;
  useEffect(() => {
    if (enabled) status?.(draft.index ? "Разметка PDF · оригинал сохранён" : "");
    return () => {
      if (enabled) status?.("");
    };
  }, [enabled, draft.index, status]);
  const commit = (mark: PdfMark) =>
    setDraft((old) => ({
      version: 1,
      marks: [...old.marks.slice(0, old.index), mark],
      index: old.index + 1,
    }));
  const point = (e: PointerEvent<SVGSVGElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(viewport!.width, ((e.clientX - rect.left) * viewport!.width) / rect.width),
    );
    const y = Math.max(
      0,
      Math.min(viewport!.height, ((e.clientY - rect.top) * viewport!.height) / rect.height),
    );
    return viewport!.convertToPdfPoint(x, y) as [number, number];
  };
  const exportCopy = async () => {
    if (busy || !draft.index) return;
    setBusy(true);
    setError("");
    try {
      const { annotatePdf } = await import("./pdfAnnotations");
      const bytes = await annotatePdf(await file.arrayBuffer(), draft.marks.slice(0, draft.index));
      if (active.current)
        setCopy(
          new File([bytes], file.name.replace(/\.pdf$/i, "") + "-annotated.pdf", {
            type: "application/pdf",
          }),
        );
    } catch {
      if (active.current)
        setError("Не удалось экспортировать PDF. Черновик сохранён; оригинал доступен.");
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const marks = [...draft.marks.slice(0, draft.index), ...(pending ? [pending] : [])].filter(
    (m) => m.page === page,
  );
  return (
    <>
      {(enabled || readingTools) && (
        <div className="file-format-tools">
          <div className="format-tool-row" role="toolbar" aria-label="Инструменты PDF">
            {readingTools}
            {enabled && (
              <div className="pdf-toolbar-group">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={editing ? "Просмотр PDF" : "Разметить PDF"}
                  title={editing ? "Просмотр PDF" : "Разметить PDF"}
                  disabled={!key || busy}
                  aria-pressed={editing}
                  onClick={() => setEditing(!editing)}
                >
                  <Icon name={editing ? "file" : "edit"} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Отменить разметку PDF"
                  title="Отменить"
                  disabled={!draft.index || busy}
                  onClick={() => setDraft((d) => ({ ...d, index: d.index - 1 }))}
                >
                  <Icon name="back" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Повторить разметку PDF"
                  title="Повторить"
                  disabled={draft.index === draft.marks.length || busy}
                  onClick={() => setDraft((d) => ({ ...d, index: d.index + 1 }))}
                >
                  <Icon name="chevron" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Сохранить копию PDF"
                  title="Сохранить копию PDF"
                  disabled={!draft.index || busy}
                  onClick={() => void exportCopy()}
                >
                  <Icon name="save" />
                </button>
              </div>
            )}
            {editing && (
              <>
                <div className="pdf-toolbar-group">
                  {(
                    [
                      ["pan", "touch", "Прокрутка PDF"],
                      ["marker", "marker", "Маркер PDF"],
                      ["pen", "edit", "Перо PDF"],
                      ["comment", "note-edit", "Комментарий PDF"],
                    ] as const
                  ).map(([value, icon, label]) => (
                    <button
                      type="button"
                      className="icon-button"
                      key={value}
                      aria-label={label}
                      title={label}
                      aria-pressed={tool === value}
                      disabled={busy}
                      onClick={() => setTool(value)}
                    >
                      <Icon name={icon} />
                    </button>
                  ))}
                </div>
                <div className="pdf-toolbar-group">
                  <select
                    aria-label="Цвет разметки PDF"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  >
                    <option value="#ffcc00">Жёлтый</option>
                    <option value="#ff3344">Красный</option>
                    <option value="#2288ff">Синий</option>
                    <option value="#22bb66">Зелёный</option>
                    <option value="#000000">Чёрный</option>
                    <option value="#ffffff">Белый</option>
                  </select>
                  {tool !== "comment" && tool !== "pan" && (
                    <select
                      aria-label="Толщина разметки PDF"
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                    >
                      {[2, 5, 10, 20].map((n) => (
                        <option key={n} value={n}>
                          {n} pt
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}
          </div>
          {editing && tool === "comment" && (
            <label className="pdf-comment-input">
              Комментарий — затем укажи место на странице
              <AutoTextarea
                aria-label="Текст комментария PDF"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="format-tool-status">
              {error}
            </p>
          )}
        </div>
      )}
      {navigation}
      <div className="pdf-sheet-scroll">
        <div className="pdf-sheet-stage" style={{ width: `${zoom}%`, minWidth: "100%" }}>
          {children}
          {viewport && ready && (
            <svg
              className="pdf-markup-layer"
              data-drawing={editing && tool !== "pan"}
              viewBox={`0 0 ${viewport.width} ${viewport.height}`}
              role="img"
              aria-label="Слой разметки PDF"
              onPointerDown={(e) => {
                touches.current.add(e.pointerId);
                if (touches.current.size > 1) {
                  stroke.current = null;
                  setPending(null);
                  return;
                }
                if (!editing || tool === "pan" || busy || e.button !== 0) return;
                if (tool === "comment" && !caption.trim()) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const mark: PdfMark = {
                  page,
                  tool,
                  points: [point(e)],
                  color,
                  width: width / (viewport.scale * viewport.userUnit),
                  text: caption.trim(),
                };
                if (tool === "comment") {
                  const [vx, vy] = viewport.convertToViewportPoint(...mark.points[0]!);
                  mark.points.push(
                    viewport.convertToPdfPoint(vx! + 18, vy! + 18) as [number, number],
                  );
                }
                stroke.current = { id: e.pointerId, mark };
                setPending(mark);
              }}
              onPointerMove={(e) => {
                const s = stroke.current;
                if (!s || s.id !== e.pointerId || s.mark.tool === "comment") return;
                s.mark = { ...s.mark, points: [...s.mark.points, point(e)] };
                setPending(s.mark);
              }}
              onPointerUp={(e) => {
                touches.current.delete(e.pointerId);
                const s = stroke.current;
                if (s?.id === e.pointerId) {
                  commit(s.mark);
                  stroke.current = null;
                  setPending(null);
                }
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={(e) => {
                touches.current.delete(e.pointerId);
                stroke.current = null;
                setPending(null);
              }}
              onLostPointerCapture={() => {
                stroke.current = null;
                setPending(null);
              }}
            >
              {marks.map((mark, i) => {
                const pts = mark.points.map((p) => viewport.convertToViewportPoint(...p));
                return mark.tool === "comment" ? (
                  <g key={i}>
                    <title>{mark.text}</title>
                    <rect x={pts[0]![0]} y={pts[0]![1]} width={18} height={18} fill={mark.color} />
                    <text x={pts[0]![0] + 4} y={pts[0]![1] + 14} fill="#000" fontSize="12">
                      ≡
                    </text>
                  </g>
                ) : (
                  <path
                    key={i}
                    d={
                      pts.map(([x, y], j) => `${j ? "L" : "M"} ${x} ${y}`).join(" ") +
                      (pts.length === 1 ? ` l .01 0` : "")
                    }
                    fill="none"
                    stroke={mark.color}
                    strokeWidth={mark.width * viewport.scale * viewport.userUnit}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={mark.tool === "marker" ? 0.35 : 1}
                  />
                );
              })}
            </svg>
          )}
        </div>
      </div>
      {marks.some((m) => m.tool === "comment") && (
        <details className="pdf-comments">
          <summary>Комментарии на странице</summary>
          <ol>
            {marks
              .filter((m) => m.tool === "comment")
              .map((m, i) => (
                <li key={i}>{m.text}</li>
              ))}
          </ol>
        </details>
      )}
      {copy && (
        <FileCopySave file={copy} onClose={() => setCopy(null)} onSaved={() => setCopy(null)} />
      )}
      {closing && (
        <div role="alert" className="pdf-close">
          <p>Сохранить разметку PDF перед закрытием?</p>
          <div className="format-tool-row">
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
    </>
  );
}
