import { lazy, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { configureApi } from "../../src/api";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";
import "../../src/theme-variants.css";

const FileEditor = lazy(() => import("../../src/FileEditor"));
const session = await fetch("/api/auth/session").then((r) => r.json());
configureApi(session.csrf, () => {});
// Test-only inspection uses the same bundled module, never creates another editor/model.
Object.assign(window, { inspectMonaco: () => import("monaco-editor") });
function Fixture() {
  const [path, setPath] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  return (
    <main>
      <textarea aria-label="Parent draft" defaultValue="Preserve parent" />
      {["sample.ts", "other.ts", "notes.md", "data.csv", "plain.txt", "data.json", "page.html"].map(
        (file) => (
          <button type="button" key={file} onClick={() => setPath(file)}>
            {file}
          </button>
        ),
      )}
      <output aria-label="Saved">{saved}</output>
      {path && (
        <Suspense fallback={<p>Loading</p>}>
          <FileEditor
            key={path}
            projectId="project"
            capability="fixture"
            projectName="Code workspace"
            path={path}
            onClose={() => setPath(null)}
            onSaved={() => setSaved((n) => n + 1)}
          />
        </Suspense>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
