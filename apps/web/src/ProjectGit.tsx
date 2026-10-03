import type {
  DeliveryOperation,
  ProjectGit as GitState,
  ProjectDiff,
  ProjectRepository,
} from "@codex-web/shared";
import { useEffect, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { accountLocalStorage as localStorage } from "./accountStorage.ts";
import { api, messageOf } from "./api";
import { CopyButton } from "./CopyButton";
import { FileActionKey } from "./FileActionKey";
import { GitDiff } from "./GitDiff";
import { GitHubFilesButton } from "./GitHubFiles";
import { Icon } from "./icons";
import { PanelDivider } from "./PanelDivider";
import { openProjectDelivery } from "./ProjectDeliveryHost";
import { ProjectRepositoryView } from "./ProjectRepositoryView";
import { useWorkspaceDialog } from "./useWorkspaceDialog";
import { useWindowDismiss } from "./windowMotion";
import "./project-git.css";

type Section = "changes" | "history" | "branches" | "releases" | "info";
type Draft = { message: string; paths: string[]; updatedAt?: number; completedOperation?: string };
function load(key: string): Draft {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      typeof v?.message === "string" &&
      Array.isArray(v.paths) &&
      v.paths.every((p: unknown) => typeof p === "string")
    )
      return v;
  } catch {}
  return { message: "", paths: [] };
}
export function ProjectGit({
  projectId,
  projectName,
  onBack,
  onOpenFiles,
}: {
  projectId: string;
  projectName: string;
  onBack: () => void;
  onOpenFiles: (path: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(dialog, true, "project-git");
  const dismiss = useWindowDismiss(dialog);
  const [section, setSection] = useState<Section>("changes"),
    [revision, setRevision] = useState(0);
  const [git, setGit] = useState<GitState | null>(null),
    [repository, setRepository] = useState<ProjectRepository | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [repositoryError, setRepositoryError] = useState("");
  const [selected, setSelected] = useState(""),
    [commit, setCommit] = useState(""),
    [branch, setBranch] = useState("");
  const [phoneDetail, setPhoneDetail] = useState(false),
    [staged, setStaged] = useState(false),
    [paired, setPaired] = useState(false);
  const [diff, setDiff] = useState<ProjectDiff | null>(null),
    [diffError, setDiffError] = useState("");
  const draftKey = `git-workspace-draft:${projectId}`;
  const [draft, setDraft] = useState(() => load(draftKey));
  const base = `/projects/${encodeURIComponent(projectId)}`;
  const persist = (next: Draft) => {
    next = { ...next, updatedAt: Date.now() };
    setDraft(next);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {}
  };
  useEffect(() => {
    const complete = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId: string; operation: DeliveryOperation }>).detail;
      if (detail.projectId !== projectId) return;
      setRevision((v) => v + 1);
      const op = detail.operation;
      if (op.kind === "commit" && op.state === "completed")
        setDraft((old) => {
          if (old.completedOperation === op.id) return old;
          const stale = (old.updatedAt ?? 0) > op.updatedAt;
          const next = {
            ...old,
            completedOperation: op.id,
            message: !stale && old.message === op.input.message ? "" : old.message,
            paths: stale ? old.paths : old.paths.filter((p) => !op.input.paths.includes(p)),
          };
          try {
            localStorage.setItem(draftKey, JSON.stringify(next));
          } catch {}
          return next;
        });
    };
    window.addEventListener("project-delivery-completed", complete);
    return () => window.removeEventListener("project-delivery-completed", complete);
  }, [projectId, draftKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit refresh re-reads the exact project.
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setRepositoryError("");
    void api<GitState>(`${base}/git`, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setGit(value);
        setSelected((old) =>
          value.changes.some((c) => c.path === old) ? old : (value.changes[0]?.path ?? ""),
        );
        setCommit((old) =>
          value.commits.some((c) => c.id === old) ? old : (value.commits[0]?.id ?? ""),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    void api<ProjectRepository>(`${base}/git/repository`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setRepository(value);
          setBranch((old) =>
            value.branches.some((b) => b.name === old)
              ? old
              : (value.branches.find((b) => b.current)?.name ?? value.branches[0]?.name ?? ""),
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setRepositoryError(messageOf(e));
      });
    return () => controller.abort();
  }, [base, revision]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh invalidates the selected diff.
  useEffect(() => {
    const controller = new AbortController();
    setDiff(null);
    setDiffError("");
    if (section === "changes" && selected && !selected.endsWith("/"))
      void api<ProjectDiff>(
        `${base}/git/diff?path=${encodeURIComponent(selected)}&staged=${staged ? 1 : 0}`,
        { signal: controller.signal },
      )
        .then((value) => {
          if (!controller.signal.aborted) setDiff(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setDiffError(messageOf(e));
        });
    return () => controller.abort();
  }, [base, selected, staged, section, revision]);
  const change = git?.changes.find((c) => c.path === selected),
    currentCommit = git?.commits.find((c) => c.id === commit);
  const currentBranch = repository?.branches.find((b) => b.name === branch);
  const paths = draft.paths.filter((path) => git?.changes.some((c) => c.path === path));
  const openSection = (value: Section) => {
    setSection(value);
    setPhoneDetail(false);
  };
  const launch = (kind: "commit" | "push") =>
    openProjectDelivery({
      projectId,
      projectName,
      launch: { id: crypto.randomUUID(), kind, paths, message: draft.message },
    });
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="project-files notebook-dialog workspace-window project-tool-window project-git-window"
      data-tool="git"
      data-window-source={projectId}
      aria-label="Git проекта"
      onCancel={(e) => {
        e.preventDefault();
        dismiss(onBack);
      }}
    >
      <header className="inspector-heading notebook-heading">
        <Icon name="branch" />
        <div>
          <strong>Git</strong>
          <small title={projectName}>{projectName}</small>
        </div>
        <FileActionKey label="Файлы репозитория" icon="folder" onClick={() => onOpenFiles("")} />
        <FileActionKey
          label="О репозитории"
          icon="help"
          aria-pressed={section === "info"}
          onClick={() => openSection("info")}
        />
        <FileActionKey
          label="Обновить Git"
          icon="refresh"
          disabled={busy}
          onClick={() => setRevision((v) => v + 1)}
        />
        <FileActionKey label="Закрыть Git" icon="close" onClick={() => dismiss(onBack)} />
      </header>
      <div className="git-source-bar">
        <button type="button" className="secondary" onClick={() => openSection("branches")}>
          <Icon name="branch" size={17} />
          <span>{git?.detached ? "Отдельный коммит" : (git?.branch ?? "Git")}</span>
          <Icon name="chevron" size={14} />
        </button>
        <small>
          {git?.upstream
            ? `${git.upstream} · ↑ ${git.ahead ?? 0} · ↓ ${git.behind ?? 0}`
            : git?.repository
              ? "Upstream не задан"
              : ""}
        </small>
        <FileActionKey
          label="Отправить коммиты"
          icon="upload"
          disabled={!git?.repository || !git.branch || busy}
          onClick={() => launch("push")}
        />
        <FileActionKey
          label="Доставка"
          icon="branch"
          onClick={() => openProjectDelivery({ projectId, projectName })}
        />
      </div>
      <nav className="git-section-tabs" aria-label="Информация Git">
        {(
          [
            ["changes", "Изменения"],
            ["history", "История"],
            ["branches", "Ветки"],
            ["releases", "Релизы"],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={section === id}
            onClick={() => openSection(id)}
          >
            {label}
            {id === "changes" && !!git?.changes.length && <small>{git.changes.length}</small>}
          </button>
        ))}
      </nav>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {!git && busy && (
        <p role="status">
          <span className="spinner" /> Читаю Git…
        </p>
      )}
      {git && !git.repository && (
        <p className="inspector-empty">В этой папке нет Git-репозитория.</p>
      )}
      {git?.repository &&
        (["changes", "history", "branches"].includes(section) ? (
          <div className="git-workspace" data-detail={phoneDetail}>
            <aside className="git-side">
              <header className="git-list-heading">
                {section === "changes"
                  ? "Рабочая копия"
                  : section === "history"
                    ? "Последние коммиты"
                    : "Ветки"}
              </header>
              <div className="git-entries">
                {section === "changes" &&
                  git.changes.map((c) => (
                    <div key={c.path} className="git-entry" data-selected={c.path === selected}>
                      <label className="git-check">
                        <input
                          type="checkbox"
                          aria-label={`Включить ${c.path} в коммит`}
                          checked={paths.includes(c.path)}
                          disabled={c.path.endsWith("/")}
                          onChange={(e) =>
                            persist({
                              ...draft,
                              paths: e.target.checked
                                ? [...new Set([...draft.paths, c.path])]
                                : draft.paths.filter((p) => p !== c.path),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        aria-pressed={c.path === selected}
                        title={c.path}
                        onClick={() => {
                          setSelected(c.path);
                          setStaged(c.working === " " && c.index !== " " && c.index !== "?");
                          setPhoneDetail(true);
                        }}
                      >
                        <span>
                          <strong>{c.path.split("/").filter(Boolean).at(-1)}</strong>
                          <small>{c.path.split("/").slice(0, -1).join("/") || "Корень"}</small>
                        </span>
                        <code title="Индекс / рабочая копия">
                          {c.index}
                          {c.working}
                        </code>
                      </button>
                    </div>
                  ))}
                {section === "changes" && !git.changes.length && (
                  <p className="inspector-empty">Нет изменений файлов.</p>
                )}
                {section === "history" &&
                  git.commits.map((c) => (
                    <div className="git-entry" data-selected={c.id === commit} key={c.id}>
                      <button
                        type="button"
                        aria-pressed={c.id === commit}
                        title={c.subject}
                        onClick={() => {
                          setCommit(c.id);
                          setPhoneDetail(true);
                        }}
                      >
                        <span>
                          <strong>{c.subject}</strong>
                          <small>
                            {c.id} · {new Date(c.date).toLocaleDateString("ru")}
                          </small>
                        </span>
                      </button>
                    </div>
                  ))}
                {section === "history" && !git.commits.length && (
                  <p className="inspector-empty">Коммитов пока нет.</p>
                )}
                {section === "branches" &&
                  repository?.branches.map((b) => (
                    <div className="git-entry" data-selected={b.name === branch} key={b.name}>
                      <button
                        type="button"
                        aria-pressed={b.name === branch}
                        title={b.name}
                        onClick={() => {
                          setBranch(b.name);
                          setPhoneDetail(true);
                        }}
                      >
                        <span>
                          <strong>{b.name}</strong>
                          <small>{b.current ? "Текущая ветка" : b.upstream || "Локальная"}</small>
                        </span>
                        {b.current && <Icon name="check" size={16} />}
                      </button>
                    </div>
                  ))}
                {section === "branches" && repositoryError && <p role="alert">{repositoryError}</p>}
                {section === "branches" && !repository && !repositoryError && (
                  <p role="status">Читаю ветки…</p>
                )}
              </div>
              <div className="git-commit-form" hidden={section !== "changes"}>
                <label>
                  Описание коммита
                  <AutoTextarea
                    value={draft.message}
                    maxLength={2000}
                    onChange={(e) => persist({ ...draft, message: e.target.value })}
                  />
                </label>
                <small>
                  Выбрано {paths.length} из {git.changes.length}
                </small>
                <button
                  type="button"
                  className="primary"
                  disabled={!paths.length || !draft.message.trim() || !git.branch || busy}
                  onClick={() => launch("commit")}
                >
                  <Icon name="check" size={16} />
                  Проверить коммит
                </button>
              </div>
            </aside>
            <PanelDivider
              target=".git-side"
              peer=".git-detail"
              storageKey="git-file-list"
              variable="--git-list-width"
              label="Ширина списка Git"
              min={190}
              max={460}
              peerMin={300}
            />
            <article className="git-detail">
              <header className="git-detail-heading">
                <FileActionKey
                  label="К списку Git"
                  icon="back"
                  className="git-phone-back"
                  onClick={() => setPhoneDetail(false)}
                />
                <div>
                  <strong
                    title={
                      section === "changes"
                        ? selected
                        : section === "history"
                          ? currentCommit?.subject
                          : branch
                    }
                  >
                    {section === "changes"
                      ? selected.split("/").filter(Boolean).at(-1) || "Рабочая копия"
                      : section === "history"
                        ? (currentCommit?.subject ?? "История")
                        : branch || "Ветки"}
                  </strong>
                  <small>
                    {section === "changes"
                      ? selected.split("/").slice(0, -1).join("/")
                      : section === "history"
                        ? currentCommit?.id
                        : currentBranch?.upstream}
                  </small>
                </div>
                {section === "changes" && selected && (
                  <FileActionKey
                    label="Открыть в Файлах"
                    icon="folder"
                    onClick={() => onOpenFiles(selected)}
                  />
                )}
              </header>
              <div className="git-detail-scroll">
                {section === "changes" && selected && !selected.endsWith("/") && (
                  <>
                    <div className="git-diff-tools">
                      <div className="git-diff-source">
                        <button
                          type="button"
                          aria-pressed={!staged}
                          onClick={() => setStaged(false)}
                        >
                          Рабочая копия
                        </button>
                        <button type="button" aria-pressed={staged} onClick={() => setStaged(true)}>
                          Индекс
                        </button>
                      </div>
                      <FileActionKey
                        label={paired ? "Разница одним списком" : "Разница рядом"}
                        icon="panel-right"
                        aria-pressed={paired}
                        onClick={() => setPaired((v) => !v)}
                      />
                      {diff && <CopyButton text={diff.text} label="Копировать diff" />}
                    </div>
                    {change?.previousPath && (
                      <p className="muted">Прежнее имя: {change.previousPath}</p>
                    )}
                    {diffError && (
                      <p className="notice" role="alert">
                        {diffError}
                      </p>
                    )}
                    {!diff && !diffError && (
                      <p role="status">
                        <span className="spinner" /> Читаю diff…
                      </p>
                    )}
                    {diff &&
                      (diff.text ? (
                        <GitDiff text={diff.text} paired={paired} />
                      ) : (
                        <p className="inspector-empty">
                          Нет текстового diff. Содержимое можно открыть в Файлах.
                        </p>
                      ))}
                    {diff?.truncated && <small>Показано начало diff — 256 КБ</small>}
                  </>
                )}
                {section === "changes" && selected.endsWith("/") && (
                  <p>Папку можно открыть в общем файловом менеджере.</p>
                )}
                {section === "changes" && !selected && (
                  <p className="inspector-empty">Рабочая копия без изменений.</p>
                )}
                {section === "history" && currentCommit && (
                  <div className="git-commit-detail">
                    <h2>{currentCommit.subject}</h2>
                    <div className="git-commit-id">
                      <code>{currentCommit.id}</code>
                      <CopyButton text={currentCommit.id} label="Копировать коммит" />
                    </div>
                    <p>{currentCommit.author}</p>
                    <time dateTime={currentCommit.date}>
                      {new Date(currentCommit.date).toLocaleString("ru")}
                    </time>
                    {repository?.remote && (
                      <p>
                        <a
                          href={`${repository.remote.url}/commit/${currentCommit.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Изменения коммита на GitHub <Icon name="external" size={15} />
                        </a>
                      </p>
                    )}
                  </div>
                )}
                {section === "branches" && currentBranch && (
                  <div className="git-commit-detail">
                    <h2>{currentBranch.name}</h2>
                    <p>
                      {currentBranch.current ? "Текущая ветка рабочей копии" : "Локальная ветка"}
                    </p>
                    <p>{currentBranch.upstream || "Upstream не задан"}</p>
                    {!!repository?.tags.length && (
                      <details>
                        <summary>Теги · {repository.tags.length}</summary>
                        {repository.tags.map((t) => (
                          <p key={t.name}>
                            <strong>{t.name}</strong>
                            <small>{t.subject}</small>
                          </p>
                        ))}
                      </details>
                    )}
                  </div>
                )}
              </div>
            </article>
          </div>
        ) : (
          <div className="git-information">
            {section === "info" && (
              <div className="git-information-actions">
                <FileActionKey
                  compact={false}
                  label="Файлы рабочей копии"
                  icon="folder"
                  onClick={() => onOpenFiles("")}
                />
                <GitHubFilesButton projectId={projectId} projectName={projectName} />
              </div>
            )}
            <ProjectRepositoryView
              compact
              visible
              projectId={projectId}
              projectName={projectName}
              git={git}
              revision={revision}
              section={section === "releases" ? "releases" : "overview"}
              onSection={() => {}}
              changes={null}
            />
          </div>
        ))}
    </dialog>
  );
}
