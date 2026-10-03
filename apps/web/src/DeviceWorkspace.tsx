import type {
  DeviceAction,
  DeviceInfo,
  DeviceSnapshot,
  DeviceTerminalInfo,
} from "@codex-web/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { accountLocalStorage as localStorage } from "./accountStorage.ts";
import { api } from "./api";
import { DeviceTerminal } from "./DeviceTerminal";
import { Icon } from "./icons";
import { PanelDivider } from "./PanelDivider";
import { useWindowGeometry } from "./useWindowGeometry";
import { HelpButton } from "./WorkspaceHelp";
import { useWindowDismiss } from "./windowMotion";
import "./devices.css";

function DeviceMenu({
  label,
  children,
  disabled,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const root = useRef<HTMLFieldSetElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const focusTarget =
      root.current?.querySelector<HTMLElement>(".device-menu-items button:not(:disabled)") ??
      root.current;
    focusTarget?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <fieldset
      className="device-menu"
      aria-label={label}
      ref={root}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          root.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        className="icon-button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more" />
      </button>
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: native button activation bubbles here, including keyboard clicks.
        <fieldset
          className="device-menu-items"
          aria-label={label}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) {
              setOpen(false);
              root.current?.querySelector<HTMLButtonElement>("button")?.focus();
            }
          }}
        >
          {children}
        </fieldset>
      )}
    </fieldset>
  );
}

const bytes = (v: number) =>
  v >= 1024 ** 4
    ? `${(v / 1024 ** 4).toFixed(1)} ТБ`
    : v >= 1024 ** 3
      ? `${(v / 1024 ** 3).toFixed(1)} ГБ`
      : `${Math.round(v / 1024 ** 2)} МБ`;
const duration = (seconds: number) =>
  seconds >= 86400
    ? `${Math.floor(seconds / 86400)} дн. ${Math.floor((seconds % 86400) / 3600)} ч.`
    : `${Math.floor(seconds / 3600)} ч. ${Math.floor((seconds % 3600) / 60)} мин.`;
