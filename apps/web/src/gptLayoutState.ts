import { type LayoutScope, type LayoutValue, layoutData, layoutPath } from "./gptLayoutData.ts";

export type LayoutAction = { key: string; value?: LayoutValue; input?: true };
export type LayoutStates = Record<string, LayoutValue>;
export type StateBinding = { name: string; setter: string; initial: string; key: string };
export function stateBinding(raw: string, at: number): StateBinding | undefined {
  const m =
    /^\{@body\s+const\s+\[\s*([\w$]+)\s*,\s*([\w$]+)\s*\]\s*=\s*DIL\.useState\(([\s\S]*)\)\s*;?\s*\}$/.exec(
      raw,
    );
  if (
    m &&
    m[1] !== m[2] &&
    ![m[1], m[2]].some((v) => ["constructor", "__proto__", "prototype"].includes(v!))
  )
    return { name: m[1]!, setter: m[2]!, initial: m[3]!, key: `${at}:${m[1]}:${m[3]}` };
}
export function bindState(
  binding: StateBinding,
  scope: LayoutScope,
  states: LayoutStates,
): boolean {
  const initial = layoutData(binding.initial, scope);
  if (initial === undefined) return false;
  scope[binding.name] = Object.hasOwn(states, binding.key) ? states[binding.key]! : initial;
  scope[binding.setter] = { __layoutSetter: binding.key };
  return true;
}
function setter(path: string, scope: LayoutScope): string | undefined {
  const value = layoutPath(path, scope);
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.__layoutSetter === "string"
    ? value.__layoutSetter
    : undefined;
}
/** Compile only local setter calls to data. No JavaScript, native actions or networking. */
export function layoutAction(raw: string, scope: LayoutScope): LayoutAction[] | undefined {
  let text = raw.startsWith("{") && raw.endsWith("}") ? raw.slice(1, -1).trim() : raw.trim();
  const direct = setter(text, scope);
  if (direct) return [{ key: direct, input: true }];
  const arrow = /^(?:\(\s*([A-Za-z_$][\w$]*)?\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*/.exec(text);
  if (!arrow) return;
  const param = arrow[1] || arrow[2];
  text = text.slice(arrow[0].length).trim();
  if (text.startsWith("{") && text.endsWith("}")) text = text.slice(1, -1);
  const actions: LayoutAction[] = [];
  let at = 0;
  while (at < text.length) {
    while (/[\s;]/.test(text[at] ?? "") && at < text.length) at++;
    if (at === text.length) break;
    if (actions.length >= 100) return;
    const call = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/.exec(text.slice(at));
    if (!call) return;
    const key = setter(call[1]!, scope);
    if (!key) return;
    at += call[0].length;
    const start = at;
    let depth = 1,
      quote = "";
    while (at < text.length && depth) {
      const c = text[at++]!;
      if (quote) {
        if (c === "\\") at++;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    if (depth) return;
    const arg = text.slice(start, at - 1).trim();
    if (param && arg === param) actions.push({ key, input: true });
    else {
      const value = layoutData(arg, scope);
      if (value === undefined) return;
      actions.push({ key, value });
    }
    if (text.slice(at).trim() && !/^\s*;/.test(text.slice(at))) return;
  }
  return actions.length ? actions : undefined;
}
