import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FileBrowser } from "../../src/FileBrowser";
import { FileCopySave } from "../../src/FileCopySave";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/theme-variants.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";
import "../../src/device-chassis.css";
import "../../src/project-tools.css";
import "../../src/file-editor.css";

const file = new File(["Сохранить весь исходный текст"], "copy.md", { type: "text/markdown" });
function Browser({ root }: { root: string }) {
  const [path, setPath] = useState(root),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false);
  const join = (name: string) => path.replace(/\/$/, "") + "/" + name;
  const folders = path === root ? ["Документы", "Снимки"] : ["Вложенная папка"];
  return (
    <FileBrowser
      rootLabel="Проект с длинным названием"
      locations={[{ path: root, name: root || "Проект с длинным названием" }]}
      path={path}
      busy={busy}
      selected={selected}
      parent={path === root ? null : undefined}
      onNavigate={(next) => {
        setBusy(true);
        setTimeout(() => {
          setPath(next);
          setSelected("");
          setBusy(false);
        }, 30);
      }}
      entries={[
        ...folders.map((name) => ({ name, path: join(name), kind: "directory" as const })),
        ...Array.from({ length: 40 }, (_, i) => ({
          name: `Документ ${i + 1}.md`,
          path: join(`Документ ${i + 1}.md`),
          kind: "file" as const,
          size: 1024 + i,
          modifiedAt: 1790971200000,
        })),
      ]}
      onSelect={(e) => setSelected(e.path)}
      onClosePreview={() => setSelected("")}
      preview={selected ? <p>Содержимое выбранного файла</p> : undefined}
    />
  );
}
function Fixture() {
  const [root, setRoot] = useState("/"),
    [copy, setCopy] = useState(false);
  return (
    <main
      style={{ height: "100dvh", display: "flex", flexDirection: "column", padding: 12, gap: 8 }}
    >
      <textarea aria-label="Черновик" defaultValue="Черновик остаётся" />
      <div>
        <button type="button" onClick={() => setRoot("D:/Projects")}>
          Windows
        </button>
        <button type="button" onClick={() => setRoot("/")}>
          Linux
        </button>
        <button type="button" onClick={() => setCopy(true)}>
          Сохранить копию
        </button>
      </div>
      <Browser key={root} root={root} />
      {copy && (
        <FileCopySave file={file} onClose={() => setCopy(false)} onSaved={() => setCopy(false)} />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
