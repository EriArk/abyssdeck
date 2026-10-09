import type { GptFile, GptRichReference } from "@codex-web/shared";
import type { CSSProperties, ReactNode } from "react";
import { lazy, Suspense } from "react";
import type { Components } from "react-markdown";
import { CopyButton } from "./CopyButton";
import { GptRichImage } from "./GptRichImage";
import { GptSvg } from "./GptSvg";
import { layoutData } from "./gptLayoutData";
import type { LayoutAction } from "./gptLayoutState";
import { richReference, richUrl } from "./gptRichReferences";
import { Icon } from "./icons";
import "./gpt-rich-layout.css";

const ContentIcon = lazy(() => import("./GptContentIcon"));
const values = (value: string | undefined, choices: string[]) =>
  choices.includes(value ?? "") ? value : undefined;
type FileSources = {
  onAction?: (actions: LayoutAction[], input?: string | number | boolean) => void;
  richReferences?: GptRichReference[];
  files?: GptFile[];
  onOpen?: (source: string) => void;
};
function layout(
  tag: string,
  raw: unknown,
  children: ReactNode,
  text?: unknown,
  sources?: FileSources,
) {
  const a: Record<string, string> = typeof raw === "string" ? JSON.parse(raw) : {};
  if (tag === "unsupported")
    return (
      <details className="gpt-rich-unsupported">
        <summary>Элемент {a.tag}: исходный текст</summary>
        <pre>{typeof text === "string" ? text : ""}</pre>
      </details>
    );
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
  const reference = richReference(tag, a, sources?.richReferences);
  if (tag === "Entity")
    return reference?.status === "resolved" && richUrl(reference.url) ? (
      <a href={reference.url} title={a.disambig} target="_blank" rel="noopener noreferrer">
        {a.value}
      </a>
    ) : (
      <span title={a.disambig}>{a.value}</span>
    );
  if (tag === "MemoryCite")
    return (
      <span className="muted" title="GPT использовал сохранённую память">
        Память
      </span>
    );
  if (tag === "Link") {
    const href =
      richUrl(a.url) || (reference?.status === "resolved" ? richUrl(reference.url) : undefined);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {a.title || href}
      </a>
    ) : (
      <span>{a.title || "Ссылка недоступна"}</span>
    );
  }
  if (tag === "Cite") {
    const items =
      reference?.status === "resolved"
        ? reference.sources?.filter((item) => richUrl(item.url))
        : undefined;
    return items?.length ? (
      <span className="gpt-rich-citations">
        {items.map((item) => (
          <a
            key={item.url}
            className="gpt-file-citation"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title={item.snippet || item.title}
          >
            {item.label || item.title || new URL(item.url).hostname}
          </a>
        ))}
      </span>
    ) : (
      <span className="muted gpt-rich-unavailable" title="GPT не передал адрес источника">
        {reference?.status === "pending" ? "[Источник загружается…]" : "[Источник недоступен]"}
      </span>
    );
  }
  if (tag === "AsyncImage")
    return <GptRichImage key={JSON.stringify(a)} attrs={a} reference={reference} />;
  const action = (key: string, input?: string | number | boolean) => {
    if (a[key]) sources?.onAction?.(JSON.parse(a[key]) as LayoutAction[], input);
  };
  if (tag === "button")
    return (
      <button
        type="button"
        className="secondary gpt-rich-control"
        title={
          a.unavailableAction === "true"
            ? "Действие этого элемента пока не поддерживается"
            : a.title
        }
        aria-label={a["aria-label"] || (a.uniform === "true" ? "Изменить значение" : undefined)}
        disabled={a.disabled === "true" || a.unavailableAction === "true" || !a.onClick}
        onClick={() => action("onClick")}
      >
        {children}
      </button>
    );
  if (["slider", "input", "checkbox", "switch", "textarea", "select"].includes(tag)) {
    const disabled =
      a.disabled === "true" || a.unavailableAction === "true" || (!a.onChange && !a.onInput);
    const label = a["aria-label"] || a.label || (tag === "slider" ? "Значение" : "Поле");
    const change = (value: string | number | boolean) =>
      action(a.onChange ? "onChange" : "onInput", value);
    if (tag === "textarea")
      return (
        <textarea
          className="gpt-rich-control"
          aria-label={label}
          disabled={disabled}
          value={a.value || ""}
          onChange={(e) => change(e.target.value)}
        />
      );
    if (tag === "select")
      return (
        <select
          className="gpt-rich-control"
          aria-label={label}
          disabled={disabled}
          value={a.value}
          onChange={(e) => change(e.target.value)}
        >
          {children}
        </select>
      );
    const type =
      tag === "slider"
        ? "range"
        : ["checkbox", "switch"].includes(tag)
          ? "checkbox"
          : values(a.type, ["text", "number", "range", "checkbox", "color", "date"]) || "text";
    return (
      <input
        className="gpt-rich-control"
        aria-label={label}
        type={type}
        disabled={disabled}
        min={a.min}
        max={a.max}
        step={a.step}
        value={a.value ?? (type === "range" ? "0" : "")}
        checked={type === "checkbox" ? (a.checked ?? a.value) === "true" : undefined}
        onChange={(e) =>
          change(
            type === "checkbox"
              ? e.target.checked
              : ["range", "number"].includes(type)
                ? Number.isFinite(e.target.valueAsNumber)
                  ? e.target.valueAsNumber
                  : 0
                : e.target.value,
          )
        }
      />
    );
  }
  if (tag === "option") return <option value={a.value}>{children}</option>;
  const style: CSSProperties = {};
  if (tag === "badge") style.flexShrink = 0;
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
  for (const key of ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight"] as const)
    style[key] = length(a[key]);
  if (tag === "box" && length(a.size) !== undefined) {
    style.width = style.height = length(a.size);
    style.flexShrink = 0;
  }
  if (a.tabularNums === "true") style.fontVariantNumeric = "tabular-nums";
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
        <Suspense
          fallback={
            <span aria-hidden="true" style={{ display: "inline-block", width: 20, height: 20 }} />
          }
        >
          <ContentIcon
            name={a.name ?? ""}
            size={
              ({ xs: 12, sm: 16, md: 20, lg: 28, xl: 36, "2xl": 44 } as Record<string, number>)[
                a.size ?? ""
              ] ?? 20
            }
          />
        </Suspense>
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
    svg: GptSvg,
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
