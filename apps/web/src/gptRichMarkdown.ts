import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type Point = { offset?: number; line: number; column: number };
type Node = {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: Point; end: Point };
  data?: object;
};
type Rich = {
  tag: string;
  attrs: Record<string, string>;
  start: number;
  body: number;
  end: number;
  close: number;
  children: Rich[];
};
const tags = new Set([
  "WritingBlock",
  "box",
  "row",
  "col",
  "column",
  "text",
  "caption",
  "heading",
  "title",
  "badge",
  "icon",
  "divider",
  "spacer",
  "markdown",
  "grid",
  "grid-item",
  "list",
  "list-item",
]);
const roots = new Set([
  "WritingBlock",
  "box",
  "row",
  "col",
  "column",
  "grid",
  "list",
  "caption",
  "title",
  "heading",
  "text",
  "badge",
]);
const leaves = new Set(["icon", "divider", "spacer"]);
const parser = unified().use(remarkParse).use(remarkGfm);

function attributes(source: string) {
  const attrs: Record<string, string> = {};
  for (const a of source.matchAll(
    /([a-zA-Z][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(-?\d+(?:\.\d+)?|true|false)\s*\}))?/g,
  ))
    if (!["__proto__", "constructor", "prototype"].includes(a[1]!))
      attrs[a[1]!] = a[2] ?? a[3] ?? a[4] ?? "true";
  return attrs;
}

