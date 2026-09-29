import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FileViewerDialog } from "../../src/FileViewerDialog";
import { ReadableFilePreview } from "../../src/ReadableFilePreview";
import { SpeechSettings } from "../../src/MessageSpeech";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

const files = [
  new File(
    [
      "# Кто должен был?\n\nКогда умер господин Арден, я сначала решила, что в доме сломалась какая-то часть порядка.\n\n" +
        Array.from({ length: 160 }, (_, i) => `Чтение${i} продолжается. `).join(""),
    ],
    "chapter.md",
  ),
  new File(
    ["# Другая глава\n\nНовый текст с [названием](https://example.test) и **выделением**."],
    "chapter.md",
  ),
  new File(
    [
      "<важно> Обычный текст.\n```\nЭта строка тоже читается.\n```\n" +
        Array.from({ length: 80 }, (_, i) => `Строка${i} обычного текста.`).join("\n"),
    ],
    "notes.txt",
  ),
  new File(["Нельзя читать\0двоичные данные"], "binary.txt"),
];
function Fixture() {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  return (
    <main>
      <input aria-label="Черновик" defaultValue="Сохранённый черновик" />
      <SpeechSettings />
      <button onClick={() => setOpen(true)}>Открыть файл</button>
      {open && (
        <FileViewerDialog
          name={files[index]!.name}
          file={files[index]!}
          editProvided
          onClose={() => setOpen(false)}
          navigation={
            <nav className="file-viewer-navigation">
              <button onClick={() => setIndex((index + 1) % files.length)}>Следующий файл</button>
            </nav>
          }
        >
          <ReadableFilePreview file={files[index]!} />
        </FileViewerDialog>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
