export type Cell = { value: string; from: number; to: number; quoted: boolean };
export type DelimitedRow = { cells: Cell[]; from: number; to: number; end: number };
/** Token offsets refer to the exact input, including BOM, quotes and line endings. */
export function parseDelimited(text: string, delimiter: string): DelimitedRow[] {
  if (![",", ";", "\t", "|"].includes(delimiter)) throw Error("Неизвестный разделитель.");
  const rows: DelimitedRow[] = [];
  let i = text.startsWith("\ufeff") ? 1 : 0;
  if (i === text.length) return rows;
  while (i < text.length) {
    const from = i,
      cells: Cell[] = [];
    for (;;) {
      const start = i,
        quoted = text[i] === '"';
      let value = "";
      if (quoted) {
        i++;
        let closed = false;
        while (i < text.length) {
          if (text[i] !== '"') value += text[i++];
          else if (text[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        }
        if (!closed || (i < text.length && ![delimiter, "\r", "\n"].includes(text[i]!)))
          throw Error(`Строка ${rows.length + 1}: проверь кавычки в исходном тексте.`);
      } else {
        while (i < text.length && ![delimiter, "\r", "\n"].includes(text[i]!)) {
          if (text[i] === '"')
            throw Error(`Строка ${rows.length + 1}: кавычка внутри поля без обрамления.`);
          value += text[i++];
        }
      }
      cells.push({ value, from: start, to: i, quoted });
      if (text[i] === delimiter) {
        i++;
        continue;
      }
      const to = i;
      if (text[i] === "\r" && text[i + 1] === "\n") i += 2;
      else if (text[i] === "\r" || text[i] === "\n") i++;
      rows.push({ cells, from, to, end: i });
      break;
    }
  }
  return rows;
}
export function detectDelimiter(text: string, name: string): string {
  if (/\.tsv$/i.test(name)) return "\t";
  let best = ",",
    score = 0;
  for (const delimiter of [",", ";", "\t", "|"]) {
    try {
      const rows = parseDelimited(text, delimiter).slice(0, 30);
      const width = rows[0]?.cells.length ?? 0;
      const next = width > 1 ? rows.filter((r) => r.cells.length === width).length * width : 0;
      if (next > score) {
        best = delimiter;
        score = next;
      }
    } catch {
      /* The selected delimiter remains explicitly changeable. */
    }
  }
  return best;
}
export function cellChange(cell: Cell, value: string, delimiter: string) {
  const quote = cell.quoted || value.includes(delimiter) || /["\r\n]/.test(value);
  return {
    from: cell.from,
    to: cell.to,
    insert: quote ? `"${value.replaceAll('"', '""')}"` : value,
  };
}
