import type { CSSProperties, ReactNode } from "react";
import type { Components } from "react-markdown";
import { Icon } from "./icons";
import "./gpt-rich-layout.css";

const icons: Record<string, string> = {
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
function layout(tag: string, raw: unknown, children: ReactNode) {
  const a: Record<string, string> = typeof raw === "string" ? JSON.parse(raw) : {};
  if (tag === "Entity") return <span title={a.disambig}>{a.value}</span>;
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
  for (const key of ["gap", "padding", "margin"] as const)
    if (a[key] && /^\d+(?:\.\d+)?$/.test(a[key]!)) style[key] = Number(a[key]) * 4;
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
  if (tag === "grid" && a.columns && /^\d+$/.test(a.columns) && Number(a.columns) > 0)
    (style as CSSProperties & { "--gpt-columns": number })["--gpt-columns"] = Number(a.columns);
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
      <span className="gpt-rich-icon" data-icon={a.name} title={a.name}>
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
      data-size={values(a.size, ["xs", "sm", "md", "lg", "xl"])}
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

export function gptLayoutComponents(base: Components = {}): Components {
  const Div = base.div;
  return {
    ...base,
    div: (props) =>
      typeof props.node?.properties.dataGptLayout === "string" ? (
        layout(
          props.node.properties.dataGptLayout,
          props.node.properties.dataGptAttrs,
          props.children,
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
        )
      ) : (
        <span>{props.children}</span>
      ),
  };
}
