import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
  layoutData,
  layoutAttributes,
  layoutTagEnd,
  layoutPath,
  layoutScalar,
  templateEnd,
  type LayoutScope,
} from "./gptLayoutData.ts";

type Point = { offset?: number; line: number; column: number };
type Node = {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: Point; end: Point };
  data?: object;
  templateLiteral?: boolean;
};
type Rich = {
  tag: string;
  attrs: Record<string, string>;
  start: number;
  body: number;
  end: number;
  close: number;
  children: Rich[];
  each?: { expression: string; name: string; index?: string };
  binding?: { expression: string; name: string };
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

const attributes = layoutAttributes;

function references(tree: Node) {
  if (!tree.children) return;
  tree.children = tree.children.flatMap((node) => {
    if (node.templateLiteral) return [node];
    if (!["html", "text"].includes(node.type) || !node.value) {
      references(node);
      return [node];
    }
    const parts: Node[] = [];
    let cursor = 0;
    for (const match of node.value.matchAll(
      /<(Entity|Link|Cite|FileCite|AsyncImage|MemoryCite)\b((?:[^>"']|"[^"]*"|'[^']*')*)\/>/g,
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
    // Balanced data expressions can contain nested objects and quoted > signs.
    const tokens = /\{@body\b|\{#each\b|\{\/each\}|<\/?(WritingBlock|[a-z][a-z0-9-]*)\b/g;
    let invalid = false;
    for (let match = tokens.exec(source); match; match = tokens.exec(source)) {
      const start = match.index!,
        tag = match[1]!;
      let end = start + match[0].length;
      if (protectedRanges.some(([a, b]) => start >= a && start < b)) continue;
      // A writing block contains a document, not layout children. Preserve any
      // HTML examples in its body as literal Markdown, without interpreting them.
      if (stack.at(-1)?.tag === "WritingBlock" && tag !== "WritingBlock") continue;
      if (match[0] === "{@body") {
        const stop = templateEnd(source, start);
        if (stop < 0) {
          invalid = true;
          break;
        }
        tokens.lastIndex = stop;
        if (!stack.length) continue;
        const header = /^\{@body\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?)\s*;?\s*\}$/.exec(
          source.slice(start, stop),
        );
        if (!header) {
          invalid = true;
          continue;
        }
        stack
          .at(-1)!
          .children.push({
            tag: "binding",
            attrs: {},
            start,
            body: stop,
            end: stop,
            close: stop,
            children: [],
            binding: { name: header[1]!, expression: header[2]! },
          });
        continue;
      }
      if (match[0] === "{#each") {
        const stop = templateEnd(source, start);
        if (stop < 0) {
          invalid = true;
          break;
        }
        tokens.lastIndex = stop;
        if (!stack.length) continue;
        const header =
          /^\{#each\s+([\s\S]+)\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*\}$/.exec(
            source.slice(start, stop),
          );
        if (!header) {
          invalid = true;
          continue;
        }
        const node: Rich = {
          tag: "each",
          attrs: {},
          start,
          body: stop,
          end: stop,
          close: stop,
          children: [],
          each: { expression: header[1]!, name: header[2]!, index: header[3] },
        };
        stack.at(-1)!.children.push(node);
        stack.push(node);
        continue;
      }
      if (match[0] === "{/each}") {
        const node = stack.at(-1);
        if (node?.tag !== "each") {
          if (node) invalid = true;
          continue;
        }
        node.end = start;
        node.close = end;
        stack.pop();
        continue;
      }
      end = layoutTagEnd(source, start);
      if (end < 0) {
        invalid = true;
        break;
      }
      tokens.lastIndex = end;
      const tagText = source.slice(start, end);
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
      const attrs = attributes(source.slice(start + match[0].length, end - 1));
      const node: Rich = { tag, attrs, start, body: end, end, close: end, children: [] };
      stack.at(-1)?.children.push(node);
      if (!leaves.has(tag) && !/\/\s*>$/.test(tagText)) stack.push(node);
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
    const interpolate = (nodes: Node[], scope: LayoutScope) => {
      const visit = (node: Node) => {
        if (node.type === "text" && node.value) {
          const previous = node.value;
          node.value = node.value.replace(
            /\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\}/g,
            (original, path: string) => layoutScalar(layoutPath(path, scope)) ?? original,
          );
          if (node.value !== previous) node.templateLiteral = true;
        }
        for (const child of node.children ?? []) visit(child);
      };
      for (const node of nodes) visit(node);
      return nodes;
    };
    const body = (node: Rich, scope: LayoutScope): Node[] => {
      const children: Node[] = [];
      const local = { ...scope };
      let cursor = node.body;
      for (const child of node.children) {
        children.push(...interpolate(markdown(cursor, child.start, true), local));
        const bound = child.binding && layoutData(child.binding.expression, local);
        if (child.binding && bound !== undefined) {
          Object.defineProperty(local, child.binding.name, {
            value: bound,
            enumerable: true,
            configurable: true,
          });
        } else children.push(...render(child, local));
        cursor = close(child);
      }
      children.push(...interpolate(markdown(cursor, node.end, true), local));
      return children;
    };
    const render = (node: Rich, scope: LayoutScope = {}): Node[] => {
      if (node.binding)
        return [
          {
            type: "paragraph",
            children: [
              { type: "text", value: source.slice(node.start, node.close), templateLiteral: true },
            ],
          },
        ];
      if (node.each) {
        const items = layoutData(node.each.expression, scope);
        if (!Array.isArray(items))
          return [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value: source.slice(node.start, node.close),
                  templateLiteral: true,
                },
              ],
            },
          ];
        return items.flatMap((item, index) =>
          body(node, {
            ...scope,
            [node.each!.name]: item,
            ...(node.each!.index ? { [node.each!.index]: index } : {}),
          }),
        );
      }
      const attrs = Object.fromEntries(
        Object.entries(node.attrs).map(([key, value]) => {
          const expression = /^\{([^{}]+)\}$/.exec(value);
          return [
            key,
            expression ? (layoutScalar(layoutData(expression[1]!, scope)) ?? value) : value,
          ];
        }),
      );
      return [
        {
          type: "gptLayout",
          children: body(node, node.tag === "WritingBlock" ? {} : scope),
          data: {
            hName: leaves.has(node.tag) ? "span" : "div",
            hProperties: {
              dataGptLayout: node.tag,
              dataGptAttrs: JSON.stringify(attrs),
              ...(node.tag === "WritingBlock"
                ? { dataGptText: source.slice(node.body, node.end) }
                : {}),
            },
          },
          position: { start: point(node.start), end: point(close(node)) },
        },
      ];
    };
    const children: Node[] = [];
    let cursor = 0;
    for (const block of blocks) {
      children.push(...markdown(cursor, block.start), ...render(block));
      cursor = close(block);
    }
    children.push(...markdown(cursor, source.length));
    tree.children = children;
    references(tree);
  };
}
