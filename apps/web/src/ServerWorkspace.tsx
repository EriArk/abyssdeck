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
        Linux для твоих проектов, файлов и Codex. Работает на сервере, даже когда личный компьютер
        выключен.
      </p>
      {revoked ? (
        <p role="status">Доступ отозван. Данные окружения сохранены.</p>
      ) : (
        <>
          <p className="muted">
            {active
              ? "Подключено. При создании проекта выбери это окружение; папки проектов находятся в /workspace/projects."
              : workspace.state === "ready"
                ? "Окружение готово. Подключи его, чтобы открыть терминал и создавать проекты. Текущая работа продолжится."
                : workspace.state === "creating"
                  ? "Создание уже запрошено. Проверим его результат без повторного запуска."
                  : "Отдельные файлы и аккаунты. GitHub и Codex подключаются внутри твоего окружения."}
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
          {active && (
            <details>
              <summary>Подключить свои аккаунты</summary>
              <p>
                Для Codex сначала включи вход по коду устройства в ChatGPT → Настройки →
                Безопасность. Затем в терминале выполни <code>codex login --device-auth</code> и
                открой предложенную ссылку. Если включил настройку после ошибки, запусти команду
                заново для нового кода. Для GitHub выполни <code>gh auth login</code>. Подтверди
                вход своим аккаунтом; пароли и коды вводятся только в окне входа или терминале.
              </p>
            </details>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
