import { useContext, useEffect, useId, useRef, useState } from "react";
import { FileCopySave } from "./FileCopySave";
import { FileWorkspaceContext } from "./fileWorkspaceContext";
import { githubDraftStorage as storage } from "./githubDraftStorage";
import { Icon } from "./icons";
import {
  animatedRaster,
  type ImageEdits,
  imageSize,
  imageTransform,
  type Mark,
  markPath,
  type Point,
  renderImageCopy,
} from "./imageAnnotations";
import { ImageViewport } from "./VectorFilePreview";
import "./file-format-tools.css";
import "./image-markup.css";
import "./file-editor.css";

type Draft = {
  version: 1;
  base: string;
  width: number;
  height: number;
  history: ImageEdits[];
  index: number;
};
const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error("Не удалось прочитать изображение."));
    img.src = url;
  });
export default function ImageMarkup({
  file,
  url,
  source,
}: {
  file: File;
  url: string;
  source?: string;
}) {
  const workspace = useContext(FileWorkspaceContext),
    guard = workspace?.closeGuard;
  const cropId = useId();
  const [key, setKey] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null),
    [editing, setEditing] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [frame, setFrame] = useState(false);
  const [tool, setTool] = useState<Mark["tool"] | "pan" | "crop">("marker"),
    [color, setColor] = useState("#ffcc00"),
    [width, setWidth] = useState(8),
    [caption, setCaption] = useState("");
  const [pendingMark, setPendingMark] = useState<Mark | null>(null),
    [scale, setScale] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [background, setBackground] = useState("checker"),
    [format, setFormat] = useState("png"),
    [copy, setCopy] = useState<File | null>(null),
    [closing, setClosing] = useState(false);
  const group = useRef<SVGGElement>(null),
    state = useRef({ key, draft, busy }),
    currentStroke = useRef<Mark | null>(null),
    pointer = useRef<{ id: number; x: number; y: number } | null>(null),
    finish = useRef<() => void>(() => {}),
    active = useRef(true);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; center: Point; scale: number; pan: Point } | null>(null);
  state.current = { key, draft, busy };
  const edits = draft?.history[draft.index];
  const setContentStatus = workspace?.setContentStatus,
    hasDraft = !!draft;
  useEffect(() => {
    setContentStatus?.(hasDraft ? "Размеченная копия · оригинал сохранён" : "");
    return () => setContentStatus?.("");
  }, [hasDraft, setContentStatus]);
  useEffect(() => {
    active.current = true;
    let live = true;
    setReady(false);
    setDraft(null);
    setEditing(false);
    setKey("");
    setError("");
    void (async () => {
      const bytes = await file.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const id = `workspace-image-draft:${JSON.stringify([source || "local", file.name, digest])}`;
      const saved = await storage.getItem(id);
      if (!live) return;
      if (saved) {
        const data = JSON.parse(saved) as Draft;
        if (
          data.version !== 1 ||
          !data.base.startsWith("data:image/png;base64,") ||
          !Array.isArray(data.history) ||
          !data.history[data.index]
        )
          throw Error("Не удалось восстановить разметку.");
        setDraft(data);
      }
      setFrame(animatedRaster(new Uint8Array(bytes)));
      setKey(id);
      setReady(true);
    })().catch((e) => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
      active.current = false;
    };
  }, [file, source]);
  const persist = async (value = state.current.draft) => {
    if (!state.current.key || !value) return true;
    try {
      await storage.setItem(state.current.key, JSON.stringify(value));
      return true;
    } catch {
      if (active.current)
        setError("Не удалось сохранить разметку на устройстве. Сохрани копию перед закрытием.");
      return false;
    }
  };
  const latestPersist = useRef(persist);
  latestPersist.current = persist;
  useEffect(() => {
    if (draft && key) void latestPersist.current(draft);
  }, [draft, key]);
  useEffect(() => {
    if (!guard) return;
    const close = (complete: () => void) => {
      if (state.current.busy) return;
      if (state.current.draft && state.current.draft.history.length > 1) {
        finish.current = complete;
        setClosing(true);
      } else complete();
    };
    guard.current = close;
    return () => {
      if (guard.current === close) guard.current = null;
    };
  }, [guard]);
  const commit = (next: ImageEdits) =>
    setDraft((old) =>
      old
        ? { ...old, history: [...old.history.slice(0, old.index + 1), next], index: old.index + 1 }
        : old,
    );
  const begin = async () => {
    if (!ready || busy) return;
    if (draft) {
      setEditing(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const image = await loadImage(url),
        canvas = document.createElement("canvas");
      // A raster editing budget is separate from downloading the original.
      if (image.naturalWidth * image.naturalHeight > 32_000_000)
        throw Error("Изображение слишком большое для разметки в браузере. Оригинал доступен.");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Не удалось подготовить разметку.");
      ctx.drawImage(image, 0, 0);
      const base = canvas.toDataURL("image/png");
      if (base === "data:,") throw Error("Не удалось подготовить разметку.");
      if (!active.current) return;
      setDraft({
        version: 1,
        base,
        width: canvas.width,
        height: canvas.height,
        history: [
          {
            marks: [],
            crop: { x: 0, y: 0, width: canvas.width, height: canvas.height },
            rotation: 0,
          },
        ],
        index: 0,
      });
      setEditing(true);
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const exportCopy = async () => {
    if (!draft || !edits || busy) return;
    setBusy(true);
    setError("");
    try {
      const canvas = renderImageCopy(await loadImage(draft.base), edits, format === "jpeg");
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("Не удалось подготовить копию."))),
          format === "jpeg" ? "image/jpeg" : "image/png",
          0.95,
        ),
      );
      if (active.current)
        setCopy(
          new File(
            [blob],
            file.name.replace(/\.[^.]+$/, "") + `-marked.${format === "jpeg" ? "jpg" : "png"}`,
            { type: blob.type },
          ),
        );
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const point = (x: number, y: number): Point => {
    const matrix = group.current?.getScreenCTM();
    if (!matrix || !draft) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return {
      x: Math.max(0, Math.min(draft.width, p.x)),
      y: Math.max(0, Math.min(draft.height, p.y)),
    };
  };
  const button = (
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
      disabled={disabled || busy}
      aria-pressed={pressed}
      onClick={action}
    >
      <Icon name={icon} />
    </button>
  );
  const tools: [typeof tool, string, string][] = [
    ["pan", "Переместить изображение", "pointer"],
    ["marker", "Маркер", "marker"],
    ["pen", "Перо", "edit"],
    ["arrow", "Стрелка", "arrow"],
    ["rectangle", "Рамка", "rectangle"],
    ["text", "Подпись", "text"],
    ["crop", "Обрезка", "crop"],
  ];
  const size = edits ? imageSize(edits) : null;
  const renderMark = (mark: Mark, index: number) =>
    mark.tool === "text" ? (
      <text
        key={index}
        x={mark.points[0]!.x}
        y={mark.points[0]!.y}
        fontSize={Math.max(12, mark.width * 5)}
        fontFamily="sans-serif"
        fill={mark.color}
      >
        {mark.text}
      </text>
    ) : (
      <path
        key={index}
        d={markPath(mark)}
        stroke={mark.color}
        strokeWidth={mark.width}
        strokeOpacity={mark.tool === "marker" ? 0.35 : 1}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    );
  return (
    <div className="image-markup">
      <div role="toolbar" className="format-tool-row" aria-label="Режим изображения">
        <button
          type="button"
          className="secondary"
          aria-pressed={!editing}
          onClick={() => setEditing(false)}
        >
          Просмотр
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={editing}
          disabled={!ready || busy}
          onClick={() => void begin()}
        >
          {draft ? "Разметка" : frame ? "Разметить снимок кадра" : "Разметка"}
        </button>
        {draft && button("Сохранить размеченную копию", "save", () => void exportCopy())}
        {draft && (
          <select
            aria-label="Формат копии изображения"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="png">PNG · прозрачность</option>
            <option value="jpeg">JPEG · белый фон</option>
          </select>
        )}
      </div>
      {editing && (
        <div role="toolbar" className="format-tool-row" aria-label="Инструменты разметки">
          {tools.map(([value, label, icon]) => (
            <span key={value}>
              {button(label, icon, () => setTool(value), false, tool === value)}
            </span>
          ))}
          <input
            type="color"
            aria-label="Цвет разметки"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <select
            aria-label="Толщина разметки"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            {[2, 4, 8, 16, 32].map((n) => (
              <option key={n} value={n}>
                {n} px
              </option>
            ))}
          </select>
          {tool === "text" && (
            <input
              aria-label="Текст подписи"
              placeholder="Подпись"
              maxLength={500}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          )}
          {button(
            "Отменить разметку",
            "back",
            () => setDraft((d) => (d ? { ...d, index: d.index - 1 } : d)),
            !draft || draft.index === 0,
          )}
          {button(
            "Повторить разметку",
            "chevron",
            () => setDraft((d) => (d ? { ...d, index: d.index + 1 } : d)),
            !draft || draft.index === draft.history.length - 1,
          )}
          {button("Повернуть вправо", "rotate", () => {
            if (edits) commit({ ...edits, rotation: (edits.rotation + 90) % 360 });
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="format-tool-status">
          {error}
        </p>
      )}
      {draft && edits && size ? (
        <>
          <div role="toolbar" className="format-tool-row" aria-label="Вид разметки">
            {button("Вписать разметку", "expand", () => {
              setScale(1);
              setPan({ x: 0, y: 0 });
            })}
            {button("Уменьшить разметку", "minus", () => setScale((s) => Math.max(0.1, s / 1.25)))}
            {button("Увеличить разметку", "plus", () => setScale((s) => Math.min(16, s * 1.25)))}
            <output>
              {Math.round(size.width)} × {Math.round(size.height)} · {Math.round(scale * 100)}%
            </output>
            <select
              aria-label="Фон разметки"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            >
              <option value="checker">Прозрачность</option>
              <option value="light">Светлый</option>
              <option value="dark">Тёмный</option>
            </select>
          </div>
          <div className="image-stage markup-stage" data-background={background}>
            <svg
              aria-label="Холст разметки"
              role="img"
              viewBox={`0 0 ${size.width} ${size.height}`}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
              onPointerDown={(e) => {
                if (busy) return;
                if (e.pointerType === "touch") {
                  touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                  e.currentTarget.setPointerCapture(e.pointerId);
                  if (touches.current.size === 2) {
                    const [a, b] = [...touches.current.values()] as [Point, Point];
                    pinch.current = {
                      distance: Math.hypot(b.x - a.x, b.y - a.y),
                      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                      scale,
                      pan,
                    };
                    pointer.current = null;
                    currentStroke.current = null;
                    setPendingMark(null);
                    return;
                  }
                  if (touches.current.size > 2) return;
                }
                if (pointer.current || busy) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
                if (!editing || tool === "pan") return;
                const p = point(e.clientX, e.clientY);
                if (tool === "text") {
                  if (caption.trim())
                    commit({
                      ...edits,
                      marks: [...edits.marks, { tool, points: [p], color, width, text: caption }],
                    });
                  return;
                }
                const mark: Mark = {
                  tool: tool === "crop" ? "rectangle" : tool,
                  points: [p],
                  color,
                  width,
                };
                currentStroke.current = mark;
                setPendingMark(mark);
              }}
              onPointerMove={(e) => {
                if (touches.current.has(e.pointerId))
                  touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (pinch.current && touches.current.size >= 2) {
                  const [a, b] = [...touches.current.values()] as [Point, Point],
                    start = pinch.current;
                  const next = Math.max(
                    0.1,
                    Math.min(
                      16,
                      (start.scale * Math.hypot(b.x - a.x, b.y - a.y)) /
                        Math.max(1, start.distance),
                    ),
                  );
                  const box = e.currentTarget.parentElement!.getBoundingClientRect(),
                    cx = box.x + box.width / 2,
                    cy = box.y + box.height / 2;
                  setScale(next);
                  setPan({
                    x:
                      (a.x + b.x) / 2 -
                      cx -
                      ((start.center.x - cx - start.pan.x) * next) / start.scale,
                    y:
                      (a.y + b.y) / 2 -
                      cy -
                      ((start.center.y - cy - start.pan.y) * next) / start.scale,
                  });
                  return;
                }
                if (pointer.current?.id !== e.pointerId) return;
                if (!editing || tool === "pan") {
                  const old = pointer.current;
                  setPan((p) => ({ x: p.x + e.clientX - old.x, y: p.y + e.clientY - old.y }));
                  pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
                  return;
                }
                const mark = currentStroke.current;
                if (!mark) return;
                const p = point(e.clientX, e.clientY),
                  next = {
                    ...mark,
                    points:
                      mark.tool === "pen" || mark.tool === "marker"
                        ? [...mark.points, p]
                        : [mark.points[0]!, p],
                  };
                currentStroke.current = next;
                setPendingMark(next);
              }}
              onPointerUp={(e) => {
                touches.current.delete(e.pointerId);
                if (touches.current.size < 2) pinch.current = null;
                if (pointer.current?.id !== e.pointerId) return;
                pointer.current = null;
                const mark = currentStroke.current;
                currentStroke.current = null;
                setPendingMark(null);
                if (!mark) return;
                if (tool === "crop") {
                  const a = mark.points[0]!,
                    b = mark.points.at(-1)!;
                  const x = Math.round(Math.min(a.x, b.x)),
                    y = Math.round(Math.min(a.y, b.y)),
                    w = Math.round(Math.abs(b.x - a.x)),
                    h = Math.round(Math.abs(b.y - a.y));
                  if (w >= 1 && h >= 1) commit({ ...edits, crop: { x, y, width: w, height: h } });
                } else commit({ ...edits, marks: [...edits.marks, mark] });
              }}
              onPointerCancel={() => {
                touches.current.clear();
                pinch.current = null;
                pointer.current = null;
                currentStroke.current = null;
                setPendingMark(null);
              }}
            >
              <g ref={group} transform={imageTransform(edits)}>
                <defs>
                  <clipPath id={cropId}>
                    <rect {...edits.crop} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${cropId})`}>
                  <image href={draft.base} width={draft.width} height={draft.height} />
                  {edits.marks.map(renderMark)}
                  {pendingMark && renderMark(pendingMark, -1)}
                </g>
              </g>
            </svg>
          </div>
        </>
      ) : (
        <ImageViewport url={url} name={file.name} />
      )}
      {closing && (
        <div className="markup-close" role="alert">
          <p>Сохранить разметку перед закрытием?</p>
          <button type="button" onClick={() => void exportCopy()}>
            Сохранить копию
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await persist()) finish.current();
            }}
          >
            Закрыть с черновиком
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await storage.removeItem(key);
                finish.current();
              } catch {
                setError("Не удалось удалить черновик.");
              }
            }}
          >
            Не сохранять
          </button>
          <button type="button" onClick={() => setClosing(false)}>
            Продолжить разметку
          </button>
        </div>
      )}
      {copy && (
        <FileCopySave
          file={copy}
          onClose={() => setCopy(null)}
          onSaved={() => {
            setCopy(null);
            if (closing) finish.current();
          }}
        />
      )}
    </div>
  );
}
