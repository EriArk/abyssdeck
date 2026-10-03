import {
  editableFile,
  type ProjectDiff,
  type ProjectDirectory,
  type ProjectGit,
} from "@codex-web/shared";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
import { CopyButton } from "./CopyButton";
import { DownloadLink } from "./DownloadLink";
import { FileActionKey } from "./FileActionKey";
import { FileBatchActions, type FileTransfer } from "./FileBatchActions";
import { FileBrowser } from "./FileBrowser";
import { FileLaunch } from "./FileLaunch";
import { FileManagerActions } from "./FileManagerActions";
import { GitHubFilesButton } from "./GitHubFiles";
import { GuiPreviewButton } from "./GuiPreviewHost";
import { Icon } from "./icons";
import { DeliveryButton } from "./ProjectDeliveryHost";
import { ProjectFilePreview } from "./ProjectFilePreview";
import { ProjectFileUpload } from "./ProjectFileUpload";
import { ProjectRepositoryView } from "./ProjectRepositoryView";
import { useWorkspaceDialog } from "./useWorkspaceDialog";
import { useWindowDismiss } from "./windowMotion";
import "./project-files.css";
import "./workspace-window.css";
import "./project-tools.css";

const FileEditor = lazy(() => import("./FileEditor"));

export function ProjectFiles({
  projectId,
  projectName,
  threadId,
  visible,
  mode,
  focus,
  onBack,
  onOpenFiles,
}: {
  projectId: string;
  projectName: string;
  threadId?: string;
  visible: boolean;
  mode: "files" | "git";
  focus: { path: string; version: number; projectId: string };
  onBack: () => void;
  onOpenFiles: (path: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(dialog, visible, `project-${mode}`);
  const dismiss = useWindowDismiss(dialog);
  const [section, setSection] = useState<"overview" | "changes" | "releases">("overview");
  const [transfer, setTransfer] = useState<FileTransfer>();
  const transferId = useRef(0);
  const [editorPath, setEditorPath] = useState(""),
    [fileAction, setFileAction] = useState("");
  const [capability, setCapability] = useState(""),
    [checkout, setCheckout] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [selecting, setSelecting] = useState(false),
    [selection, setSelection] = useState<string[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Selection belongs to this project and write grant.
  useEffect(() => {
    setSelecting(false);
    setSelection([]);
    setTransfer(undefined);
  }, [projectId, capability]);
  const grant = useRef("");
  const scopeRevision = useRef(0);
  const scopeActive = useRef(visible);
  scopeActive.current = visible;
  useEffect(() => {
    scopeRevision.current++;
    scopeActive.current = visible;
    if (!visible) {
      setCapability("");
      setEditorPath("");
      setFileAction("");
    }
    return () => {
      scopeActive.current = false;
      const token = grant.current;
      grant.current = "";
      if (token)
        void api(`/projects/${encodeURIComponent(projectId)}/file-tools/access`, {
          method: "POST",
          body: { unlock: false, capability: token },
        }).catch(() => {});
    };
  }, [visible, projectId]);
  const [path, setPath] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"name" | "modified" | "size">("name"),
    [reveal, setReveal] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const saved = (event: Event) => {
      const source = (event as CustomEvent).detail?.source;
      if (
        typeof source === "string" &&
        source.startsWith(`/api/projects/${projectId}/files/content?`)
      )
        setRevision((value) => value + 1);
    };
    window.addEventListener("workspace-file-saved", saved);
    return () => window.removeEventListener("workspace-file-saved", saved);
  }, [projectId]);
  const [directory, setDirectory] = useState<ProjectDirectory | null>(null),
    [git, setGit] = useState<ProjectGit | null>(null),
    [selected, setSelected] = useState("");
  const [staged, setStaged] = useState(false),
    [diff, setDiff] = useState<ProjectDiff | null>(null),
    [saved, setSaved] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fileError, setFileError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const readScope = useRef(""),
    detailScope = useRef("");
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const open = (next: string) => {
    if (next !== path || offset || filter || reveal) setBusy(true);
    setPath(next);
    setOffset(0);
    setSelected("");
    setFilter("");
    setSearch("");
    setReveal("");
  };
  useEffect(() => {
    if (mode !== "files" || !focus.version || focus.projectId !== projectId) return;
    const parent = focus.path.split("/").slice(0, -1).join("/");
    setPath(parent);
    setOffset(0);
    setFilter("");
    setSearch("");
    setReveal(focus.path.split("/").at(-1) ?? "");
    setSelected(focus.path.endsWith("/") ? "" : focus.path);
  }, [focus, projectId, mode]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit refresh repeats this scoped read.
  useEffect(() => {
    if (!visible || !projectId) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    const query = new URLSearchParams({
      path,
      offset: String(offset),
      search: filter,
      sort,
      ...(reveal ? { reveal } : {}),
    });
    const scope = `${base}/${mode}?${query}`;
    if (scope !== readScope.current) {
      if (mode === "files") setDirectory(null);
      else setGit(null);
      readScope.current = scope;
    }
    void api<ProjectDirectory | ProjectGit>(
      mode === "files" ? `${base}/files?${query}` : `${base}/git`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        if (mode === "files") setDirectory(data as ProjectDirectory);
        else setGit(data as ProjectGit);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [base, path, mode, offset, filter, sort, reveal, visible, revision, projectId]);
  useEffect(() => {
    if (!visible || !reveal || !directory) return;
    const row = Array.from(
      scroller.current?.querySelectorAll<HTMLElement>("[data-file-path]") ?? [],
    ).find((el) => el.dataset.filePath === focus.path);
    row?.scrollIntoView({ block: "nearest" });
  }, [directory, visible, reveal, focus.path]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit refresh repeats this scoped read.
  useEffect(() => {
    const scope = `${base}/${mode}/${selected}?staged=${staged}`;
    if (detailScope.current !== scope) {
      detailScope.current = scope;
      setDiff(null);
      setSaved(null);
    }
    setFileError("");
    if (!selected || !visible) return;
    const controller = new AbortController();
    void api<{ url: string; name: string } | null>(
      `${base}/files/saved?path=${encodeURIComponent(selected)}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setSaved(value);
      })
      .catch(() => {});
    if (mode === "git")
      void api<ProjectDiff>(
        `${base}/git/diff?path=${encodeURIComponent(selected)}&staged=${staged ? 1 : 0}`,
        { signal: controller.signal },
      )
        .then((value) => {
          if (!controller.signal.aborted) setDiff(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setFileError(messageOf(e));
        });
    return () => controller.abort();
  }, [base, selected, staged, mode, visible, revision]);
  const select = (value: string) => {
    setSelected((old) => (old === value ? "" : value));
    setFileError("");
  };
  const accessRequest = useRef(false);
  const setFileAccess = async (unlock: boolean) => {
    if (unlock && grant.current) return grant.current;
    if (accessRequest.current) throw Error("Дождись завершения разблокировки файлов.");
    const revision = scopeRevision.current;
    accessRequest.current = true;
    setUnlocking(true);
    try {
      const value = await api<{ capability: string; checkout?: string }>(
        `${base}/file-tools/access`,
        {
          method: "POST",
          body: { unlock, ...(!unlock && grant.current ? { capability: grant.current } : {}) },
        },
      );
      if (!scopeActive.current || scopeRevision.current !== revision) {
        if (value.capability)
          void api(`${base}/file-tools/access`, {
            method: "POST",
            body: { unlock: false, capability: value.capability },
          }).catch(() => {});
        return "";
      }
      grant.current = value.capability;
      setCapability(value.capability);
      setCheckout(value.checkout ?? "");
      return value.capability;
    } finally {
      accessRequest.current = false;
      setUnlocking(false);
    }
  };
  const editFile = async (file: string, signal?: AbortSignal) => {
    const token = await setFileAccess(true);
    if (token && !signal?.aborted && scopeActive.current) setEditorPath(file);
  };
  const download = (file: string) => (
    <DownloadLink
      className={mode === "files" ? "icon-button" : "secondary"}
      title="Открыть файл"
      href={`/api${base}/files/content?path=${encodeURIComponent(file)}${mode === "git" && staged ? "&version=index" : ""}`}
      name={file.split("/").at(-1)}
      sourceRevision={revision}
      editLabel={capability ? "Редактировать" : "Разблокировать и редактировать"}
    >
      <Icon name="file" />
      <span className={mode === "files" ? "file-action-label" : undefined}>Открыть файл</span>
    </DownloadLink>
  );
  const selectedPanel = () => (
    <section className="inspector-selected" aria-label="Выбранный файл">
      <div className="inspector-actions">
        {download(selected)}
        {!(mode === "git" && staged) && (
          <FileLaunch
            key={selected}
            name={selected}
            source={`/api${base}/files/content?path=${encodeURIComponent(selected)}`}
          />
        )}
        {editableFile(selected) && (
          <button
            type="button"
            className={mode === "files" ? "icon-button" : "secondary"}
            title={capability ? "Редактировать" : "Разблокировать и редактировать"}
            disabled={unlocking}
            onClick={() => {
              setFileError("");
              void editFile(selected).catch((e) => {
                if (scopeActive.current) setFileError(messageOf(e));
              });
            }}
          >
            <Icon name="edit" size={16} />
            <span className={mode === "files" ? "file-action-label" : undefined}>
              {!capability
                ? "Разблокировать и редактировать"
                : mode === "git" && staged
                  ? "Редактировать рабочий файл"
                  : "Редактировать"}
            </span>
          </button>
        )}
        {mode === "git" && <CopyButton text={selected} label="Копировать путь" />}
        {mode === "git" && (
          <button
            type="button"
            className="icon-button inspector-file-close"
            aria-label="Закрыть файл"
            onClick={() => setSelected("")}
          >
            <Icon name="close" />
          </button>
        )}
        {saved && (
          <DownloadLink href={saved.url} name={saved.name}>
            Сохранённый результат
          </DownloadLink>
        )}
      </div>
      {fileError && (
        <p className="notice" role="alert">
          {fileError}
        </p>
      )}
      {mode === "git" && (
        <>
          <div className="inspector-tabs">
            <button
              type="button"
              aria-pressed={!staged}
              className={!staged ? "active" : ""}
              onClick={() => setStaged(false)}
            >
              Рабочая копия
            </button>
            <button
              type="button"
              aria-pressed={staged}
              className={staged ? "active" : ""}
              onClick={() => setStaged(true)}
            >
              Индекс
            </button>
          </div>
          {diff ? (
            <>
              <CopyButton text={diff.text} label="Копировать diff" />
              <pre className="inspector-diff">
                {diff.text || "Нет текстового diff. Новый файл можно открыть выше."}
              </pre>
              {diff.truncated && <small>Показано начало diff — 256 КБ</small>}
            </>
          ) : (
            !fileError && (
              <p role="status">
                <span className="spinner" /> Читаю diff…
              </p>
            )
          )}
        </>
      )}
    </section>
  );
  const changeList = (
    <ul className="inspector-list inspector-changes">
      {git?.changes.map((change) => (
        <li
          key={change.path}
          data-file-path={change.path}
          className={selected === change.path ? "selected" : ""}
        >
          <div className="inspector-row">
            <button
              type="button"
              className="inspector-entry"
              aria-expanded={selected === change.path}
              onClick={() => {
                if (change.path.endsWith("/")) {
                  onOpenFiles(change.path);
                  return;
                }
                select(change.path);
                setStaged(change.index !== " " && change.index !== "?");
              }}
            >
              <code className="git-status" title="Индекс / рабочая копия">
                {change.index}
                {change.working}
              </code>
              <span>
                {change.path}
                {change.previousPath && <small>← {change.previousPath}</small>}
              </span>
              <Icon name="chevron" size={16} />
            </button>
          </div>
          {selected === change.path && selectedPanel()}
        </li>
      ))}
    </ul>
  );
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="project-files notebook-dialog workspace-window project-tool-window"
      data-tool={mode}
      data-window-source={projectId}
      data-selecting={selecting && mode === "files"}
      aria-label={mode === "files" ? "Файлы проекта" : "Git проекта"}
      onCancel={(e) => {
        e.preventDefault();
        dismiss(onBack);
      }}
    >
      <header className="inspector-heading notebook-heading">
        <Icon name={mode === "files" ? "folder" : "branch"} />
        <div>
          <strong>{mode === "files" ? "Файлы" : "Git"}</strong>
          <small>{projectName}</small>
        </div>
        {mode === "files" && (
          <>
            <FileActionKey
              icon={capability ? "unlock" : "lock"}
              disabled={unlocking || !!editorPath}
              aria-pressed={!!capability}
              label={
                unlocking
                  ? "Проверяю доступ…"
                  : capability
                    ? "Заблокировать файлы"
                    : "Разблокировать файлы"
              }
              onClick={() => {
                setError("");
                void setFileAccess(!capability).catch((e) => {
                  if (scopeActive.current) setError(messageOf(e));
                });
              }}
            />
            {visible && (
              <GuiPreviewButton
                compact
                projectId={projectId}
                projectName={projectName}
                threadId={threadId}
              />
            )}
          </>
        )}
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          aria-label={mode === "files" ? "Обновить файлы" : "Обновить Git"}
          onClick={() => setRevision((value) => value + 1)}
        >
          <Icon name="refresh" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={mode === "files" ? "Закрыть файлы" : "Закрыть Git"}
          onClick={() => dismiss(onBack)}
        >
          <Icon name="close" />
        </button>
      </header>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {mode === "git" && (
        <div className="project-tool-actions" data-unlocked={!!capability}>
          {mode === "git" && visible && (
            <GitHubFilesButton projectId={projectId} projectName={projectName} />
          )}
          <button
            type="button"
            className="secondary"
            disabled={unlocking || !!editorPath}
            aria-pressed={!!capability}
            onClick={() => {
              setError("");
              void setFileAccess(!capability).catch((e) => {
                if (scopeActive.current) setError(messageOf(e));
              });
            }}
          >
            <Icon name="lock" size={16} />
            {unlocking
              ? "Проверяю доступ…"
              : capability
                ? "Заблокировать файлы"
                : "Разблокировать файлы"}
          </button>
          {visible && (
            <GuiPreviewButton projectId={projectId} projectName={projectName} threadId={threadId} />
          )}
          {mode === "git" && visible && (
            <DeliveryButton projectId={projectId} projectName={projectName} />
          )}
        </div>
      )}
      {mode === "files" ? (
        <FileBrowser
          key={projectId}
          path={path}
          rootLabel={projectName}
          busy={busy}
          entries={directory?.entries ?? []}
          selected={selected}
          onNavigate={open}
          onSelect={(entry) => select(entry.path)}
          onEntryMenu={capability && !selecting ? (entry) => setFileAction(entry.path) : undefined}
          scrollerRef={scroller}
          search={{
            value: search,
            onChange: setSearch,
            onSubmit: () => {
              setFilter(search);
              setOffset(0);
              setReveal("");
              setSelected("");
            },
          }}
          sort={{
            value: sort,
            onChange: (value) => {
              setSort(value);
              setOffset(0);
            },
          }}
          selection={capability && selecting ? selection : undefined}
          onCheck={(file, checked) =>
            setSelection((values) =>
              checked
                ? [...new Set([...values, file])].slice(0, 100)
                : values.filter((v) => v !== file),
            )
          }
          actions={
            !selecting
              ? (entry) => (
                  <>
                    <CopyButton text={entry.path} label={`Копировать путь ${entry.name}`} />
                    {capability && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Действия: ${entry.name}`}
                        onClick={() => setFileAction(entry.path)}
                      >
                        <Icon name="more" />
                      </button>
                    )}
                  </>
                )
              : undefined
          }
          tools={
            capability ? (
              <>
                {mode === "files" && visible && capability && (
                  <ProjectFileUpload
                    compact
                    key={`${projectId}:${checkout}`}
                    projectId={projectId}
                    projectName={projectName}
                    capability={capability}
                    checkout={checkout}
                    folder={path}
                    onDone={() => {
                      if (scopeActive.current) setRevision((n) => n + 1);
                    }}
                  />
                )}
                {mode === "files" && visible && capability && (
                  <FileManagerActions
                    key={projectId}
                    projectId={projectId}
                    capability={capability}
                    checkout={checkout}
                    folder={path}
                    request={fileAction}
                    onConsume={() => setFileAction("")}
                    onTransfer={(op, path) => setTransfer({ id: ++transferId.current, op, path })}
                    onDone={(file, edit) => {
                      if (!scopeActive.current) return;
                      setRevision((n) => n + 1);
                      setSelected(file ?? "");
                      if (file) setReveal(file.split("/").at(-1)!);
                      if (file && edit) setEditorPath(file);
                    }}
                  />
                )}

                {visible && capability && (
                  <FileBatchActions
                    key={`${projectId}:${checkout}`}
                    projectId={projectId}
                    projectName={projectName}
                    capability={capability}
                    checkout={checkout}
                    folder={path}
                    transfer={transfer}
                    selection={selection}
                    selecting={selecting}
                    visiblePaths={directory?.entries.map((entry) => entry.path) ?? []}
                    onSelection={setSelection}
                    onSelecting={setSelecting}
                    onDone={(operation) => {
                      if (!scopeActive.current) return;
                      setRevision((n) => n + 1);
                      setSelection((values) =>
                        values.filter(
                          (value) =>
                            value !== operation.path && !value.startsWith(operation.path + "/"),
                        ),
                      );
                      if (operation.op !== "copy") {
                        if (path === operation.path || path.startsWith(operation.path + "/"))
                          open(operation.path.split("/").slice(0, -1).join("/"));
                        if (
                          selected === operation.path ||
                          selected.startsWith(operation.path + "/")
                        )
                          setSelected("");
                      }
                    }}
                  />
                )}
              </>
            ) : undefined
          }
          preview={
            selected ? (
              <>
                {selectedPanel()}
                <ProjectFilePreview
                  key={`${selected}:${revision}`}
                  projectId={projectId}
                  path={selected}
                  size={directory?.entries.find((e) => e.path === selected)?.size}
                  visible={visible}
                />
              </>
            ) : undefined
          }
          onClosePreview={() => setSelected("")}
          footer={
            directory && (
              <>
                <div className="inspector-actions">
                  {(directory.offset ?? offset) > 0 && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setOffset(Math.max(0, (directory.offset ?? offset) - 100));
                        setReveal("");
                        setSelected("");
                      }}
                    >
                      Назад
                    </button>
                  )}
                  {directory.nextOffset !== null && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setOffset(directory.nextOffset ?? 0);
                        setReveal("");
                        setSelected("");
                      }}
                    >
                      Ещё файлы
                    </button>
                  )}
                </div>
                <small>
                  {directory.total} записей
                  {directory.truncated
                    ? " · Показаны первые 5000. Открой нужную папку по пути."
                    : ""}
                </small>
              </>
            )
          }
        />
      ) : (
        <div className="inspector-workspace">
          <div className="inspector-scroll" ref={scroller}>
            {busy && (
              <p role="status">
                <span className="spinner" /> Загружаю…
              </p>
            )}
            <ProjectRepositoryView
              visible={visible}
              projectId={projectId}
              projectName={projectName}
              git={git}
              revision={revision}
              section={section}
              onSection={setSection}
              changes={changeList}
            />
          </div>
        </div>
      )}
      {editorPath && visible && capability && (
        <Suspense fallback={<p role="status">Открываю редактор…</p>}>
          <FileEditor
            key={`${projectId}:${editorPath}`}
            projectId={projectId}
            capability={capability}
            projectName={projectName}
            path={editorPath}
            onClose={() => setEditorPath("")}
            onSaved={() => setRevision((n) => n + 1)}
          />
        </Suspense>
      )}
    </dialog>
  );
}
