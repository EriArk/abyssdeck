type Entry = {
  id: number;
  key: string;
  dialog: HTMLDialogElement;
  parent?: Entry;
  title: string;
  group?: Entry[];
  scroll?: { element: Element; x: number; y: number }[];
  focus?: HTMLElement;
};
const entries = new Map<HTMLDialogElement, Entry>();
const listeners = new Set<() => void>();
let nextId = 0;
let snapshot: Entry[] = [];
const publish = () => {
  snapshot = [...entries.values()].filter((entry) => entry.group);
  for (const listener of listeners) listener();
};
export const subscribeDock = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const dockSnapshot = () => snapshot;
const titleOf = (dialog: HTMLDialogElement) => {
  const heading = dialog.querySelector(":scope > header, .settings-heading");
  const title = heading?.querySelector("strong, h1, h2, h3")?.textContent?.trim();
  const context = heading?.querySelector("small")?.textContent?.trim();
  return [title || dialog.getAttribute("aria-label") || "Окно", context]
    .filter(Boolean)
    .join(" · ");
};

export function restoreDockWindow(entry: Entry) {
  const group = entry.group;
  if (!group) return;
  entry.group = undefined;
  for (const item of group) {
    if (!entries.has(item.dialog) || !item.dialog.isConnected) continue;
    delete item.dialog.dataset.windowMinimized;
    if (!item.dialog.open) item.dialog.showModal();
    for (const saved of item.scroll || []) {
      saved.element.scrollLeft = saved.x;
      saved.element.scrollTop = saved.y;
    }
  }
  const top = group.at(-1);
  if (top?.dialog.open) {
    const target = top.focus?.isConnected ? top.focus : top.dialog;
    target.focus({ preventScroll: true });
  }
  publish();
}

/** Restore an already mounted tool when its ordinary launcher is used again. */
export function restoreWorkspaceWindow(key: string, source?: string) {
  const entry = snapshot.find((item) =>
    item.group?.some(
      (part) => part.key === key && (!source || part.dialog.dataset.windowSource === source),
    ),
  );
  if (!entry) return false;
  restoreDockWindow(entry);
  return true;
}

export function registerDockWindow(dialog: HTMLDialogElement, key: string) {
  const heading = dialog.querySelector<HTMLElement>(":scope > header, .settings-heading");
  if (!heading) return () => {};
  const parent = [...entries.values()]
    .filter((item) => item.dialog.open && item.dialog !== dialog)
    .at(-1);
  const entry: Entry = { id: ++nextId, dialog, key, parent, title: titleOf(dialog) };
  entries.set(dialog, entry);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button window-minimize";
  button.setAttribute("aria-label", "Свернуть окно");
  button.title = "Свернуть в док";
  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  button.append(mark);
  const close = [...heading.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    /закрыть/i.test(b.getAttribute("aria-label") || ""),
  );
  (close?.parentElement || heading).insertBefore(button, close || null);
  let suppressedCloses = 0;
  const suppressClose = (event: Event) => {
    if (!suppressedCloses) return;
    suppressedCloses--;
    event.stopImmediatePropagation();
  };
  dialog.addEventListener("close", suppressClose, true);
  const minimize = () => {
    if (innerWidth <= 600 || !dialog.open) return;
    const group: Entry[] = [];
    let current: Entry | undefined = entry;
    while (current && entries.has(current.dialog) && current.dialog.open) {
      group.unshift(current);
      current = current.parent;
    }
    entry.title = titleOf(dialog);
    entry.group = group;
    for (const item of group) {
      item.scroll = [item.dialog, ...item.dialog.querySelectorAll("*")]
        .filter((element) => element.scrollTop || element.scrollLeft)
        .map((element) => ({ element, x: element.scrollLeft, y: element.scrollTop }));
      item.focus =
        document.activeElement instanceof HTMLElement &&
        item.dialog.contains(document.activeElement)
          ? document.activeElement
          : undefined;
      item.dialog.dataset.windowMinimized = "true";
    }
    // Native close releases top-layer inertness, not the owner's close handler.
    // All React contents and terminal connections remain mounted.
    for (const item of [...group].reverse())
      item.dialog.dispatchEvent(new Event("workspace-minimize"));
    publish();
    window.dispatchEvent(new CustomEvent("workspace-dock-focus", { detail: entry.id }));
  };
  const nativeMinimize = () => {
    suppressedCloses++;
    dialog.close();
  };
  dialog.addEventListener("workspace-minimize", nativeMinimize);
  button.addEventListener("click", minimize);
  const renamed = new MutationObserver(() => {
    const title = titleOf(dialog);
    if (title !== entry.title) {
      entry.title = title;
      if (entry.group) publish();
    }
  });
  renamed.observe(heading, { childList: true, subtree: true, characterData: true });
  return () => {
    renamed.disconnect();
    button.remove();
    dialog.removeEventListener("close", suppressClose, true);
    dialog.removeEventListener("workspace-minimize", nativeMinimize);
    entries.delete(dialog);
    delete dialog.dataset.windowMinimized;
    // Ancestor removal is an actual source teardown, never a detached resurrection.
    for (const item of entries.values()) {
      if (item.group?.includes(entry)) {
        item.group = item.group.filter((part) => part !== entry);
        if (!item.group.length) item.group = undefined;
      }
    }
    publish();
  };
}
