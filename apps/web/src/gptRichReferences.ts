import type { GptRichReference } from "@codex-web/shared";
import { layoutData } from "./gptLayoutData.ts";

const omitted = new Set(["__resolutionId", "__state", "children", "fallback"]);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : record(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
/** Match the native component contract inside this message only; never search by query or label. */
export function richReference(
  component: string,
  attrs: Record<string, string>,
  references?: GptRichReference[],
) {
  if (attrs.__resolutionId)
    return references?.find(
      (r) => (!r.component || r.component === component) && r.key === attrs.__resolutionId,
    );
  const entries = Object.entries(attrs).filter(([key]) => !omitted.has(key));
  return references?.find((r) => {
    if (r.component !== component) return false;
    try {
      const key = JSON.parse(r.key);
      if (!Array.isArray(key) || key.length !== 2 || key[0] !== component || !record(key[1]))
        return false;
      const props = Object.entries(key[1]).filter(([k]) => !omitted.has(k));
      return (
        props.length === entries.length &&
        props.every(([k, value]) => {
          if (!Object.hasOwn(attrs, k)) return false;
          const raw = attrs[k]!;
          const parsed =
            raw.startsWith("{") && raw.endsWith("}") ? layoutData(raw.slice(1, -1), {}) : raw;
          return typeof value === "object"
            ? JSON.stringify(stable(value)) === JSON.stringify(stable(parsed))
            : String(value) === parsed;
        })
      );
    } catch {
      return false;
    }
  });
}
export function richUrl(value?: string) {
  try {
    if (!value || /[\u0000-\u0020\u007f]/.test(value)) return;
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return;
  }
}
