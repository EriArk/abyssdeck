import type { CSSProperties, ReactNode } from "react";
import type { Components } from "react-markdown";
import type { GptFile } from "@codex-web/shared";
import { CopyButton } from "./CopyButton";
import { Icon } from "./icons";
import { layoutData } from "./gptLayoutData";
import "./gpt-rich-layout.css";

const icons: Record<string, string> = {
  layers: "layers",
  play: "play",
  "minimize-2": "minimize",
  "sliders-horizontal": "settings",
  "message-circle": "chat",
  "log-out": "logout",
  "gamepad-2": "gamepad",
  sparkles: "sparkles",
  heart: "heart",
  star: "star",
  "chevron-right": "chevron",
  "lock-keyhole": "lock",
  "external-link": "external",
  "circle-check": "check",
  "check-circle": "check",
  "file-text": "file",
  download: "arrow",
  search: "search",
  users: "people",
  globe: "external",
  code: "terminal",
  folder: "folder",
  link: "link",
  info: "help",
  image: "image",
  archive: "archive",
  "arrow-down": "arrow",
  clock: "history",
  "clock-3": "history",
  "file-lock": "lock",
  "gallery-horizontal": "image",
  library: "library",
  lock: "lock",
  "package-open": "package",
  compass: "compass",
  gem: "gem",
  gift: "gift",
  shapes: "shapes",
  ship: "ship",
  trophy: "trophy",
};
const values = (value: string | undefined, choices: string[]) =>
  choices.includes(value ?? "") ? value : undefined;
