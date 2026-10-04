import { useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
import { openTerminal } from "./DeviceWorkspaceHost";

type Workspace = { available: boolean; state: string };
export function ServerWorkspace({
  visible,
  active,
  refresh,
}: {
  visible: boolean;
  active: boolean;
  refresh: () => Promise<void>;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController();
    void api<Workspace>("/team/server-workspace", { signal: abort.signal })
      .then(setWorkspace)
      .catch(() => {});
    return () => abort.abort();
  }, [visible]);
  const run = async (start = false) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      if (start) {
        setWorkspace(
          await api<Workspace>("/team/server-workspace/start", { method: "POST", body: {} }),
        );
      } else if (workspace?.state !== "ready") {
        setWorkspace(await api<Workspace>("/team/server-workspace", { method: "POST", body: {} }));
      } else {
        await api("/team/server-workspace/connect", { method: "POST", body: {} });
        await refresh();
      }
    } catch (e) {
      setError(messageOf(e));
      // A lost create response is reconciled by status; never issue another creation.
      try {
        setWorkspace(await api<Workspace>("/team/server-workspace"));
      } catch {}
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  if (!workspace?.available) return null;
  const revoked = ["revoking", "revoked"].includes(workspace.state);
  return (
    <section className="server-workspace" aria-label="Личное серверное окружение">
      <h3>Моё серверное окружение</h3>
      <p className="muted">
        Личный Linux для файлов и своих приложений. Работает на сервере, даже когда личный компьютер
        выключен.
      </p>
      {revoked ? (
        <p role="status">Доступ отозван. Данные окружения сохранены.</p>
      ) : (
        <>
          <p className="muted">
            {active
              ? "Подключено. Терминал доступен в «Устройствах». Твои файлы находятся в /workspace."
              : workspace.state === "ready"
                ? "Окружение готово. Подключи его, чтобы открыть терминал и работать со своими файлами."
                : workspace.state === "creating"
                  ? "Создание уже запрошено. Проверим его результат без повторного запуска."
                  : "Отдельное окружение со своими файлами и настройками."}
          </p>
          <div className="server-workspace-actions">
            {active ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => openTerminal("server-workspace")}
                >
                  Открыть терминал
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run(true)}
                >
                  Запустить
                </button>
              </>
            ) : (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void run()}
              >
                {busy
                  ? "Подключаем…"
                  : workspace.state === "ready"
                    ? "Подключить"
                    : workspace.state === "creating"
                      ? "Проверить создание"
                      : "Создать окружение"}
              </button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
