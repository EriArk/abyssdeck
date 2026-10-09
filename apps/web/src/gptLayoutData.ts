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
  const primary = (): LayoutValue => {
    space();
    const char = source[at];
    if (char === "(") {
      at++;
      const result = value();
      take(")");
      return result;
    }
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
  const operator = (options: string[]) => {
    space();
    const found = options.find((op) => source.startsWith(op, at));
    if (found) at += found.length;
    return found;
  };
  const equality = (): LayoutValue => {
    let result = primary();
    for (let op = operator(["===", "!=="]); op; op = operator(["===", "!=="])) {
      const right = primary();
      result = op === "===" ? result === right : result !== right;
    }
    return result;
  };
  const conjunction = (): LayoutValue => {
    let result = equality();
    while (operator(["&&"])) {
      const right = equality();
      result = result && right;
    }
    return result;
  };
  const disjunction = (): LayoutValue => {
    let result = conjunction();
    while (operator(["||"])) {
      const right = conjunction();
      result = result || right;
    }
    return result;
  };
  const value = (): LayoutValue => {
    const result = disjunction();
    if (!operator(["?"])) return result;
    const yes = value();
    take(":");
    const no = value();
    return result ? yes : no;
  };
  try {
    const result = value();
    space();
    return at === source.length ? result : undefined;
  } catch {
    return undefined;
  }
}

/** Consume tags without mistaking > or quotes inside a data expression for a close. */
export function layoutTagEnd(source: string, start: number): number {
  let quote = "";
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "{") {
      const end = templateEnd(source, i);
      if (end < 0) return -1;
      i = end - 1;
    } else if (char === ">") return i + 1;
  }
  return -1;
}

export function layoutAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const token = /([A-Za-z][\w-]*)\s*(=\s*)?/gy;
  let at = 0;
  while (at < source.length) {
    while (/\s/.test(source[at] ?? "") && at < source.length) at++;
    if (source[at] === "/" || at === source.length) break;
    token.lastIndex = at;
    const match = token.exec(source);
    if (!match) break;
    at = token.lastIndex;
    let value = "true";
    if (match[2]) {
      const start = at,
        quote = source[at];
      if (quote === "{") {
        const end = templateEnd(source, at);
        if (end < 0) break;
        value = source.slice(at, end);
        at = end;
        const literal = layoutScalar(layoutData(value.slice(1, -1), {}));
        if (literal !== undefined) value = literal;
      } else if (quote === '"' || quote === "'") {
        at++;
        while (at < source.length && source[at] !== quote) {
          if (source[at] === "\\") at++;
          at++;
        }
        if (at === source.length) break;
        value = source.slice(start + 1, at++);
      } else {
        while (at < source.length && !/[\s/>]/.test(source[at]!)) at++;
        value = source.slice(start, at);
      }
    }
    if (!forbidden.has(match[1]!)) attrs[match[1]!] = value;
  }
  return attrs;
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
