import { useMemo } from "react";

type Cell = { text: string; line?: number; kind: string };
export function diffRows(text: string) {
  const rows: { before?: Cell; after?: Cell; meta?: string }[] = [];
  let inHunk = false;
  let oldLine = 0,
    newLine = 0;
  let removed: Cell[] = [],
    added: Cell[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++)
      rows.push({ before: removed[i], after: added[i] });
    removed = [];
    added = [];
  };
  for (const line of text.split("\n").slice(0, 6000)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      flush();
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      rows.push({ meta: line });
    } else if (line.startsWith("diff --git ")) {
      flush();
      inHunk = false;
      rows.push({ meta: line });
    } else if (inHunk) {
      if (line.startsWith("-"))
        removed.push({ text: line.slice(1), line: oldLine++, kind: "removed" });
      else if (line.startsWith("+"))
        added.push({ text: line.slice(1), line: newLine++, kind: "added" });
      else if (line.startsWith(" ")) {
        flush();
        rows.push({
          before: { text: line.slice(1), line: oldLine++, kind: "context" },
          after: { text: line.slice(1), line: newLine++, kind: "context" },
        });
      } else {
        flush();
        rows.push({ meta: line });
      }
    } else rows.push({ meta: line });
  }
  flush();
  return rows.map((row, index) => ({ ...row, key: `diff-line:${index}` }));
}
export function GitDiff({ text, paired = false }: { text: string; paired?: boolean }) {
  const rows = useMemo(() => diffRows(text), [text]);
  const cell = (value: Cell | undefined) => (
    <div className={`git-diff-cell ${value?.kind ?? "empty"}`}>
      <span className="git-line-number" aria-hidden="true">
        {value?.line}
      </span>
      <span className="git-line-sign" aria-hidden="true">
        {value?.kind === "added" ? "+" : value?.kind === "removed" ? "−" : " "}
      </span>
      <code>{value?.text ?? ""}</code>
    </div>
  );
  return (
    <section className="git-diff" data-paired={paired} aria-label="Сравнение файлов">
      {paired && (
        <div className="git-diff-pair git-diff-labels">
          <span>До</span>
          <span>После</span>
        </div>
      )}
      {rows.map((row) =>
        row.meta !== undefined ? (
          <pre className="git-diff-meta" key={row.key}>
            {row.meta}
          </pre>
        ) : paired ? (
          <div className="git-diff-pair" key={row.key}>
            {cell(row.before)}
            {cell(row.after)}
          </div>
        ) : (
          <div key={row.key}>
            {row.before?.kind === "removed" && cell(row.before)}
            {row.after && cell(row.after)}
          </div>
        ),
      )}
      {text.split("\n").length > 6000 && (
        <p className="muted">
          Показаны первые 6000 строк. Кнопка копирования сохраняет весь полученный diff.
        </p>
      )}
    </section>
  );
}
