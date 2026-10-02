import type { ProjectDirectory } from "@codex-web/shared";
import { useEffect, useState } from "react";
import { api, messageOf } from "./api";
import { FileBrowser } from "./FileBrowser";

/** Read-only project directory source for save destinations. Upload retains its existing grant/receipt flow. */
export function ProjectFolderBrowser({
  disabled = false,
  projectId,
  name,
  onFolder,
  onReady,
}: {
  disabled?: boolean;
  projectId: string;
  name: string;
  onFolder: (path: string) => void;
  onReady: (ready: boolean) => void;
}) {
  const [path, setPath] = useState(""),
    [directory, setDirectory] = useState<ProjectDirectory | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true);
    setError("");
    setDirectory(null);
    onReady(false);
    void api<ProjectDirectory>(
      `/projects/${encodeURIComponent(projectId)}/files?` +
        new URLSearchParams({ path, search: filter, offset: String(offset), sort: "name" }),
      { signal: abort.signal },
    )
      .then((value) => {
        if (abort.signal.aborted) return;
        setDirectory(value);
        onFolder(value.path);
        onReady(true);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [projectId, path, filter, offset, onFolder, onReady]);
  return (
    <>
      <FileBrowser
        path={path}
        rootLabel={name}
        entries={(directory?.entries ?? []).filter((e) => e.kind === "directory")}
        busy={busy || disabled}
        onNavigate={(next) => {
          if (next !== path || offset || filter) setBusy(true);
          setPath(next);
          setOffset(0);
          setSearch("");
          setFilter("");
        }}
        search={{
          value: search,
          onChange: setSearch,
          onSubmit: () => {
            setFilter(search);
            setOffset(0);
          },
        }}
        emptyLabel="Папки не найдены"
        footer={
          <>
            {error && <p role="alert">{error}</p>}
            {directory && (
              <div className="inspector-actions">
                {offset > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setOffset(Math.max(0, offset - 100))}
                  >
                    Назад
                  </button>
                )}
                {directory.nextOffset !== null && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setOffset(directory.nextOffset ?? 0)}
                  >
                    Ещё папки
                  </button>
                )}
              </div>
            )}
          </>
        }
      />
    </>
  );
}
