import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type SVGProps,
} from "react";
/** Scope paint servers and local references to this mounted drawing, including repeated messages. */
export function GptSvg({
  children,
  node: _node,
  ...props
}: SVGProps<SVGSVGElement> & { node?: unknown }) {
  const prefix = "gpt-svg-" + useId().replace(/[^a-zA-Z0-9_-]/g, "") + "-";
  const scope = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (child) => {
      if (!isValidElement<Record<string, unknown>>(child)) return child;
      const attrs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(child.props)) {
        if (typeof value !== "string") continue;
        if (key === "id") attrs.id = prefix + value;
        else if (key === "href" && value.startsWith("#"))
          attrs.href = "#" + prefix + value.slice(1);
        else if (/^url\(#[\w:.-]+\)$/.test(value)) attrs[key] = value.replace("#", "#" + prefix);
      }
      return cloneElement(child, attrs, scope(child.props.children as ReactNode));
    });
  return (
    <svg {...props} style={{ maxWidth: "100%", height: "auto" }}>
      {scope(children)}
    </svg>
  );
}
