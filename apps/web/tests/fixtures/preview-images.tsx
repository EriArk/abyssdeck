import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PreviewViewer } from "../../src/PreviewViewer";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/materials.css";
function Fixture() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <textarea aria-label="Draft" defaultValue="Retained draft" />
      {open && (
        <PreviewViewer
          result={{
            id: "gallery",
            type: "preview",
            title: "TrainerOS gallery",
            createdAt: "2026-10-08",
            threadId: "thread",
            turnId: "turn",
            payload: { url: "/api/previews/" + "a".repeat(64) },
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
