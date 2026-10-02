import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { dockSnapshot, restoreDockWindow, subscribeDock } from "./workspaceWindowRegistry";
import "./window-dock.css";

const iconFor = (key: string) =>
  key === "devices"
    ? "terminal"
    : key.includes("git")
      ? "branch"
      : key.includes("files")
        ? "folder"
        : key.includes("file")
          ? "file"
          : key === "settings"
            ? "settings"
            : key === "help"
              ? "help"
              : key.includes("notes")
                ? "note-edit"
                : key.includes("task")
                  ? "check"
                  : key.includes("schedule")
                    ? "schedule"
                    : "chat";

export function WindowDock() {
  const windows = useSyncExternalStore(subscribeDock, dockSnapshot);
  const [folded, setFolded] = useState(false);
  const dock = useRef<HTMLElement>(null);
  const [hint, setHint] = useState<{ title: string; x: number; y: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const clearHold = () => {
    clearTimeout(hold.current);
    hold.current = undefined;
  };
  const showHint = (button: HTMLButtonElement, title: string) => {
    const box = button.getBoundingClientRect();
    setHint({ title, x: Math.min(box.right + 10, innerWidth - 280), y: box.top });
  };
  useEffect(() => () => clearTimeout(hold.current), []);
  useEffect(() => {
    const narrow = () => {
      if (innerWidth <= 600) for (const entry of [...dockSnapshot()]) restoreDockWindow(entry);
    };
    const focus = (event: Event) => {
      setFolded(false);
      const id = (event as CustomEvent<number>).detail;
      requestAnimationFrame(() =>
        dock.current
          ?.querySelector<HTMLButtonElement>(`[data-dock-id="${id}"]`)
          ?.focus({ preventScroll: true }),
      );
    };
    window.addEventListener("resize", narrow);
    window.addEventListener("workspace-dock-focus", focus);
    narrow();
    return () => {
      window.removeEventListener("resize", narrow);
      window.removeEventListener("workspace-dock-focus", focus);
    };
  }, []);
  useLayoutEffect(() => {
    if (!windows.length) return;
    let frame = 0;
    const position = () => {
      const header = [
        ...document.querySelectorAll<HTMLElement>(".workspace > .workspace-header"),
      ].find((el) => el.getClientRects().length);
      if (!dock.current || !header) return;
      const rect = header.getBoundingClientRect();
      const workspace = header.closest(".workspace");
      if (!workspace) return;
      const composer = workspace.querySelector(".composer, .gpt-composer-wrap");
      const bottom =
        composer?.getBoundingClientRect().top || window.visualViewport?.height || innerHeight;
      dock.current.style.left = `${rect.left + 4}px`;
      dock.current.style.top = `${rect.bottom + 10}px`;
      dock.current.style.maxHeight = `${Math.max(54, bottom - rect.bottom - 22)}px`;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    const resize = new ResizeObserver(schedule);
    document
      .querySelectorAll(".workspace,.workspace-header,.desktop-nav,.composer,.gpt-composer-wrap")
      .forEach((el) => {
        resize.observe(el);
      });
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    position();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [windows.length]);
  if (!windows.length) return null;
  return (
    <aside ref={dock} className="window-dock" data-folded={folded} aria-label="Свёрнутые окна">
      {folded ? (
        <button
          type="button"
          className="window-dock-tab"
          aria-label={`Развернуть док: ${windows.length} окон`}
          title="Развернуть док"
          onClick={() => setFolded(false)}
        >
          <Icon name="chevron" size={16} />
          <span>{windows.length}</span>
        </button>
      ) : (
        <>
          <div className="window-dock-cap" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="window-dock-slots">
            {windows.map((entry) => (
              <button
                key={entry.id}
                data-dock-id={entry.id}
                type="button"
                className="window-dock-slot"
                aria-label={`Восстановить: ${entry.title}`}
                onMouseEnter={(event) => showHint(event.currentTarget, entry.title)}
                onMouseLeave={() => {
                  clearHold();
                  setHint(null);
                }}
                onFocus={(event) => showHint(event.currentTarget, entry.title)}
                onBlur={() => setHint(null)}
                onPointerDown={(event) => {
                  clearHold();
                  held.current = false;
                  if (event.pointerType === "mouse") return;
                  const button = event.currentTarget;
                  hold.current = setTimeout(() => {
                    held.current = true;
                    showHint(button, entry.title);
                  }, 450);
                }}
                onPointerUp={clearHold}
                onPointerCancel={() => {
                  clearHold();
                  setHint(null);
                }}
                onClick={() => {
                  clearHold();
                  if (held.current) {
                    held.current = false;
                    return;
                  }
                  setHint(null);
                  restoreDockWindow(entry);
                }}
              >
                <Icon name={iconFor(entry.key)} size={21} />
                <span className="window-dock-pip" aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="window-dock-fold"
            aria-label="Убрать док к перегородке"
            title="Убрать док"
            onClick={() => setFolded(true)}
          >
            <Icon name="back" size={16} />
          </button>
        </>
      )}
      {hint && !folded && (
        <span className="window-dock-hint" role="tooltip" style={{ left: hint.x, top: hint.y }}>
          {hint.title}
        </span>
      )}
    </aside>
  );
}
