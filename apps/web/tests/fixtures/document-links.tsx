import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FileViewerDialog } from "../../src/FileViewerDialog";
import ReaderFilePreview from "../../src/ReaderFilePreview";
import "../../src/styles.css";

const file = new File(
  [
    "# Gallery\n\n[Wide Home](wide.png)\n\n![Inline][shot]\n\n[shot]: narrow.png\n\n[Notes](notes.md)\n\n[External](https://example.org/guide)",
  ],
  "README.md",
  { type: "text/markdown" },
);
function Fixture() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("/api/artifacts/11111111-1111-4111-8111-111111111111");
  return (
    <>
      <textarea aria-label="Draft" defaultValue="Keep my draft" />
      <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
        <option value="/api/artifacts/11111111-1111-4111-8111-111111111111">Saved</option>
        <option value="/api/projects/p/files/content?path=docs%2FREADME.md">Working</option>
      </select>
      <button type="button" onClick={() => setOpen(true)}>
        Screenshots
      </button>
      {open && (
        <FileViewerDialog
          name={file.name}
          file={file}
          source={source}
          onClose={() => setOpen(false)}
        >
          <ReaderFilePreview file={file} source={source} />
        </FileViewerDialog>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