type FileSources = { files?: GptFile[]; onOpen?: (source: string) => void };
function layout(
  tag: string,
  raw: unknown,
  children: ReactNode,
  text?: unknown,
  sources?: FileSources,
) {
  const a: Record<string, string> = typeof raw === "string" ? JSON.parse(raw) : {};
  if (tag === "FileCite") {
    const file = sources?.files?.find((file) => file.id === a.ref);
    const start = /^\d+$/.test(a.line_range_start ?? "") ? Number(a.line_range_start) : 0;
    const end = /^\d+$/.test(a.line_range_end ?? "") ? Number(a.line_range_end) : 0;
    const lines =
      Number.isSafeInteger(start) && start > 0
        ? `стр. ${start}${Number.isSafeInteger(end) && end > start ? `–${end}` : ""}`
        : "";
    const label = [file?.name || "Файл", lines].filter(Boolean).join(" · ");
    const content = (
      <>
        <Icon name="file" size={14} />
        <span>{label}</span>
      </>
    );
    return file && sources?.onOpen ? (
      <button
        type="button"
        className="gpt-file-citation"
        title={`Открыть ${label}`}
        onClick={() => sources.onOpen?.(file.url)}
      >
        {content}
      </button>
    ) : (
      <span
        className="gpt-file-citation"
        title={`Источник: ${a.ref || "не указан"}. Файл отсутствует среди загруженных вложений чата.`}
      >
        {content}
      </span>
    );
  }
  if (tag === "WritingBlock")
    return (
      <section className="gpt-writing-block">
        <header className="gpt-writing-block-header">
          <span>
            {a.title ||
              a.subject ||
              (a.variant === "email"
                ? "Письмо"
                : a.variant === "chat_message"
                  ? "Сообщение"
                  : "Текст")}
          </span>
          <CopyButton text={typeof text === "string" ? text : ""} label="Копировать текст блока" />
        </header>
        <div className="gpt-writing-block-body">{children}</div>
      </section>
    );
  if (tag === "Entity") return <span title={a.disambig}>{a.value}</span>;
  if (tag === "MemoryCite")
    return (
      <span className="muted" title="GPT использовал сохранённую память">
        Память
      </span>
    );
  if (tag === "Link")
    return /^https?:\/\//i.test(a.url ?? "") ? (
      <a href={a.url} target="_blank" rel="noopener noreferrer">
        {a.title || a.url}
      </a>
    ) : (
      <span>{a.title || "Ссылка недоступна"}</span>
    );
  if (tag === "Cite")
    return (
      <span
        className="muted gpt-rich-unavailable"
        title="Адрес источника не передан в тексте ответа"
      >
        [Источник недоступен]
      </span>
    );
  if (tag === "AsyncImage")
    return (
      <span className="gpt-rich-unavailable muted">
        <Icon name="image" size={18} /> Иллюстрация недоступна
      </span>
    );
  const style: CSSProperties = {};
  const length = (value: unknown): string | number | undefined => {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value * 4;
    if (typeof value !== "string") return;
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 4;
    if (/^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(value)) return value;
  };
  for (const key of ["gap", "padding", "margin"] as const)
    if (a[key]) {
      style[key] = length(a[key]);
      if (key !== "gap" && a[key]!.startsWith("{")) {
        const pair = layoutData(a[key]!.slice(1, -1), {});
        if (pair && typeof pair === "object" && !Array.isArray(pair)) {
          style[key === "padding" ? "paddingInline" : "marginInline"] = length(pair.x);
          style[key === "padding" ? "paddingBlock" : "marginBlock"] = length(pair.y);
        }
      }
    }
  style.minHeight = length(a.minHeight);
  style.textAlign = values(a.textAlign, [
    "left",
    "center",
    "right",
    "start",
    "end",
  ]) as CSSProperties["textAlign"];
  if (
    /^(?:#[\da-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\))$/i.test(
      a.background ?? "",
    )
  )
    style.backgroundColor = a.background;
  style.flex = a.flex && /^\d+$/.test(a.flex) ? Number(a.flex) : undefined;
  style.alignItems = values(a.align, ["start", "center", "end", "stretch", "baseline"]);
  style.justifyContent =
    (
      { between: "space-between", around: "space-around", evenly: "space-evenly" } as Record<
        string,
        string
      >
    )[a.justify ?? ""] ?? values(a.justify, ["start", "end", "center", "stretch"]);
  style.flexWrap = values(a.wrap, ["wrap", "nowrap", "wrap-reverse"]) as CSSProperties["flexWrap"];
  style.flexDirection = values(a.direction, ["row", "column"]) as CSSProperties["flexDirection"];
  if (tag === "grid" && a.columns && /^\d+$/.test(a.columns) && Number(a.columns) > 0) {
    (style as CSSProperties & { "--gpt-columns": number })["--gpt-columns"] = Number(a.columns);
    // An explicit column count is part of the supplied diagram, including on phones.
    style.gridTemplateColumns = `repeat(${Number(a.columns)}, minmax(0, 1fr))`;
  }
  if (tag === "list")
    return a.marker === "number" ? (
      <ol className="gpt-rich-list" style={style}>
        {children}
      </ol>
    ) : (
      <ul className="gpt-rich-list" style={style}>
        {children}
      </ul>
    );
  if (tag === "list-item") return <li className="gpt-rich-list-item">{children}</li>;
  if (tag === "icon")
    return (
      <span
        className="gpt-rich-icon"
        data-icon={a.name}
        data-color={values(a.color, ["secondary", "tertiary"])}
        title={a.name}
      >
        <Icon
          name={icons[a.name ?? ""] ?? "circle"}
          size={
            ({ xs: 12, sm: 16, md: 20, lg: 28, xl: 36, "2xl": 44 } as Record<string, number>)[
              a.size ?? ""
            ] ?? 20
          }
        />
      </span>
    );
  if (tag === "divider") return <hr className="gpt-rich-divider" />;
  if (tag === "spacer") return <span className="gpt-rich-spacer" aria-hidden="true" />;
  return (
    <div
      className="gpt-rich"
      data-layout={tag}
      style={style}
      data-background={values(a.background, [
        "surface-secondary",
        "surface-primary",
        "surface-tertiary",
      ])}
      data-border={a.border !== undefined && a.border !== "false" ? "true" : undefined}
      data-radius={values(a.radius, ["none", "sm", "md", "lg", "xl", "full"])}
      data-size={values(a.size, ["3xs", "2xs", "xs", "sm", "md", "lg", "xl"])}
      data-color={values(a.color, [
        "secondary",
        "tertiary",
        "success",
        "danger",
        "warning",
        "info",
      ])}
      data-weight={values(a.weight, ["normal", "medium", "semibold", "bold"])}
    >
      {children}
    </div>
  );
}

export function gptLayoutComponents(base: Components = {}, sources?: FileSources): Components {
  const Div = base.div;
  return {
    ...base,
    div: (props) =>
      typeof props.node?.properties.dataGptLayout === "string" ? (
        layout(
          props.node.properties.dataGptLayout,
          props.node.properties.dataGptAttrs,
          props.children,
          props.node.properties.dataGptText,
          sources,
        )
      ) : typeof Div === "function" ? (
        <Div {...props} />
      ) : (
        <div>{props.children}</div>
      ),
    span: (props) =>
      typeof props.node?.properties.dataGptLayout === "string" ? (
        layout(
          props.node.properties.dataGptLayout,
          props.node.properties.dataGptAttrs,
          props.children,
          props.node.properties.dataGptText,
          sources,
        )
      ) : (
        <span>{props.children}</span>
      ),
  };
}
