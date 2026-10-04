import type { NotebookLink, TeamUser } from "@codex-web/shared";
import { useEffect, useRef, useState } from "react";
import { AccountControls } from "./AccountControls";
import { AppearanceSettings, LayoutPreference } from "./AppearanceSettings";
import { pageWorkspace } from "./accountStorage";
import { api, messageOf } from "./api";
import { BridgeDoctorPanel } from "./BridgeDoctorPanel";
import { DeploymentStatus } from "./DeploymentStatus";
import { DesktopControl } from "./DesktopControl";
import { openTerminal } from "./DeviceWorkspaceHost";
import { EntityArchive } from "./EntityMenu";
import { GptConnectionSettings } from "./GptConnectionSettings";
import { MachineHealthPanel } from "./MachineHealth";
import { openMemberSetup } from "./MemberSetup";
import { SpeechSettings } from "./MessageSpeech";
import { NativeInventory } from "./NativeInventory";
import { Notifications } from "./Notifications";
import { PersonalScaleSettings } from "./PersonalScale";
import { SettingsLink, type SettingsPage, SettingsSections } from "./SettingsSections";
import { StorageUsage } from "./StorageUsage";
import { TeamAccess } from "./TeamAccess";
import { TeamGpt } from "./TeamGpt";
import { TeamMachines } from "./TeamMachines";
import type { Machine, Project, Session, Theme } from "./types";
import { UsageLimits } from "./UsageLimits";
import { UsageLimitsProvider } from "./UsageLimitsState";
import { useProjectSwipe } from "./useProjectSwipe";
import { useWindowGeometry } from "./useWindowGeometry";
import { changeNavigation, ShortcutSettings } from "./WorkspaceCommands";
import { useWindowDismiss } from "./windowMotion";
import { restoreWorkspaceWindow } from "./workspaceWindowRegistry";

export const gptSettingsChanged = "codex-gpt-settings-changed";

