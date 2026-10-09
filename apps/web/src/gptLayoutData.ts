// The public template dialect contains literal data and local paths, not JavaScript.
export type LayoutValue =
  | string
  | number
  | boolean
  | null
  | LayoutValue[]
  | { [key: string]: LayoutValue };
export type LayoutScope = Record<string, LayoutValue>;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);

export function layoutPath(path: string, scope: LayoutScope): LayoutValue | undefined {
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(path)) return;
  let value: LayoutValue = scope;
  for (const key of path.split(".")) {
    if (forbidden.has(key) || !value || typeof value !== "object" || !Object.hasOwn(value, key))
      return;
    value = (value as LayoutScope)[key]!;
  }
  return value;
}

export function layoutData(source: string, scope: LayoutScope): LayoutValue | undefined {
  let at = 0;
  const space = () => {
    while (/\s/.test(source[at] ?? "") && at < source.length) at++;
  };
  const take = (char: string) => {
    space();
    if (source[at] !== char) throw Error("literal");
    at++;
  };
  const string = (): string => {
    const quote = source[at++];
    let result = "";
    while (at < source.length) {
      const char = source[at++];
      if (char === quote) return result;
      if (char !== "\\") {
        result += char;
        continue;
      }
      const next = source[at++];
      if (next === "u") {
        const hex = source.slice(at, at + 4);
        if (!/^[\da-f]{4}$/i.test(hex)) throw Error("escape");
        result += String.fromCharCode(parseInt(hex, 16));
        at += 4;
      } else {
        const escapes: Record<string, string> = {
          n: "\n",
          r: "\r",
          t: "\t",
          b: "\b",
          f: "\f",
          "\\": "\\",
          '"': '"',
          "'": "'",
          "/": "/",
        };
        if (!next || !Object.hasOwn(escapes, next)) throw Error("escape");
        result += escapes[next];
      }
    }
    throw Error("string");
  };
  const value = (): LayoutValue => {
    space();
    const char = source[at];
    if (char === '"' || char === "'") return string();
    if (char === "[" || char === "{") {
      at++;
      const array = char === "[",
        end = array ? "]" : "}";
      const result: LayoutValue[] | LayoutScope = array ? [] : Object.create(null);
      space();
      while (source[at] !== end) {
        let key = "";
        if (!array) {
          space();
          if (source[at] === '"' || source[at] === "'") key = string();
          else {
            key = /^[A-Za-z_$][\w$]*/.exec(source.slice(at))?.[0] ?? "";
            if (!key) throw Error("key");
            at += key.length;
          }
          if (forbidden.has(key)) throw Error("key");
          take(":");
        }
        const item = value();
        if (array) (result as LayoutValue[]).push(item);
        else (result as LayoutScope)[key] = item;
        space();
        if (source[at] === end) break;
        take(",");
        space();
      }
      take(end);
      return result;
    }
    const token =
      /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(
        source.slice(at),
      )?.[0];
    if (!token) throw Error("value");
    at += token.length;
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;
    if (/^-?\d/.test(token) && Number.isFinite(Number(token))) return Number(token);
    const resolved = layoutPath(token, scope);
    if (resolved === undefined) throw Error("path");
    return resolved;
  };
  try {
    const result = value();
    space();
    return at === source.length ? result : undefined;
  } catch {
    return undefined;
  }
}

export function layoutScalar(value: LayoutValue | undefined): string | undefined {
  return value !== undefined && value !== null && typeof value !== "object"
    ? String(value)
    : undefined;
}

export function templateEnd(source: string, start: number): number {
  let depth = 0,
    quote = "";
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return i + 1;
  }
  return -1;
}
