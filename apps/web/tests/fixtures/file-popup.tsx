import { useState } from "react";
import { createRoot } from "react-dom/client";
import { configureApi } from "../../src/api";
import { DownloadLink } from "../../src/DownloadLink";
import { ResultFilePreview } from "../../src/ResultFilePreview";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

const session = await fetch("/api/auth/session").then((r) => r.json());
configureApi(session.csrf, () => {});
const query = new URLSearchParams(location.search);
function ResultFixture() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть файл
      </button>
      {open && (
        <ResultFilePreview
          result={{
            id: "full-result",
            turnId: null,
            title: query.get("name")!,
            type: "file",
            createdAt: "2026-10-01",
            payload: { url: query.get("file")!, mime: "text/plain" },
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 16, height: "100dvh", overflow: "auto" }}>
    <textarea aria-label="Draft" defaultValue="Preserve this draft" />
    <div style={{ height: 400 }} />
    {query.has("result") ? (
      <ResultFixture />
    ) : (
      <DownloadLink href={query.get("file")!} name={query.get("name")!}>
        Открыть файл
      </DownloadLink>
    )}
    <div style={{ height: 1500 }}>Same chat</div>
  </main>,
);
