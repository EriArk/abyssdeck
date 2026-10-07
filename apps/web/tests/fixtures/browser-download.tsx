import { createRoot } from "react-dom/client";
import { BrowserDownloadPage } from "../../src/BrowserDownloadPage";
import { DownloadLink } from "../../src/DownloadLink";
import "../../src/styles.css";

const root = document.getElementById("root");
if (!root) throw Error("Missing fixture root");
createRoot(root).render(
  location.pathname === "/download" ? (
    <BrowserDownloadPage />
  ) : (
    <>
      <textarea aria-label="Draft" defaultValue="Keep this draft" />
      <DownloadLink
        href="/api/artifacts/12345678-1234-1234-1234-123456789abc"
        name="archive.zip"
        directDownload
      >
        Save archive
      </DownloadLink>
    </>
  ),
);
