import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserDownloadPage } from "../../src/BrowserDownloadPage";
import { DownloadLink } from "../../src/DownloadLink";
import { ResultFilePreview } from "../../src/ResultFilePreview";
import "../../src/styles.css";

const root = document.getElementById("root");
if (!root) throw Error("Missing fixture root");
const localFile = new File(["# Exact local draft\n"], "draft.md", { type: "text/markdown" });
function Fixture() {
  const [preview, setPreview] = useState(false);
  return location.pathname === "/download" ? (
    <BrowserDownloadPage />
  ) : (
    <>
      <textarea aria-label="Draft" defaultValue="Keep this draft" />
      <button type="button" onClick={() => setPreview(true)}>
        Open preview
      </button>
      {preview && (
        <ResultFilePreview
          onClose={() => setPreview(false)}
          result={{
            id: "archive",
            type: "file",
            title: "archive.zip",
            turnId: null,
            createdAt: "2026-10-07",
            payload: {
              url: "/api/artifacts/12345678-1234-1234-1234-123456789abc",
              bytes: 38 * 1024 * 1024,
              mime: "application/zip",
            },
          }}
        />
      )}
      <DownloadLink preparedFile={localFile} directDownload>
        Save local draft
      </DownloadLink>
      <DownloadLink
        href="/api/artifacts/12345678-1234-1234-1234-123456789abc"
        name="archive.zip"
        directDownload
      >
        Save archive
      </DownloadLink>
    </>
  );
}
createRoot(root).render(<Fixture />);
