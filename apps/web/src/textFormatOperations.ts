/** Whitespace-only JSON formatting: preserve number lexemes and duplicate keys. */
export function formatJson(text: string, lines = false): string {
  if (lines)
    return text
      .split(/\r\n|\n|\r/)
      .map((line, index) => {
        if (!line.trim()) return line;
        try {
          JSON.parse(line);
        } catch {
          throw Error(`Некорректный JSON в строке ${index + 1}.`);
        }
        return jsonLayout(line, false);
      })
      .join("\n");
  JSON.parse(text);
  return jsonLayout(text, true) + (text.endsWith("\n") ? "\n" : "");
}
function jsonLayout(text: string, pretty: boolean) {
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[^\s]/g) ?? [];
  let result = "",
    depth = 0;
  const newline = () => (pretty ? "\n" + "  ".repeat(depth) : "");
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "{" || token === "[") {
      result += token;
      depth++;
      if (tokens[i + 1] !== (token === "{" ? "}" : "]")) result += newline();
    } else if (token === "}" || token === "]") {
      depth--;
      if (tokens[i - 1] !== (token === "}" ? "{" : "[")) result += newline();
      result += token;
    } else result += token + (token === "," ? newline() : token === ":" && pretty ? " " : "");
  }
  return result;
}

export type MarkdownAction =
  | "heading"
  | "bold"
  | "italic"
  | "list"
  | "task"
  | "quote"
  | "link"
  | "image"
  | "code"
  | "table";
/** UTF-16 selection coordinates, as used by CodeMirror. */
export function markdownChange(text: string, from: number, to: number, action: MarkdownAction) {
  let selected = text.slice(from, to),
    insert = "",
    start = 0,
    end = 0;
  if (["heading", "list", "task", "quote"].includes(action)) {
    const first = from === 0 ? 0 : text.lastIndexOf("\n", from - 1) + 1;
    const last = text.indexOf("\n", to > from && text[to - 1] === "\n" ? to - 1 : to);
    from = first;
    to = last < 0 ? text.length : last;
    selected = text.slice(from, to);
    const prefix = { heading: "## ", list: "- ", task: "- [ ] ", quote: "> " }[
      action as "heading" | "list" | "task" | "quote"
    ]!;
    const rows = selected.split("\n"),
      remove = rows.every((row) => row.startsWith(prefix));
    insert = rows.map((row) => (remove ? row.slice(prefix.length) : prefix + row)).join("\n");
    end = insert.length;
  } else {
    const pair = action === "bold" ? "**" : "*";
    if (action === "bold" || action === "italic") {
      if (
        selected.startsWith(pair) &&
        selected.endsWith(pair) &&
        selected.length >= pair.length * 2
      ) {
        insert = selected.slice(pair.length, -pair.length);
        end = insert.length;
      } else {
        insert = pair + (selected || "текст") + pair;
        start = pair.length;
        end = insert.length - pair.length;
      }
    } else if (action === "link" || action === "image") {
      const label = selected || (action === "image" ? "Описание" : "Ссылка");
      insert = (action === "image" ? "!" : "") + `[${label}](https://)`;
      start = insert.indexOf("https://");
      end = start + 8;
    } else if (action === "code") {
      const fence = "`".repeat(
        Math.max(3, ...[...selected.matchAll(/`+/g)].map((m) => m[0].length + 1)),
      );
      insert = `${from && text[from - 1] !== "\n" ? "\n" : ""}${fence}\n${selected || "код"}\n${fence}\n`;
      start = insert.indexOf(fence) + fence.length + 1;
      end = start + (selected || "код").length;
    } else {
      insert = `${from && text[from - 1] !== "\n" ? "\n" : ""}| Заголовок | Значение |\n| --- | --- |\n| Текст | Текст |\n`;
      end = insert.length;
    }
  }
  return { from, to, insert, anchor: from + start, head: from + end };
}
