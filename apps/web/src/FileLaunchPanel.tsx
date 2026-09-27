import type { FileLaunchOperation, FileLaunchPrepared } from "@codex-web/shared";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { accountLocalStorage as storage } from "./accountStorage";
import { api, messageOf } from "./api";
import { Icon } from "./icons";
import { Remote } from "./Remote";
import { useWorkspaceDialog } from "./useWorkspaceDialog";
import "./file-launch.css";
import "./workspace-window.css";

const Files = lazy(() => import("./ProjectFiles").then((m) => ({ default: m.ProjectFiles })));
const labels = {
  queued: "Запуск принят",
  launching: "Запускаем",
  running: "Процесс работает",
  exited: "Процесс завершился",
  failed: "Запуск не выполнен",
  unknown: "Состояние запуска не подтверждено",
};
export default function FileLaunchPanel({
  source,
  name,
  initial,
  onClose,
}: {
  source: string;
  name: string;
  initial?: FileLaunchPrepared;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(dialog);
  const [p, setP] = useState(initial),
    [op, setOp] = useState<FileLaunchOperation>(),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [files, setFiles] = useState(false),
    [remote, setRemote] = useState(false),
    [again, setAgain] = useState(false);
  const key = "file-launch:" + source,
    alive = useRef(true),
    lock = useRef(false),
    autoRemote = useRef(false);
  const [pending, setPending] = useState<string>(() => {
    try {
      return storage.getItem(key) || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const prepare = useCallback(async () => {
    const value = await api<FileLaunchPrepared>("/file-launches/prepare", {
      method: "POST",
      body: { source },
    });
    if (alive.current) setP(value);
    return value;
  }, [source]);
  useEffect(() => {
    if (!initial)
      void prepare().catch((e) => {
        if (alive.current) setError(messageOf(e));
      });
  }, [initial, prepare]);
  const update = useCallback((v: FileLaunchOperation) => {
    if (!alive.current) return;
    setOp(v);
    setError("");
    if (autoRemote.current && ["running", "exited"].includes(v.state)) {
      autoRemote.current = false;
      if (v.prepared.remoteAvailable) setRemote(true);
    }
  }, []);
  const check = useCallback(async () => {
    if (!pending || lock.current) return;
    lock.current = true;
    try {
      update(await api<FileLaunchOperation>("/file-launches/" + pending));
    } finally {
      lock.current = false;
    }
  }, [pending, update]);
  const state = op?.state;
  useEffect(() => {
    if (!pending || (state && ["exited", "failed"].includes(state))) return;
    let active = true,
      failures = 0,
      checks = 0,
      timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!active) return;
      try {
        await check();
        failures = 0;
      } catch (e) {
        failures++;
        if (active) setError(messageOf(e));
      }
      if (active && failures < 3 && ++checks < 24) timer = setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pending, state, check]);
  const launch = async () => {
    if (lock.current || !p || p.changed || p.unverified) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Refresh expired observations requires another deliberate tap on the current version.
      if (p.expiresAt < Date.now()) {
        await prepare();
        setError("Подготовлена текущая версия. Нажми «Запустить и показать» ещё раз.");
        return;
      }
      const id = crypto.randomUUID();
      storage.setItem(key, id);
      setPending(id);
      setOp(undefined);
      autoRemote.current = true;
      update(
        await api<FileLaunchOperation>("/file-launches/" + id, {
          method: "PUT",
          body: { preparedId: p.id },
        }),
      );
    } catch (e) {
      if (alive.current) setError(messageOf(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const newAttempt = async () => {
    setBusy(true);
    try {
      await prepare();
      storage.removeItem(key);
      setPending("");
      setOp(undefined);
      setAgain(false);
      setError("");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <>
      <dialog
        ref={dialog}
        tabIndex={-1}
        className="workspace-window file-launch-dialog"
        aria-label="Запуск файла"
        onCancel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      >
        <header>
          <div>
            <strong>Запуск файла</strong>
            <small title={name}>{name}</small>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть запуск"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <section className="file-launch-body">
          {p && (
            <>
              <p>
                {p.projectName} · {p.machineName}
              </p>
              <code>{p.path}</code>
              <small>
                {p.handler.toUpperCase()} · Рабочая папка:{" "}
                {p.path.split("/").slice(0, -1).join("/") || "."}
              </small>
            </>
          )}
          {p?.unverified && (
            <p>
              Для этой сохранённой копии не подтверждён исходный компьютер. Открой текущий файл в
              Файлах проекта.
            </p>
          )}
          {p?.changed && (
            <p>
              Файл изменился после сохранения в Результаты. Открой текущую версию в Файлах для
              запуска.
            </p>
          )}
          {op && (
            <p role="status">
              {labels[op.state]}
              {op.pid ? ` · PID ${op.pid}` : ""}
              {op.exitCode !== undefined ? ` · Код ${op.exitCode}` : ""}
            </p>
          )}
          {op && ["running", "exited"].includes(op.state) && !op.prepared.remoteAvailable && (
            <p>Запуск выполнен. Remote для этого компьютера пока не настроен.</p>
          )}
          {op?.code && (
            <p>
              {op.code === "LAUNCH_CHANGED"
                ? "Файл изменился перед запуском. Открой его текущую версию."
                : op.code === "LAUNCH_EXPIRED"
                  ? "Запрос истёк. Автоматического повторного запуска не будет."
                  : "Автоматического повторного запуска не будет."}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {p && (
            <div className="file-launch-actions">
              <button type="button" className="secondary" onClick={() => setFiles(true)}>
                Открыть местоположение
              </button>
              {!pending && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy || p.changed || p.unverified}
                  onClick={() => void launch()}
                >
                  <Icon name="play" size={17} />
                  Запустить и показать
                </button>
              )}
              {pending && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void check().catch((e) => setError(messageOf(e)))}
                >
                  Проверить запуск
                </button>
              )}
              {op?.prepared.remoteAvailable && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void check()
                      .then(() => setRemote(true))
                      .catch((e) => setError(messageOf(e)))
                  }
                >
                  Открыть Remote
                </button>
              )}
              {pending && !busy && (
                <button type="button" className="secondary" onClick={() => setAgain(true)}>
                  Новый запуск
                </button>
              )}
            </div>
          )}
          {again && (
            <>
              <p>Новый запуск создаст отдельный процесс. Предыдущий процесс не будет остановлен.</p>
              <div className="file-launch-actions">
                <button type="button" className="secondary" onClick={() => setAgain(false)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void newAttempt()}
                >
                  Подготовить новый запуск
                </button>
              </div>
            </>
          )}
          {!p && (
            <button
              type="button"
              className="secondary"
              onClick={() => void prepare().catch((e) => setError(messageOf(e)))}
            >
              Проверить файл
            </button>
          )}
        </section>
      </dialog>
      {files && p && (
        <Suspense fallback={null}>
          <Files
            projectId={p.projectId}
            projectName={p.projectName}
            visible
            mode="files"
            focus={{ path: p.path, version: 1, projectId: p.projectId }}
            onBack={() => setFiles(false)}
            onOpenFiles={() => {}}
          />
        </Suspense>
      )}
      {remote && op && (
        <LaunchRemote projectId={op.prepared.projectId} onClose={() => setRemote(false)} />
      )}
    </>,
    document.body,
  );
}
function LaunchRemote({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(ref);
  return (
    <dialog
      ref={ref}
      className="pc-remote-dialog"
      tabIndex={-1}
      aria-label="Remote запущенного файла"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <Remote
        projectId={projectId}
        threadId=""
        visible
        available
        onBack={onClose}
        onCollapse={onClose}
        onSnapshot={() => {}}
        onImmersiveChange={() => {}}
      />
    </dialog>
  );
}
