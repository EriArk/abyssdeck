import { strToU8, zipSync } from "fflate";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FileViewerDialog } from "../../src/FileViewerDialog";
import ReaderFilePreview from "../../src/ReaderFilePreview";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

const text =
  "# Большая книга\n\n" +
  Array.from(
    { length: 260 },
    (_, i) =>
      `Абзац${i}. ${"Здесь продолжается история, которую надо прочитать полностью. ".repeat(6)}\n\n`,
  ).join("") +
  "# Последняя глава\n\nКОНЕЦ ПОЛНОГО ФАЙЛА.";
const epub = zipSync(
  {
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    ),
    "OPS/book.opf": strToU8(
      '<package><manifest><item id="one" href="one.xhtml"/><item id="two" href="two.xhtml"/></manifest><spine><itemref idref="two"/><itemref idref="one"/></spine></package>',
    ),
    "OPS/one.xhtml": strToU8(
      "<html><body><h1>Финал EPUB</h1>" +
        "<p>Продолжение истории в далёкой главе.</p>".repeat(50) +
        "<p>Последний маяк: конец пути.</p></body></html>",
    ),
    "OPS/two.xhtml": strToU8(
      '<html><body><h1>Начало EPUB</h1><p>Первый <em>маяк</em>: начало пути.</p><script>window.importedScript=true</script><img src="https://evil.test/pixel"></body></html>',
    ),
  },
  { mtime: new Date("2026-01-01T00:00:00Z") },
);
const files = [
  new File([text], "book.md"),
  new File(
    [
      '<?xml version="1.0" encoding="utf-8"?><FictionBook><body><section><title><p>Книга FB2</p></title><p>Содержимое книги <emphasis>целиком</emphasis>.</p></section></body><body name="notes"><section><title><p>Примечания</p></title><p>Последнее примечание.</p></section></body></FictionBook>',
    ],
    "book.fb2",
  ),
  new File([epub], "book.epub"),
  new File(["# Совсем другой текст"], "book.md"),
];
function Fixture() {
  const [index, setIndex] = useState(0),
    [open, setOpen] = useState(false);
  return (
    <main>
      <input aria-label="Черновик" defaultValue="Мой черновик" />
      <button type="button" onClick={() => setOpen(true)}>
        Открыть файл
      </button>
      <select aria-label="Файл" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
        {files.map((file, i) => (
          <option key={`${file.name}:${file.size}`} value={i}>
            {i}:{file.name}
          </option>
        ))}
      </select>
      {open && (
        <FileViewerDialog
          name={files[index]!.name}
          file={files[index]!}
          editProvided
          onClose={() => setOpen(false)}
        >
          <ReaderFilePreview file={files[index]!} />
        </FileViewerDialog>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
