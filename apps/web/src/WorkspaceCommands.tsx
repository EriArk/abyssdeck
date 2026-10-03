import {
  destinationKey,
  effectiveShortcuts,
  type NavigationPreferences,
  type NotebookLink,
  normalizeShortcut,
  type ShortcutOverrides,
  shortcutOverridesSchema,
  type WorkspaceAction,
  type WorkspaceDestinationItem,
  type WorkspaceDestinationRef,
  workspaceActions,
} from "@codex-web/shared";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { accountLocalStorage, pageWorkspace } from "./accountStorage";
import { api, messageOf } from "./api";
import { openContentSearch } from "./ContentSearch";
import { Icon } from "./icons";
import "./workspace-commands.css";

type Actions = Partial<Record<WorkspaceAction, () => void>>;
type Source = {
  actions: Actions;
  client: "codex" | "gpt";
  projectId?: string;
  destinations?: WorkspaceDestinationItem[];
  open?: (item: WorkspaceDestinationItem) => void;
};
type Preferences = NavigationPreferences & {
  shortcuts: ShortcutOverrides;
  shortcutWarning?: string;
};
const sources = new Map<string, Source>();
const listeners = new Set<() => void>();
let revision = 0;
const notify = () => {
  revision++;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => revision;
const useChanges = () => useSyncExternalStore(subscribe, snapshot);
let preferences: Preferences = { recent: [], pinned: [], shortcuts: {} };
let destinations: WorkspaceDestinationItem[] = [];
let sharedDestinations: WorkspaceDestinationItem[] = [];
let navigationError = "";
let refreshId = 0;
let metadataRevision = 0;
let mutationGeneration = 0;
let preferencesReady = false;
let mutationQueue: Promise<unknown> = Promise.resolve();
export function useWorkspaceCommandSource(id: string, source: Source | null) {
  const key = id + "|" + useId();
  const signature = JSON.stringify(
    source && [source.client, source.projectId, Object.keys(source.actions), source.destinations],
  );
  useLayoutEffect(() => {
    if (source) sources.set(key, source);
    else sources.delete(key);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: Notify metadata changes, not each new callback closure.
  useLayoutEffect(() => {
    notify();
  }, [signature]);
  useLayoutEffect(
    () => () => {
      sources.delete(key);
      notify();
    },
    [key],
  );
}
function findSource(id: string) {
  return Array.from(sources).find(([key]) => key.startsWith(id + "|"))?.[1];
}
function currentSource() {
  return findSource("gpt") ?? findSource("codex");
}
function action(id: WorkspaceAction) {
  return currentSource()?.actions[id] ?? findSource("global")?.actions[id];
}
function allDestinations() {
  const all = [
    ...destinations,
    ...sharedDestinations,
    ...Array.from(sources.values()).flatMap((s) => s.destinations ?? []),
  ];
  return [...new Map(all.map((d) => [destinationKey(d.ref), d])).values()];
}
async function refresh() {
  const version = ++refreshId,
    generation = mutationGeneration;
  const results = await Promise.allSettled([
    api<Preferences>("/workspace/navigation", { signal: AbortSignal.timeout(5000) }),
    api<{ items: WorkspaceDestinationItem[] }>("/workspace/destinations", {
      signal: AbortSignal.timeout(5000),
    }),
  ]);
  if (version !== refreshId) return;
  if (results[0].status === "fulfilled" && generation === mutationGeneration) {
    preferences = results[0].value;
    preferencesReady = true;
  }
  if (results[1].status === "fulfilled") destinations = results[1].value.items;
  else destinations = []; // Do not expose old names when authority cannot be revalidated.
  metadataRevision++;
  notify();
  if (!pageWorkspace) return;
  const shared = await Promise.allSettled([
    api<{ spaces: { id: string; title: string }[] }>("/team/spaces", {
      signal: AbortSignal.timeout(5000),
    }),
    api<{ rooms: { id: string; title: string }[] }>("/team/brainstorm", {
      signal: AbortSignal.timeout(5000),
    }),
    api<{ items: { id: string; title: string }[] }>("/team/conversations", {
      signal: AbortSignal.timeout(5000),
    }),
  ]);
  if (version !== refreshId) return;
  sharedDestinations = [];
  if (shared[0].status === "fulfilled")
    for (const s of shared[0].value.spaces) {
      sharedDestinations.push({
        ref: { client: "shared", kind: "space", id: s.id },
        title: s.title,
        subtitle: "Пространство",
      });
      sharedDestinations.push({
        ref: { client: "shared", kind: "activity", id: s.id },
        title: s.title,
        subtitle: "Активность пространства",
      });
    }
  if (shared[1].status === "fulfilled")
    for (const r of shared[1].value.rooms)
      sharedDestinations.push({
        ref: { client: "shared", kind: "brainstorm", id: r.id },
        title: r.title,
        subtitle: "Брейншторм",
      });
  if (shared[2].status === "fulfilled")
    for (const c of shared[2].value.items)
      sharedDestinations.push({
        ref: { client: "shared", kind: "conversation", id: c.id },
        title: c.title,
        subtitle: "Общение",
      });
  sharedDestinations = sharedDestinations.slice(0, 300);
  metadataRevision++;
  notify();
}
export function changeNavigation(body: unknown) {
  mutationGeneration++;
  const task = mutationQueue
    .catch(() => {})
    .then(async () => {
      preferences = await api<Preferences>("/workspace/navigation", { method: "PATCH", body });
      navigationError = "";
      notify();
    });
  mutationQueue = task;
  return task;
}
export function rememberDestination(ref: WorkspaceDestinationRef) {
  // Called only by meaningful explicit navigation, never a restored selection/poll.
  void changeNavigation({ action: "visit", ref }).catch(() => {});
}
export function openCommands() {
  window.dispatchEvent(new Event("workspace-command-palette"));
}
export function CommandEntry() {
  useChanges();
  const binding = effectiveShortcuts(preferences.shortcuts).palette;
  return (
    <button type="button" className="command-entry" onClick={openCommands}>
      <Icon name="search" size={17} />
      <span>Поиск и команды</span>
      {binding && <kbd>{binding.replace("Primary", "Ctrl / ⌘").replaceAll("Key", "")}</kbd>}
    </button>
  );
}
async function openDestination(ref: WorkspaceDestinationRef) {
  // Refresh metadata before following a stored destination. Existing viewers recheck access too.
  await refresh();
  const checked =
    ref.client === "shared"
      ? []
      : (
          await api<{ items: WorkspaceDestinationItem[] }>(
            "/workspace/destinations?" + new URLSearchParams({ id: ref.id, client: ref.client }),
          )
        ).items;
  const item = [...checked, ...allDestinations().filter((d) => d.ref.client === "shared")].find(
    (d) => destinationKey(d.ref) === destinationKey(ref),
  );
  if (!item) throw new Error("Это место больше недоступно.");
  const source = ref.client === "shared" ? findSource("shared") : findSource("global");
  if (!source?.open) return;
  source.open(item);
  rememberDestination(ref);
}
export function NavigationPlaces() {
  useChanges();
  const [collapsed, setCollapsed] = useState(
    () => accountLocalStorage.getItem("workspace-places-collapsed") === "true",
  );
  const available = new Map(allDestinations().map((d) => [destinationKey(d.ref), d]));
  const pinned = new Set(preferences.pinned.map(destinationKey));
  const items = [
    ...preferences.pinned,
    ...preferences.recent.filter((r) => !pinned.has(destinationKey(r))),
  ]
    .map((r) => available.get(destinationKey(r)))
    .filter((r): r is WorkspaceDestinationItem => !!r)
    .slice(0, 8);
  if (!items.length) return null;
  return (
    <section className="navigation-places" aria-label="Недавнее и закреплённое">
      <button
        type="button"
        className="places-heading"
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed(!collapsed);
          accountLocalStorage.setItem("workspace-places-collapsed", String(!collapsed));
        }}
      >
        <Icon name="pin" size={15} />
        Недавнее / закреплённое
        <Icon name="chevron" size={14} />
      </button>
      {!collapsed &&
        items.map((item) => (
          <div className="place-row" key={destinationKey(item.ref)}>
            <button
              type="button"
              onClick={() =>
                void openDestination(item.ref).catch((e) => {
                  navigationError = messageOf(e);
                  notify();
                })
              }
            >
              <span>{item.title}</span>
              <small>{item.subtitle}</small>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`${pinned.has(destinationKey(item.ref)) ? "Открепить" : "Закрепить"}: ${item.title}`}
              aria-pressed={pinned.has(destinationKey(item.ref))}
              onClick={() =>
                void changeNavigation({
                  action: "pin",
                  ref: item.ref,
                  value: !pinned.has(destinationKey(item.ref)),
                }).catch((e) => {
                  navigationError = messageOf(e);
                  notify();
                })
              }
            >
              <Icon name="pin" size={16} />
            </button>
          </div>
        ))}
      {navigationError && <small role="status">{navigationError}</small>}
    </section>
  );
}
export function eventShortcut(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.repeat ||
    event.getModifierState("AltGraph") ||
    /^(Control|Meta|Alt|Shift)/.test(event.code)
  )
    return null;
  const apple = /Mac|iPhone|iPad/.test(navigator.platform);
  if ((apple && event.ctrlKey) || (!apple && event.metaKey)) return null;
  const primary = apple ? event.metaKey : event.ctrlKey;
  return [
    ...(primary ? ["Primary"] : []),
    ...(event.altKey ? ["Alt"] : []),
    ...(event.shiftKey ? ["Shift"] : []),
    event.code,
  ].join("+");
}
const stateOpen = () => !!document.querySelector(".command-palette[open]");
function protectedSurface() {
  return (
    !!document.activeElement?.closest(
      '[data-help-keys="remote"], .remote-pane, .remote-view, .remote-session, .xterm, .cm-editor, .monaco-editor',
    ) ||
    Array.from(document.querySelectorAll(".remote-session")).some(
      (e) => e.getClientRects().length > 0,
    )
  );
}
export function WorkspaceCommandHost({ onTarget }: { onTarget: (target: NotebookLink) => void }) {
  useChanges();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void refresh();
    const show = () => {
      setOpen(true);
      void refresh();
    };
    const update = () => {
      if (!document.hidden) void refresh();
    };
    const keyboard = (e: KeyboardEvent) => {
      if (
        !preferencesReady ||
        e.defaultPrevented ||
        protectedSurface() ||
        document.querySelector('[data-shortcut-capture="true"]')
      )
        return;
      const binding = eventShortcut(e);
      if (!binding) return;
      const validated = shortcutOverridesSchema.safeParse(preferences.shortcuts);
      const bindings = effectiveShortcuts(validated.success ? validated.data : {});
      const match = workspaceActions.find((a) => bindings[a.id] === binding);
      if (!match) return;
      const input = document.activeElement?.closest(
        'input,textarea,select,[contenteditable="true"]',
      );
      if (input && !match.inputs) return;
      const modal = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
      if (
        modal &&
        match.id !== "help" &&
        !(match.id === "palette" && (modal.matches(".project-sheet") || stateOpen()))
      )
        return;
      const run =
        match.id === "palette"
          ? show
          : match.id === "help"
            ? () => window.dispatchEvent(new Event("workspace-command-help"))
            : action(match.id);
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("workspace-command-palette", show);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("focus", update);
    window.addEventListener("library-changed", update);
    const timer = window.setInterval(update, 30_000);
    return () => {
      refreshId++;
      clearInterval(timer);
      window.removeEventListener("workspace-command-palette", show);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("focus", update);
      window.removeEventListener("library-changed", update);
    };
  }, []);
  return open ? <CommandPalette onClose={() => setOpen(false)} onTarget={onTarget} /> : null;
}
function CommandPalette({
  onClose,
  onTarget,
}: {
  onClose: () => void;
  onTarget: (target: NotebookLink) => void;
}) {
  useChanges();
  const [query, setQuery] = useState(""),
    [all, setAll] = useState(false),
    [selected, setSelected] = useState(0),
    [error, setError] = useState("");
  const [matches, setMatches] = useState<WorkspaceDestinationItem[]>([]),
    [materials, setMaterials] = useState<{ target: NotebookLink; snippet: string }[]>([]),
    [moreMaterials, setMoreMaterials] = useState(false),
    [searching, setSearching] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const source = currentSource(),
    sourceClient = source?.client,
    sourceProject = source?.projectId;
  const catalogRevision = metadataRevision;
  useEffect(() => {
    const focus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    input.current?.focus({ preventScroll: true });
    return () => {
      dialog.current?.close();
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revalidate search results after current authority/catalog refresh.
  useEffect(() => {
    setSelected(0);
    setMatches([]);
    setMaterials([]);
    setMoreMaterials(false);
    setSearching(false);
    setError("");
    if (!query.trim()) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim() });
      if (!all && sourceClient) {
        params.set("client", sourceClient);
        if (sourceProject) params.set("projectId", sourceProject);
      }
      void api<{ items: WorkspaceDestinationItem[] }>("/workspace/destinations?" + params, {
        signal: abort.signal,
      })
        .then((r) => {
          if (!abort.signal.aborted) setMatches(r.items);
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(messageOf(e));
        });
      if ((all || sourceProject) && query.trim().length >= 2) {
        setSearching(true);
        const contentParams = new URLSearchParams({
          q: query.trim(),
          client: sourceClient ?? "codex",
          limit: "20",
        });
        if (!all && sourceProject) contentParams.set("projectId", sourceProject);
        void api<{ items: { target: NotebookLink; snippet: string }[]; nextOffset: number | null }>(
          "/workspace/search?" + contentParams,
          { signal: abort.signal },
        )
          .then((r) => {
            if (!abort.signal.aborted) {
              setMaterials(r.items);
              setMoreMaterials(r.nextOffset !== null);
            }
          })
          .catch((e) => {
            if (!abort.signal.aborted) setError(messageOf(e));
          })
          .finally(() => {
            if (!abort.signal.aborted) setSearching(false);
          });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, all, sourceClient, sourceProject, catalogRevision]);
  const term = query.toLocaleLowerCase().trim();
  const pins = new Set(preferences.pinned.map(destinationKey));
  const known = new Map(allDestinations().map((d) => [destinationKey(d.ref), d]));
  const zero = [
    ...preferences.pinned,
    ...preferences.recent.filter((r) => !pins.has(destinationKey(r))),
  ]
    .map((r) => known.get(destinationKey(r)))
    .filter((r): r is WorkspaceDestinationItem => !!r);
  const shared = all
    ? allDestinations().filter(
        (d) => d.ref.client === "shared" && d.title.toLocaleLowerCase().includes(term),
      )
    : [];
  const targets = (term ? [...matches, ...shared] : zero).slice(0, 40);
  const rows: {
    key: string;
    title: string;
    detail: string;
    run: () => void | Promise<void>;
    ref?: WorkspaceDestinationRef;
  }[] = [
    ...workspaceActions
      .filter(
        (a) =>
          a.id !== "palette" &&
          (a.id === "help" || !!action(a.id)) &&
          a.label.toLocaleLowerCase().includes(term),
      )
      .map((a) => ({
        key: a.id,
        title: a.label,
        detail: "Действие",
        run: () => {
          if (a.id === "help") window.dispatchEvent(new Event("workspace-command-help"));
          else action(a.id)?.();
        },
      })),
    ...targets.map((d) => ({
      key: destinationKey(d.ref),
      title: d.title,
      detail: d.subtitle,
      ref: d.ref,
      run: () => openDestination(d.ref),
    })),
    ...materials.map((m, i) => ({
      key: "material:" + i,
      title: m.target.title,
      detail: m.snippet,
      run: () => onTarget(m.target),
    })),
    ...(term.length >= 2
      ? [
          {
            key: "search-details",
            title: moreMaterials
              ? "Продолжить поиск по содержимому"
              : "Подробный поиск по содержимому",
            detail: "Выбрать тип материала и просмотреть следующие совпадения",
            run: () => {
              openContentSearch({
                client: sourceClient ?? "codex",
                projectId: all ? undefined : sourceProject,
                query,
              });
            },
          },
        ]
      : []),
  ];
  if (!term) rows.sort((a, b) => Number(!!b.ref) - Number(!!a.ref));
  const run = async (index: number) => {
    const row = rows[index];
    if (!row) return;
    try {
      await row.run();
      onClose();
    } catch (e) {
      setError(messageOf(e));
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="workspace-window command-palette"
      aria-label="Поиск и команды"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      onCancel={onClose}
    >
      <header>
        <Icon name="search" />
        <h2>Поиск и команды</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть поиск и команды"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="command-search">
        <input
          ref={input}
          type="search"
          value={query}
          maxLength={120}
          placeholder="Проект, диалог, файл или действие…"
          aria-label="Найти место или действие"
          role="combobox"
          aria-expanded="true"
          aria-controls="workspace-command-list"
          aria-activedescendant={
            rows.length ? `workspace-command-${Math.min(selected, rows.length - 1)}` : undefined
          }
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const next =
                (selected + (e.key === "ArrowDown" ? 1 : -1) + rows.length) %
                Math.max(1, rows.length);
              setSelected(next);
              document
                .getElementById(`workspace-command-${next}`)
                ?.scrollIntoView({ block: "nearest" });
            }
            if (e.key === "Enter") {
              e.preventDefault();
              void run(Math.min(selected, rows.length - 1));
            }
          }}
        />
        <label>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Все доступные места и содержимое
        </label>
      </div>
      <div
        className="command-list"
        id="workspace-command-list"
        role="listbox"
        aria-label="Команды и места"
      >
        {rows.map((row, index) => (
          <div className="command-row" key={row.key}>
            <button
              type="button"
              role="option"
              id={`workspace-command-${index}`}
              aria-selected={index === selected}
              onClick={() => void run(index)}
            >
              <strong>{row.title}</strong>
              <small>{row.detail}</small>
            </button>
            {row.ref && (
              <button
                type="button"
                className="icon-button"
                aria-label={`${pins.has(destinationKey(row.ref)) ? "Открепить" : "Закрепить"}: ${row.title}`}
                aria-pressed={pins.has(destinationKey(row.ref))}
                onClick={() =>
                  void changeNavigation({
                    action: "pin",
                    ref: row.ref,
                    value: !pins.has(destinationKey(row.ref!)),
                  }).catch((e) => setError(messageOf(e)))
                }
              >
                <Icon name="pin" size={17} />
              </button>
            )}
          </div>
        ))}
        {searching && <p role="status">Ищем в содержимом…</p>}
        {!rows.length && !searching && <p>Совпадений нет.</p>}
      </div>
      <footer>
        <small>
          {all
            ? "Все доступные места · первые совпадения из сохранённых материалов"
            : sourceProject
              ? "Текущий проект · действия и сохранённые материалы"
              : "Действия текущего пространства · недавние места"}
        </small>
        {error && <p role="alert">{error}</p>}
      </footer>
    </dialog>,
    document.body,
  );
}
export function ShortcutSettings({ visible = true }: { visible?: boolean }) {
  const captureRoot = useRef<HTMLElement>(null);
  useChanges();
  const [capture, setCapture] = useState<WorkspaceAction | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async (next: ShortcutOverrides) => {
    const parsed = shortcutOverridesSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверь сочетание");
      return;
    }
    setCapture(null);
    setBusy(true);
    setError("");
    try {
      await changeNavigation({ action: "shortcuts", value: parsed.data });
      setCapture(null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const callback = useRef(save);
  callback.current = save;
  useEffect(() => {
    if (!visible) {
      setCapture(null);
      return;
    }
    if (!capture) return;
    const key = (event: KeyboardEvent) => {
      if (!captureRoot.current?.contains(document.activeElement)) {
        setCapture(null);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setCapture(null);
        return;
      }
      const value = eventShortcut(event);
      if (!value) return;
      try {
        void callback.current({ ...preferences.shortcuts, [capture]: normalizeShortcut(value) });
      } catch (e) {
        setError(messageOf(e));
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [capture, visible]);
  const bindings = effectiveShortcuts(preferences.shortcuts);
  return (
    <section
      ref={captureRoot}
      className="shortcut-settings"
      data-shortcut-capture={capture ? "true" : "false"}
      aria-label="Горячие клавиши"
    >
      <h3>Горячие клавиши</h3>
      {preferences.shortcutWarning && <p role="status">{preferences.shortcutWarning}</p>}
      <p>
        Ctrl на Windows / Linux, ⌘ на Mac. Сочетания привязаны к физическим клавишам и сохраняются в
        твоём аккаунте.
      </p>
      {workspaceActions.map((a) => (
        <div className="shortcut-row" key={a.id}>
          <span>{a.label}</span>
          <button
            type="button"
            disabled={busy}
            className="secondary"
            onClick={() => {
              setError("");
              setCapture(a.id);
            }}
          >
            {capture === a.id
              ? "Нажми сочетание · Esc отмена"
              : (bindings[a.id]?.replace("Primary", "Ctrl / ⌘").replaceAll("Key", "") ??
                "Назначить")}
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={busy || bindings[a.id] === null}
            aria-label={`Убрать сочетание: ${a.label}`}
            onClick={() => void save({ ...preferences.shortcuts, [a.id]: null })}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      {capture && (
        <button type="button" className="secondary" onClick={() => setCapture(null)}>
          Отменить ввод
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="workspace-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void save({})}>
          Вернуть стандартные клавиши
        </button>
      </div>
    </section>
  );
}

export function ShortcutReference() {
  useChanges();
  const bindings = effectiveShortcuts(preferences.shortcuts);
  return (
    <dl className="shortcut-reference">
      {workspaceActions.map((a) => (
        <div key={a.id}>
          <dt>{a.label}</dt>
          <dd>
            {bindings[a.id]?.replace("Primary", "Ctrl / ⌘").replaceAll("Key", "") ?? "Не назначено"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