function references(tree: Node) {
  if (!tree.children) return;
  tree.children = tree.children.flatMap((node) => {
    if (!["html", "text"].includes(node.type) || !node.value) {
      references(node);
      return [node];
    }
    const parts: Node[] = [];
    let cursor = 0;
    for (const match of node.value.matchAll(
      /<(Entity|Link|Cite|AsyncImage|MemoryCite)\b((?:[^>"']|"[^"]*"|'[^']*')*)\/>/g,
    )) {
      if (cursor < match.index!)
        parts.push({ type: "text", value: node.value.slice(cursor, match.index) });
      parts.push({
        type: "gptReference",
        children: [],
        data: {
          hName: "span",
          hProperties: {
            dataGptLayout: match[1],
            dataGptAttrs: JSON.stringify(attributes(match[2]!)),
          },
        },
      });
      cursor = match.index! + match[0].length;
    }
    if (!parts.length) return [node];
    if (cursor < node.value.length) parts.push({ type: "text", value: node.value.slice(cursor) });
    return parts;
  });
}

/** Native public layout markup is data, never JSX/HTML to execute. Parse only
 * structural blocks at line starts; ordinary HTML and quoted code stay literal.
 * Unknown or malformed structures retain their original source text.
 */
export function remarkGptLayout() {
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value);
    if (
      !/<(?:WritingBlock|box|row|col|column|grid|list|caption|title|heading|text|badge)\b/.test(
        source,
      )
    ) {
      references(tree);
      return;
    }
    const protectedRanges: [number, number][] = [];
    const protect = (node: Node) => {
      const start = node.position?.start.offset,
        end = node.position?.end.offset;
      if (
        start !== undefined &&
        end !== undefined &&
        (node.type === "inlineCode" ||
          (node.type === "code" && /^\s*(`{3,}|~{3,})/.test(source.slice(start, end))))
      )
        protectedRanges.push([start, end]);
      for (const child of node.children ?? []) protect(child);
    };
    protect(tree);
    // CommonMark may classify a whole custom-tag block as HTML, so its first
    // AST has no code children. Recognize literal spans in the source as well.
    const fences = /(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n/g;
    for (let match = fences.exec(source); match; match = fences.exec(source)) {
      const marker = match[1]!;
      const closing = new RegExp(
        "(?:^|\\n)[ \\t]*" + marker[0] + "{" + marker.length + ",}[ \\t]*(?=\\r?\\n|$)",
        "g",
      );
      closing.lastIndex = fences.lastIndex;
      const end = closing.exec(source);
      const stop = end ? end.index + end[0].length : source.length;
      protectedRanges.push([match.index, stop]);
      fences.lastIndex = stop;
    }
    for (const match of source.matchAll(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g))
      protectedRanges.push([match.index!, match.index! + match[0].length]);
    const blocks: Rich[] = [],
      stack: Rich[] = [];
    // Quoted values may include >; expressions are accepted only as primitive
    // numbers/strings below. No evaluation, event handlers or raw style objects.
    const tokens = /<\/?(WritingBlock|[a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let invalid = false;
    for (const match of source.matchAll(tokens)) {
      const start = match.index!,
        end = start + match[0].length,
        tag = match[1]!;
      if (protectedRanges.some(([a, b]) => start >= a && start < b)) continue;
      // A writing block contains a document, not layout children. Preserve any
      // HTML examples in its body as literal Markdown, without interpreting them.
      if (stack.at(-1)?.tag === "WritingBlock" && tag !== "WritingBlock") continue;
      if (!stack.length) {
        if (
          match[0][1] === "/" ||
          !roots.has(tag) ||
          source.slice(source.lastIndexOf("\n", start - 1) + 1, start).trim()
        )
          continue;
        invalid = false;
      }
      if (!tags.has(tag)) {
        invalid = true;
        continue;
      }
      if (match[0][1] === "/") {
        const node = stack.at(-1);
        if (!node || node.tag !== tag) {
          invalid = true;
          continue;
        }
        node.end = start;
        node.close = end;
        stack.pop();
        if (!stack.length && !invalid) blocks.push(node);
        continue;
      }
      const attrs = attributes(match[2]!);
      const node: Rich = { tag, attrs, start, body: end, end, close: end, children: [] };
      stack.at(-1)?.children.push(node);
      if (!leaves.has(tag) && !/\/\s*>$/.test(match[0])) stack.push(node);
      else if (!stack.length && !invalid) blocks.push(node);
    }
    // During streaming, keep the unfinished block as ordinary Markdown until
    // its matching close arrives. Never drop text or infer synthetic content.
    if (!blocks.length) {
      references(tree);
      return;
    }
    const lines = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") lines.push(i + 1);
    const point = (offset: number): Point => {
      let low = 0,
        high = lines.length;
      while (low + 1 < high) {
        const mid = (low + high) >>> 1;
        if (lines[mid]! <= offset) low = mid;
        else high = mid;
      }
      return { offset, line: low + 1, column: offset - lines[low]! + 1 };
    };
    const markdown = (start: number, end: number, inside = false): Node[] => {
      const raw = source.slice(start, end);
      const map: number[] = [];
      let value = "",
        at = start;
      const rows = raw.split(/(?<=\n)/);
      const nonempty = rows.filter((line) => line.trim());
      const indent =
        inside && nonempty.length
          ? nonempty.reduce((min, line) => Math.min(min, /^ */.exec(line)![0].length), Infinity)
          : 0;
      for (const line of rows) {
        const skip = inside ? Math.min(indent, /^ */.exec(line)![0].length) : 0;
        for (let i = skip; i < line.length; i++) {
          map.push(at + i);
          value += line[i];
        }
        at += line.length;
      }
      map.push(end);
      const parsed = parser.parse(value) as Node;
      const positions = (node: Node) => {
        if (node.position)
          node.position = {
            start: point(map[node.position.start.offset ?? 0] ?? end),
            end: point(map[node.position.end.offset ?? value.length] ?? end),
          };
        for (const child of node.children ?? []) positions(child);
      };
      positions(parsed);
      return parsed.children ?? [];
    };
    const close = (node: Rich) => node.close;
    const render = (node: Rich): Node => {
      const children: Node[] = [];
      let cursor = node.body;
      for (const child of node.children) {
        children.push(...markdown(cursor, child.start, true), render(child));
        cursor = close(child);
      }
      children.push(...markdown(cursor, node.end, true));
      return {
        type: "gptLayout",
        children,
        data: {
          hName: leaves.has(node.tag) ? "span" : "div",
          hProperties: {
            dataGptLayout: node.tag,
            dataGptAttrs: JSON.stringify(node.attrs),
            ...(node.tag === "WritingBlock"
              ? { dataGptText: source.slice(node.body, node.end) }
              : {}),
          },
        },
        position: { start: point(node.start), end: point(close(node)) },
      };
    };
    const children: Node[] = [];
    let cursor = 0;
    for (const block of blocks) {
      children.push(...markdown(cursor, block.start), render(block));
      cursor = close(block);
    }
    children.push(...markdown(cursor, source.length));
    tree.children = children;
    references(tree);
  };
}