export function WorkspaceSettings({
  open,
  onClose,
  machines,
  project,
  threadId,
  theme,
  onTheme,
  onSession,
  onLogout,
  onMachines,
  onMachineProject,
  onActivity,
  onTarget,
  onRefreshCodex,
}: {
  open: boolean;
  onClose: () => void;
  machines: Machine[];
  project?: Project;
  threadId: string;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onSession: (session: Session) => void;
  onLogout: () => void;
  onMachines: () => void;
  onMachineProject: (id: string, remote: boolean) => void;
  onActivity: () => void;
  onTarget: (target: NotebookLink) => void;
  onRefreshCodex: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    dismiss = useWindowDismiss(dialog);
  const [refreshing, setRefreshing] = useState(""),
    [notice, setNotice] = useState("");
  const [identity, setIdentity] = useState<{ user: TeamUser; originalOwner: boolean } | null>(null);
  const [machineId, setMachineId] = useState(project?.machineId ?? machines[0]?.id ?? "");
  const machine =
    machines.find((m) => m.id === machineId) ??
    machines.find((m) => m.id === project?.machineId) ??
    machines[0];
  const selectedMachines = machine ? [machine] : [];
  const running = useRef(false);
  useProjectSwipe(dialog, open, () => dismiss(onClose), "close");
  useEffect(() => {
    if (open && dialog.current) {
      restoreWorkspaceWindow("settings");
      dialog.current.showModal();
      dialog.current.focus({ preventScroll: true });
    } else dialog.current?.close();
  }, [open]);
  useWindowGeometry(dialog, "settings", open);
  useEffect(() => {
    if (!open || !pageWorkspace) return;
    const abort = new AbortController();
    void api<{ user: TeamUser; originalOwner: boolean }>("/team/me", { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setIdentity(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setIdentity(null);
      });
    return () => abort.abort();
  }, [open]);
  const refresh = async (client: "codex" | "gpt") => {
    if (running.current) return;
    running.current = true;
    setRefreshing(client);
    setNotice("");
    try {
      if (client === "codex") await onRefreshCodex();
      else {
        await Promise.all([api("/gpt/conversations?offset=0"), api("/gpt/projects")]);
        window.dispatchEvent(new Event(gptSettingsChanged));
      }
      setNotice("Списки обновлены.");
    } catch (e) {
      setNotice(messageOf(e));
    } finally {
      running.current = false;
      setRefreshing("");
    }
  };
  const pages: SettingsPage[] = [];
  const add = (
    id: string,
    title: string,
    parent: string | undefined,
    render: SettingsPage["render"],
    hint?: string,
    keywords?: string,
    icon?: SettingsPage["icon"],
  ) => pages.push({ id, title, parent, render, hint, keywords, icon });
  const links = (go: (id: string) => void, ids: string[]) =>
    ids.map((id) => {
      const p = pages.find((item) => item.id === id);
      return p ? (
        <SettingsLink key={id} title={p.title} hint={p.hint} onClick={() => go(id)} />
      ) : null;
    });
  add(
    "interface",
    "Интерфейс",
    undefined,
    (_, go) => links(go, ["appearance", "scale", "keys", "sound"]),
    "Внешний вид, управление и звук.",
    "",
    "settings",
  );
  add(
    "appearance",
    "Оформление",
    "interface",
    () => <AppearanceSettings theme={theme} onTheme={onTheme} />,
    "Тема, вариант и цвет корпуса.",
    "зеленая 2000 органайзер тёмная",
  );
  add(
    "scale",
    "Текст и масштаб",
    "interface",
    () => <PersonalScaleSettings />,
    "Размер текста и элементов.",
    "шрифт размер",
  );
  add(
    "keys",
    "Клавиши и поведение",
    "interface",
    (_, go) => (
      <>
        <LayoutPreference />
        {links(go, ["shortcuts"])}
      </>
    ),
    "Компоновка и управление.",
  );
  add(
    "shortcuts",
    "Сочетания клавиш",
    "keys",
    (visible) => <ShortcutSettings visible={visible} />,
    undefined,
    "горячие клавиши назначить сброс",
  );
  add(
    "sound",
    "Озвучивание и уведомления",
    "interface",
    (visible) => (
      <>
        <SpeechSettings />
        <Notifications visible={visible} />
      </>
    ),
    "Голос ответа и события.",
    "звук подписка push",
  );
  add(
    "connections",
    "Подключения",
    undefined,
    (_, go) => (
      <>
        <h4 className="settings-group-title">Мои устройства</h4>
        {machines
          .filter((m) => m.type !== "server-workspace")
          .map((m) => (
            <SettingsLink
              key={m.id}
              title={m.name}
              hint={m.type === "ssh-windows" ? "Windows · личные проекты" : "Linux · проекты"}
              icon="remote"
              onClick={() => go("machine:" + m.id)}
            />
          ))}
        {pageWorkspace && links(go, ["workspace", "enrollment"])}
        <h4 className="settings-group-title">Сервисы</h4>
        {links(go, ["codex", "gpt"])}
      </>
    ),
    "Устройства и аккаунты, которыми ты пользуешься.",
    "компьютеры",
    "remote",
  );
  for (const m of machines)
    add(
      "machine:" + m.id,
      m.name,
      "connections",
      (visible, go) => (
        <>
          <MachineHealthPanel
            embedded
            machineId={m.id}
            open={visible}
            onClose={() => {}}
            onProject={onMachineProject}
          />
          <div className="settings-actions">
            <button type="button" className="secondary" onClick={() => openTerminal(m.id)}>
              Открыть терминал
            </button>
          </div>
          <SettingsLink
            title="Codex на этом компьютере"
            hint="Лимиты и управление"
            onClick={() => {
              setMachineId(m.id);
              go("codex");
            }}
          />
          {pageWorkspace && <TeamMachines visible={visible} mode="machine" machineId={m.id} />}
        </>
      ),
      m.type === "ssh-windows" ? "Windows" : "Linux",
      "готовность компоненты диагностика проекты",
    );
  if (pageWorkspace) {
    add(
      "workspace",
      "Моё серверное окружение",
      "connections",
      (visible, go) => (
        <>
          <TeamMachines visible={visible} mode="workspace" />
          {machines.some((m) => m.id === "server-workspace") &&
            links(go, ["machine:server-workspace"])}
        </>
      ),
      "Личный Linux для файлов, проектов и Codex.",
    );
    add(
      "enrollment",
      "Добавить компьютер",
      "connections",
      (visible) => <TeamMachines visible={visible} mode="enrollment" />,
      "Установщик Windows и продолжение подключения.",
      "companion установить подключить",
    );
  }
  add(
    "codex",
    "Codex",
    "connections",
    (_, go) => (
      <>
        <label className="settings-machine-choice">
          Компьютер
          <select value={machine?.id ?? ""} onChange={(e) => setMachineId(e.target.value)}>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {links(go, ["limits", "tools", "codex-control"])}
      </>
    ),
    "Аккаунт, лимиты и инструменты.",
  );
  add(
    "limits",
    "Лимиты и кредиты",
    "codex",
    (visible) => (
      <UsageLimitsProvider machines={selectedMachines} open={visible}>
        <UsageLimits machines={selectedMachines} open={visible} />
      </UsageLimitsProvider>
    ),
    machine?.name,
    "квота сброс баланс",
  );
  add(
    "tools",
    "Инструменты проекта",
    "codex",
    (visible) => (
      <NativeInventory projectId={project?.id ?? ""} threadId={threadId} visible={visible} />
    ),
    project
      ? `${project.name} · ${project.machineName}`
      : "Сначала выбери проект в рабочей области.",
    "навыки плагины MCP skills plugins",
  );
  add(
    "codex-control",
    "Управление Codex",
    "codex",
    (visible) => (
      <>
        {machine?.desktopRestartAvailable ? (
          <DesktopControl
            machines={selectedMachines}
            open={visible}
            threadId={threadId}
            machineId={project?.machineId}
          />
        ) : (
          <p className="muted">
            У этой машины нет настольного клиента. Вход и команды доступны в её терминале.
          </p>
        )}
      </>
    ),
    machine?.name,
    "открыть передать управление перезапуск",
  );
  add(
    "gpt",
    "ChatGPT",
    "connections",
    (visible, go) => (
      <>
        <GptConnectionSettings visible={visible} />
        {pageWorkspace && <TeamGpt visible={visible} />}
        {links(go, ["doctor"])}
      </>
    ),
    "Твой личный аккаунт.",
    "GPT вход подключение",
  );
  add(
    "doctor",
    "Bridge Doctor",
    "gpt",
    (visible) => <BridgeDoctorPanel open={visible} onTarget={onTarget} />,
    "Диагностика и восстановление подключения ChatGPT.",
    "доктор ремонт журнал",
  );
  add(
    "data",
    "История и данные",
    undefined,
    (_, go) => (
      <>
        {links(go, ["archives", "lists", "storage"])}
        <SettingsLink
          title="Активность текущего диалога"
          hint={threadId ? "Codex · текущий диалог" : "Сначала выбери диалог Codex"}
          onClick={() => {
            if (threadId) onActivity();
          }}
        />
      </>
    ),
    "Диалоги, недавние места и хранилище.",
    "",
    "folder",
  );
  add(
    "archives",
    "Архивы",
    "data",
    () => (
      <div className="settings-actions">
        <EntityArchive client="codex" />
        <EntityArchive client="gpt" />
      </div>
    ),
    "Диалоги Codex и GPT.",
  );
  add(
    "lists",
    "Списки и недавние места",
    "data",
    () => (
      <>
        <div className="settings-actions">
          {(["codex", "gpt"] as const).map((client) => (
            <button
              key={client}
              type="button"
              className="secondary"
              disabled={!!refreshing}
              onClick={() => void refresh(client)}
            >
              Обновить список {client === "codex" ? "Codex" : "GPT"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void changeNavigation({ action: "clear" })
              .then(() => setNotice("Недавние места очищены."))
              .catch((e) => setNotice(messageOf(e)))
          }
        >
          Очистить недавние места
        </button>
        {notice && <p role="status">{notice}</p>}
      </>
    ),
    "Обновление списков и локальная история переходов.",
    "очистить обновить",
  );
  add(
    "storage",
    "Хранилище",
    "data",
    (visible) => <StorageUsage visible={visible} />,
    "Объёмы, бюджеты и рабочие копии.",
    "место диск",
  );
  add(
    "maintenance",
    "Обновления и диагностика",
    undefined,
    (_, go) => (
      <>
        {links(go, ["updates"])}
        {machines.map((m) => (
          <SettingsLink
            key={m.id}
            title={`Диагностика: ${m.name}`}
            onClick={() => go("machine:" + m.id)}
          />
        ))}
        {links(go, ["doctor"])}
        <SettingsLink title="Обзор всех компьютеров" onClick={onMachines} />
      </>
    ),
    "Установка AbyssDeck и состояние подключений.",
    "",
    "activity",
  );
  add(
    "updates",
    "Обновления AbyssDeck",
    "maintenance",
    (visible) => <DeploymentStatus open={visible} />,
    "Установка Hub, версии и ожидающие обновления.",
    "версия установка обновить",
  );
  add(
    "account",
    "Мой аккаунт",
    undefined,
    (_, go) => (
      <>
        {identity && (
          <p>
            {identity.user.name} · {identity.user.login}
            <br />
            <span className="muted">
              {identity.originalOwner
                ? "Владелец установки"
                : identity.user.role === "admin"
                  ? "Администратор"
                  : "Участник"}
            </span>
          </p>
        )}
        {links(go, ["account-access", "install"])}
        {identity && !identity.originalOwner && (
          <button
            type="button"
            className="secondary"
            onClick={() => window.dispatchEvent(new Event(openMemberSetup))}
          >
            Продолжить настройку
          </button>
        )}
      </>
    ),
    "Личные настройки входа.",
    "",
    "person",
  );
  add(
    "account-access",
    "Пароль и вход",
    "account",
    (visible) => <AccountControls visible={visible} onSession={onSession} onLogout={onLogout} />,
    "Смена пароля, выход и завершение собственных сеансов.",
    "сменить пароль выйти устройства",
  );
  add(
    "install",
    "Установить веб-приложение",
    "account",
    () => (
      <p>
        На iPhone и iPad: Поделиться → На экран «Домой». На компьютере используй действие установки
        приложения в браузере.
      </p>
    ),
    "AbyssDeck на твоём устройстве.",
    "PWA",
  );
  if (identity?.user.role === "admin") {
    add(
      "people",
      "Пользователи и доступ",
      undefined,
      (_, go) => links(go, ["members", "invitations", "reviews", "audit"]),
      "Управление участниками установки.",
      "",
      "people",
    );
    pages[pages.length - 1]!.admin = true;
    add(
      "members",
      "Участники",
      "people",
      (visible) => <TeamAccess visible={visible} view="members" />,
      "Роли, доступ и восстановление входа.",
    );
    add(
      "invitations",
      "Приглашения",
      "people",
      (visible) => <TeamAccess visible={visible} view="invitations" />,
      "Новые участники и ожидающие приглашения.",
    );
    add("reviews", "Подтверждение компьютеров", "people", (visible) => (
      <TeamMachines visible={visible} mode="reviews" />
    ));
    add("audit", "История доступа", "people", (visible) => (
      <TeamAccess visible={visible} view="audit" />
    ));
  }
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="settings-dialog settings-browser"
      aria-label="Настройки"
      onCancel={(e) => {
        e.preventDefault();
        dismiss(onClose);
      }}
    >
      <SettingsSections
        open={open}
        onClose={() => dismiss(onClose)}
        pages={pages}
        overview={(visible, go) =>
          machine && (
            <div className="settings-usage-summary" hidden={!visible}>
              {machines.length > 1 && (
                <label className="settings-machine-choice">
                  Лимиты для устройства
                  <select value={machine.id} onChange={(e) => setMachineId(e.target.value)}>
                    {machines.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <UsageLimitsProvider machines={selectedMachines} open={visible}>
                <UsageLimits machines={selectedMachines} open={false} />
              </UsageLimitsProvider>
              <SettingsLink title="Лимиты и кредиты" onClick={() => go("limits")} />
            </div>
          )
        }
      />
    </dialog>
  );
}