export default function DeviceWorkspace({
  onClose,
  terminalDeviceId = "",
}: {
  onClose: () => void;
  terminalDeviceId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    actionDialog = useRef<HTMLDialogElement>(null);
  const dismiss = useWindowDismiss(dialog);
  const [devices, setDevices] = useState<DeviceInfo[]>([]),
    [selected, setSelected] = useState(() => {
      if (terminalDeviceId) return terminalDeviceId;
      try {
        return localStorage.getItem("codex-device") ?? "";
      } catch {
        return "";
      }
    });
  const [snapshot, setSnapshot] = useState<DeviceSnapshot>(),
    [sessions, setSessions] = useState<DeviceTerminalInfo[]>([]),
    [terminal, updateTerminal] = useState("");
  const views = useRef(new Map<string, { page: "info" | "terminal"; terminal: string }>());
  const drafts = useRef(new Map<string, string>());
  const snapshots = useRef(new Map<string, DeviceSnapshot>());
  const rememberSnapshot = useCallback((id: string, value: DeviceSnapshot) => {
    const previous = snapshots.current.get(id);
    const next =
      !value.online && previous?.os
        ? { ...previous, online: false, checkedAt: value.checkedAt, error: value.error }
        : value;
    snapshots.current.set(id, next);
    setSnapshot(next);
  }, []);
  const [page, updatePage] = useState<"info" | "terminal">(terminalDeviceId ? "terminal" : "info"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [action, setAction] = useState<"restart" | "shutdown" | "mount" | "end" | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("codex-device-summary-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const setPage = (value: "info" | "terminal") => {
    views.current.set(selected, {
      terminal: views.current.get(selected)?.terminal ?? terminal,
      page: value,
    });
    updatePage(value);
  };
  const setTerminal = (value: string) => {
    views.current.set(selected, {
      page: views.current.get(selected)?.page ?? page,
      terminal: value,
    });
    updateTerminal(value);
  };
  const toggleSummary = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem("codex-device-summary-collapsed", String(!v));
      } catch {}
      return !v;
    });
  };
  const [source, setSource] = useState(""),
    [mountName, setMountName] = useState(""),
    [protocol, setProtocol] = useState<"smb" | "nfs">("smb"),
    [credentials, setCredentials] = useState(true);
  const pending = useRef<{ key: string; device: string; action: DeviceAction } | null>(null);
  const automatic = useRef("");
  const visitedTerminals = useRef(new Set<string>());
  if (terminal) visitedTerminals.current.add(terminal);
  const [closing, setClosing] = useState(false);
  const closeWindow = async () => {
    if (closing || busy) return;
    setClosing(true);
    setError("");
    try {
      await Promise.all(
        [...visitedTerminals.current].map((id) =>
          api(`/device-terminals/${id}/release`, { method: "POST", timeoutMs: 10000 }),
        ),
      );
      dismiss(onClose);
    } catch (e) {
      setError((e as Error).message);
      setClosing(false);
    }
  };
  const [loadedDevice, setLoadedDevice] = useState("");
  const selection = useRef(selected);
  selection.current = selected;
  const current = devices.find((d) => d.id === selected);
  useEffect(() => {
    if (terminalDeviceId) {
      setSelected(terminalDeviceId);
      views.current.set(terminalDeviceId, {
        page: "terminal",
        terminal: views.current.get(terminalDeviceId)?.terminal ?? "",
      });
      updatePage("terminal");
    }
  }, [terminalDeviceId]);
  useEffect(() => {
    if (action) {
      actionDialog.current?.showModal();
      actionDialog.current?.focus();
    }
    return () => actionDialog.current?.close();
  }, [action]);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.focus();
    return () => dialog.current?.close();
  }, []);
  useWindowGeometry(dialog, "devices");
  useEffect(() => {
    const controller = new AbortController();
    void api<{ devices: DeviceInfo[] }>("/devices", { signal: controller.signal })
      .then((r) => {
        setDevices(r.devices);
        setSelected((v) =>
          r.devices.some((d) => d.id === v) || terminalDeviceId ? v : (r.devices[0]?.id ?? ""),
        );
        if (terminalDeviceId && !r.devices.some((d) => d.id === terminalDeviceId))
          setError("Это устройство недоступно в твоём рабочем пространстве.");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [terminalDeviceId]);
  useEffect(() => {
    setSnapshot(snapshots.current.get(selected));
    setSessions([]);
    setLoadedDevice("");
    updateTerminal("");
    updatePage(views.current.get(selected)?.page ?? "info");
    setAction(null);
    setError("");
    if (!selected) return;
    try {
      localStorage.setItem("codex-device", selected);
    } catch {}
    const controller = new AbortController();
    let reading = false;
    const read = () => {
      if (document.hidden || reading) return;
      reading = true;
      void api<DeviceSnapshot>(`/devices/${selected}/snapshot`, {
        signal: controller.signal,
        timeoutMs: 20000,
      })
        .then((value) => {
          if (controller.signal.aborted) return;
          rememberSnapshot(selected, value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          reading = false;
        });
    };
    read();
    const timer = setInterval(read, 30000);
    document.addEventListener("visibilitychange", read);
    void api<{ terminals: DeviceTerminalInfo[] }>(`/devices/${selected}/terminals`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (controller.signal.aborted) return;
        setSessions(r.terminals);
        const saved = r.terminals.find((t) => t.id === views.current.get(selected)?.terminal);
        const open = r.terminals.find((t) => t.state === "open");
        updateTerminal(saved?.id ?? open?.id ?? "");
        setLoadedDevice(selected);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, [selected, rememberSnapshot]);
  useEffect(() => {
    if (!selected || refresh === 0) return;
    const controller = new AbortController();
    void Promise.all([
      api<DeviceSnapshot>(`/devices/${selected}/snapshot`, { signal: controller.signal }),
      api<{ terminals: DeviceTerminalInfo[] }>(`/devices/${selected}/terminals`, {
        signal: controller.signal,
      }),
    ])
      .then(([s, t]) => {
        if (controller.signal.aborted) return;
        rememberSnapshot(selected, s);
        setSessions(t.terminals);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [refresh, selected, rememberSnapshot]);
  const create = useCallback(
    async (value: DeviceAction) => {
      if (!current || busy || closing) return;
      const id = current.id;
      if (
        !pending.current ||
        pending.current.device !== id ||
        JSON.stringify(pending.current.action) !== JSON.stringify(value)
      )
        pending.current = { device: id, action: value, key: crypto.randomUUID() };
      setBusy(true);
      setError("");
      try {
        const result = await api<DeviceTerminalInfo>(`/devices/${id}/terminals`, {
          method: "POST",
          body: value,
          key: pending.current.key,
          timeoutMs: 20000,
        });
        pending.current = null;
        if (selection.current === id) {
          setSessions((v) => [result, ...v.filter((t) => t.id !== result.id)].slice(0, 12));
          views.current.set(id, { page: "terminal", terminal: result.id });
          updateTerminal(result.id);
          updatePage("terminal");
          setAction(null);
        }
      } catch (e) {
        if (selection.current === id) setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [current, busy, closing],
  );
  const end = async () => {
    if (!terminal || busy || closing) return;
    setBusy(true);
    setError("");
    try {
      await api(`/device-terminals/${terminal}`, { method: "DELETE" });
      setAction(null);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (
      !terminalDeviceId ||
      selected !== terminalDeviceId ||
      loadedDevice !== selected ||
      !current ||
      busy ||
      automatic.current === terminalDeviceId
    )
      return;
    automatic.current = terminalDeviceId;
    if (!terminal) void create({ kind: "shell" });
  }, [terminalDeviceId, selected, loadedDevice, current, busy, terminal, create]);
  const sessionPicker = (
    <>
      <button
        type="button"
        className="icon-button device-restore"
        aria-label="Показать сведения"
        title="Показать сведения"
        onClick={toggleSummary}
      >
        <Icon name="chevron" size={18} />
      </button>
      <select
        aria-label="Сессия терминала"
        value={terminal}
        onChange={(e) => setTerminal(e.target.value)}
      >
        <option value="">Терминалы</option>
        {sessions.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} ·{" "}
            {new Date(t.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {t.state === "closed" ? " · завершён" : ""}
          </option>
        ))}
      </select>
    </>
  );
  const terminalActions = (
    <>
      <button
        type="button"
        className="icon-button"
        disabled={busy || closing || !current}
        aria-label="Новый терминал"
        title="Новый терминал"
        onClick={() => void create({ kind: "shell" })}
      >
        <Icon name="plus" />
      </button>
      <DeviceMenu key={terminal} label="Действия терминала" disabled={busy || closing || !terminal}>
        <button
          type="button"
          disabled={sessions.find((t) => t.id === terminal)?.state !== "open"}
          onClick={() => setAction("end")}
        >
          <Icon name="stop" size={18} />
          Завершить терминал
        </button>
      </DeviceMenu>
    </>
  );
  return (
    <dialog
      className="devices-workspace"
      data-help-context="terminal-input"
      ref={dialog}
      tabIndex={-1}
      aria-label="Устройства"
      onCancel={(e) => {
        e.preventDefault();
        void closeWindow();
      }}
    >
      <header className="devices-heading">
        <Icon name="terminal" />
        <h2>Устройства</h2>
        <HelpButton topic="terminal-input" />
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть устройства"
          onClick={() => void closeWindow()}
          disabled={closing || busy}
        >
          <Icon name="close" />
        </button>
      </header>
      <nav className="device-picker" aria-label="Выбор устройства">
        <label className="device-choice">
          <Icon name={current?.platform === "windows" ? "remote" : "server"} size={20} />
          <select
            aria-label="Устройство"
            value={selected}
            disabled={busy || closing}
            title={current?.name}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!current && <option value={selected}>Выбери устройство</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ·{" "}
                {d.platform === "windows"
                  ? "Windows"
                  : d.platform === "linux"
                    ? "Linux"
                    : "Android"}
              </option>
            ))}
          </select>
        </label>
        <span className="device-updated">
          {snapshot
            ? `${snapshot.online ? "Обновлено" : "Проверено"} ${new Date(snapshot.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </span>
        <button
          type="button"
          className="icon-button"
          title="Обновить устройство"
          aria-label="Обновить устройство"
          onClick={() => setRefresh((v) => v + 1)}
        >
          <Icon name="refresh" />
        </button>
        <DeviceMenu
          key={selected}
          label="Действия устройства"
          disabled={busy || closing || !current}
        >
          <div className="device-actions">
            {current?.mounts && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setAction("mount");
                  setMountName(current.platform === "windows" ? "Z" : "share");
                }}
              >
                <Icon name="folder" size={18} />
                Сетевой диск
              </button>
            )}
            {current?.power && (
              <>
                <button type="button" disabled={busy} onClick={() => setAction("restart")}>
                  <Icon name="rotate" size={18} />
                  Перезагрузка
                </button>
                <button type="button" disabled={busy} onClick={() => setAction("shutdown")}>
                  <Icon name="power" size={18} />
                  Выключение
                </button>
              </>
            )}
          </div>
          {current && !current.power && !current.mounts && (
            <p className="device-muted">Для этой машины нет дополнительных действий.</p>
          )}
        </DeviceMenu>
      </nav>
      {error && (
        <div className="device-error" role="alert">
          {error}
        </div>
      )}
      {!devices.length ? (
        <p className="device-empty">Устройства пока не настроены.</p>
      ) : (
        <>
          <nav className="device-mobile-tabs" aria-label="Вид устройства">
            <button type="button" aria-pressed={page === "info"} onClick={() => setPage("info")}>
              Система
            </button>
            <button
              type="button"
              aria-pressed={page === "terminal"}
              onClick={() => setPage("terminal")}
            >
              Терминал
            </button>
          </nav>
          <div className="device-layout" data-page={page} data-collapsed={collapsed}>
            <PanelDivider
              target=".device-system"
              peer=".device-console"
              storageKey="devices"
              label="Ширина сведений об устройстве"
              min={200}
              max={380}
              peerMin={300}
            />
            <section className="device-system">
              <div className="device-section-heading">
                <h3>Система</h3>
                <span className={snapshot?.online ? "online" : ""}>
                  {snapshot ? (snapshot.online ? "В сети" : "Недоступно") : "Проверяем…"}
                </span>
                <button
                  type="button"
                  className="icon-button device-collapse"
                  aria-label="Свернуть сведения"
                  title="Свернуть сведения"
                  onClick={toggleSummary}
                >
                  <Icon name="back" size={18} />
                </button>
              </div>
              {snapshot?.os ? (
                <>
                  {!snapshot.online && (
                    <p className="device-muted">Нет связи. Последние доступные сведения.</p>
                  )}
                  <p className="device-os">
                    {snapshot.os}
                    <small>
                      {snapshot.hostname} · {snapshot.architecture}
                    </small>
                  </p>
                  <dl className="device-specs">
                    <div>
                      <dt>Процессор</dt>
                      <dd>
                        {snapshot.cpu || "Нет данных"}
                        {snapshot.cores ? ` · ${snapshot.cores} потоков` : ""}
                      </dd>
                    </div>
                    {snapshot.cpuPercent !== undefined && (
                      <div>
                        <dt>Загрузка CPU</dt>
                        <dd>{Math.round(snapshot.cpuPercent)}%</dd>
                      </div>
                    )}
                    {snapshot.load1 !== undefined && (
                      <div>
                        <dt>Нагрузка · 1 мин</dt>
                        <dd>{snapshot.load1.toFixed(2)}</dd>
                      </div>
                    )}
                    {snapshot.uptimeSeconds !== undefined && (
                      <div>
                        <dt>Без перезагрузки</dt>
                        <dd>{duration(snapshot.uptimeSeconds)}</dd>
                      </div>
                    )}
                  </dl>
                  {snapshot.memoryTotal !== undefined && snapshot.memoryAvailable !== undefined && (
                    <div className="device-meter">
                      <span>
                        Память{" "}
                        <b>
                          {bytes(snapshot.memoryTotal - snapshot.memoryAvailable)} /{" "}
                          {bytes(snapshot.memoryTotal)}
                        </b>
                      </span>
                      <meter
                        min={0}
                        max={snapshot.memoryTotal}
                        value={snapshot.memoryTotal - snapshot.memoryAvailable}
                      />
                    </div>
                  )}
                  <h4>Диски</h4>
                  {snapshot.disks.map((d) => (
                    <div className="device-meter" key={`${d.mount}:${d.name}`}>
                      <span title={d.name}>
                        {d.mount}
                        <b>
                          {bytes(d.total - d.available)} / {bytes(d.total)}
                        </b>
                      </span>
                      <meter min={0} max={d.total} value={d.total - d.available} />
                    </div>
                  ))}
                  <h4>Температура</h4>
                  {snapshot.temperatures.length ? (
                    snapshot.temperatures.map((t) => (
                      <div className="device-sensor" key={t.name}>
                        <span>{t.name}</span>
                        <b>{t.celsius.toFixed(1)} °C</b>
                      </div>
                    ))
                  ) : (
                    <p className="device-muted">Датчики недоступны.</p>
                  )}
                </>
              ) : (
                snapshot && <p>{snapshot.error}</p>
              )}
            </section>
            <section className="device-console">
              {terminal ? (
                <DeviceTerminal
                  key={terminal}
                  id={terminal}
                  initialCommand={drafts.current.get(terminal) ?? ""}
                  onCommandChange={(value) => {
                    if (value) drafts.current.set(terminal, value);
                    else drafts.current.delete(terminal);
                  }}
                  sessionPicker={sessionPicker}
                  actions={terminalActions}
                  onExit={() => setRefresh((v) => v + 1)}
                />
              ) : (
                <>
                  <div className="device-console-heading">
                    {sessionPicker}
                    {terminalActions}
                  </div>
                  <div className="device-terminal-empty">
                    <Icon name="terminal" size={40} />
                    <p>
                      {current?.platform === "windows" ? "PowerShell на ПК" : "Терминал сервера"}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void create({ kind: "shell" })}
                    >
                      {busy ? "Открываем…" : "Открыть терминал"}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
      {action && current && (
        <dialog
          className="device-action-backdrop"
          ref={actionDialog}
          tabIndex={-1}
          aria-label="Действие устройства"
          onCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!busy) setAction(null);
          }}
        >
          <form
            className="device-action-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              if (action === "end") {
                void end();
                return;
              }
              void create(
                action === "mount"
                  ? {
                      kind: "mount",
                      protocol,
                      source,
                      name: mountName,
                      credentials,
                      confirmation: current.name,
                    }
                  : { kind: action, confirmation: current.name },
              );
            }}
          >
            <h3>
              {action === "mount"
                ? "Подключить сетевой диск"
                : action === "restart"
                  ? "Перезагрузить"
                  : action === "end"
                    ? "Завершить терминал"
                    : "Выключить"}{" "}
              · {current.name}
            </h3>
            {action === "mount" ? (
              <>
                <label>
                  Протокол
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as "smb" | "nfs")}
                  >
                    <option value="smb">SMB</option>
                    {current.platform !== "windows" && <option value="nfs">NFS</option>}
                  </select>
                </label>
                <label>
                  Адрес
                  <input
                    required
                    value={source}
                    placeholder={protocol === "smb" ? "//server/share" : "server:/path"}
                    onChange={(e) => setSource(e.target.value)}
                  />
                </label>
                <label>
                  {current.platform === "windows" ? "Буква диска" : "Папка в ~/mnt"}
                  <input
                    required
                    value={mountName}
                    onChange={(e) => setMountName(e.target.value)}
                  />
                </label>
                {protocol === "smb" && (
                  <label className="device-checkbox">
                    <input
                      type="checkbox"
                      checked={credentials}
                      onChange={(e) => setCredentials(e.target.checked)}
                    />
                    Запросить имя и пароль
                  </label>
                )}
                {current.platform === "windows" && <p>Диск подключится для удалённой сессии ПК.</p>}
              </>
            ) : (
              <p>
                {action === "end"
                  ? "Сессия терминала и запущенная в ней команда будут завершены."
                  : "Работающие программы и задачи на этом устройстве будут остановлены."}
              </p>
            )}
            <footer>
              <button type="button" disabled={busy} onClick={() => setAction(null)}>
                Отмена
              </button>
              <button
                type="submit"
                className={action === "mount" ? "primary" : "danger"}
                disabled={busy}
              >
                {busy
                  ? "Выполняем…"
                  : action === "mount"
                    ? "Подключить"
                    : action === "restart"
                      ? "Перезагрузить"
                      : action === "end"
                        ? "Завершить"
                        : "Выключить"}
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </dialog>
  );
}
