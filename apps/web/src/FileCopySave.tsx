import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, messageOf } from "./api";
import { DownloadLink } from "./DownloadLink";
import { Icon } from "./icons";
import { ProjectFileUpload, type UploadCopy } from "./ProjectFileUpload";
import { ProjectFolderBrowser } from "./ProjectFolderBrowser";
import { useWorkspaceDialog } from "./useWorkspaceDialog";

/** Destination choice delegates all writes/collisions/receipts to ordinary uploads. */
export function FileCopySave({
  file,
  copies,
  copiesKey,
  onClose,
  onSaved,
}: {
  file: File;
  copies?: UploadCopy[];
  copiesKey?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(dialog);
  const [projects, setProjects] = useState<{ id: string; name: string; unassigned?: boolean }[]>(
      [],
    ),
    [project, setProject] = useState(""),
    [folder, setFolder] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [grant, setGrant] = useState<{ capability: string; checkout: string } | null>(null);
  const live = useRef(true),
    binding = useRef<{ project: string; capability: string } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A different immutable file releases its previous destination grant.
  useEffect(() => {
    live.current = true;
    const abort = new AbortController();
    void api<{ projects: typeof projects }>("/projects", { signal: abort.signal })
      .then((v) => {
        if (!abort.signal.aborted) setProjects(v.projects.filter((p) => !p.unassigned));
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(messageOf(e));
      });
    return () => {
      live.current = false;
      abort.abort();
      const b = binding.current;
      if (b)
        void api(`/projects/${encodeURIComponent(b.project)}/file-tools/access`, {
          method: "POST",
          body: { unlock: false, capability: b.capability },
        }).catch(() => {});
    };
  }, [file]);
  const [folderReady, setFolderReady] = useState(false);
  const prepare = async () => {
    if (busy || !project || !folderReady) return;
    setBusy(true);
    setError("");
    try {
      const v = await api<{ capability: string; checkout: string }>(
        `/projects/${encodeURIComponent(project)}/file-tools/access`,
        {
          method: "POST",
          body: { unlock: true },
        },
      );
      if (!live.current) {
        void api(`/projects/${encodeURIComponent(project)}/file-tools/access`, {
          method: "POST",
          body: { unlock: false, capability: v.capability },
        }).catch(() => {});
        return;
      }
      binding.current = { project, capability: v.capability };
      setGrant(v);
    } catch (e) {
      if (live.current) setError(messageOf(e));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="workspace-window file-copy-save"
      aria-label="Сохранить копию"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <header className="panel-heading">
        <strong>Сохранить копию</strong>
        <button
          className="icon-button"
          type="button"
          aria-label="Закрыть сохранение копии"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="file-copy-fields">
        {copies && (
          <p>
            Выбрано файлов: {copies.length}. В проекте сохраняется структура папок архива.
            Скачивание — один ZIP с выбранными файлами.
          </p>
        )}
        <label>
          Проект
          <select
            aria-label="Проект для копии"
            value={project}
            disabled={!!grant || busy}
            onChange={(e) => {
              setProject(e.target.value);
              setFolder("");
              setFolderReady(false);
            }}
          >
            <option value="">Выбери проект</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {project && !grant && (
          <ProjectFolderBrowser
            key={project}
            projectId={project}
            name={projects.find((p) => p.id === project)?.name ?? "Проект"}
            disabled={busy}
            onFolder={setFolder}
            onReady={setFolderReady}
          />
        )}
        {project && (
          <p className="file-copy-destination">Папка для копии: {folder || "Корень проекта"}</p>
        )}
        {error && <p role="alert">{error}</p>}
        {grant && (
          <ProjectFileUpload
            projectId={project}
            projectName={projects.find((p) => p.id === project)?.name ?? project}
            {...grant}
            folder={folder}
            initialFile={copies ? undefined : file}
            initialCopies={copies}
            initialBatchKey={copiesKey}
            onBatchDone={onSaved}
            onDone={onSaved}
            onDismiss={onClose}
          />
        )}
      </div>
      <footer className="file-copy-actions">
        <DownloadLink preparedFile={file} directDownload>
          Скачать копию
        </DownloadLink>
        <button
          className="primary"
          type="button"
          disabled={!project || !folderReady || busy || !!grant}
          onClick={() => void prepare()}
        >
          {busy ? "Открываю…" : "Сохранить в проект"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
