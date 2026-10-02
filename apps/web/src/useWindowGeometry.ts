import { type RefObject, useEffect } from "react";
import { accountLocalStorage } from "./accountStorage";
import { registerDockWindow } from "./workspaceWindowRegistry";
import "./window-geometry.css";

type Box = { x: number; y: number; width: number; height: number };
const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
const interactive = "button, a, input, textarea, select, [contenteditable], [role=button]";
const instruction =
  "Переместить окно: потяни заголовок или используй стрелки. Shift + стрелки — размер. Home — сброс.";

/** Opt-in geometry only: native dialog, focus, close and operation lifecycles stay with the caller. */
export function useWindowGeometry(
  ref: RefObject<HTMLDialogElement | null>,
  key?: string,
  open = true,
) {
  useEffect(() => {
    const dialog = ref.current;
    if (!key || !open || !dialog) return;
    const heading = dialog.querySelector<HTMLElement>(":scope > header, .settings-heading");
    if (!heading) return;
    const unregisterDock = registerDockWindow(dialog, key);
    const storageKey = `codex-window:v1:${key}`;
    let preferred: Box | null = null;
    try {
      const b = JSON.parse(accountLocalStorage.getItem(storageKey) || "null");
      if (
        b &&
        [b.x, b.y, b.width, b.height].every(
          (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100000,
        ) &&
        b.width > 0 &&
        b.height > 0
      )
        preferred = b;
    } catch {}
    const viewport = () => {
      const v = window.visualViewport;
      return {
        x: (v?.offsetLeft ?? 0) + 8,
        y: (v?.offsetTop ?? 0) + 8,
        width: Math.max(1, (v?.width ?? innerWidth) - 16),
        height: Math.max(1, (v?.height ?? innerHeight) - 16),
      };
    };
    const enabled = () => dialog.open && innerWidth > 600 && dialog.dataset.expanded !== "true";
    const read = (): Box => {
      const b = dialog.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const fit = (b: Box): Box => {
      const v = viewport(),
        width = Math.min(v.width, Math.max(640, b.width)),
        height = Math.min(v.height, Math.max(360, b.height));
      return {
        x: Math.max(v.x, Math.min(v.x + v.width - width, b.x)),
        y: Math.max(v.y, Math.min(v.y + v.height - height, b.y)),
        width,
        height,
      };
    };
    const apply = (b: Box) => {
      dialog.dataset.windowPositioned = "true";
      for (const name of ["x", "y", "width", "height"] as const)
        dialog.style.setProperty(`--window-${name}`, `${b[name]}px`);
    };
    const clear = () => {
      delete dialog.dataset.windowPositioned;
      for (const name of ["x", "y", "width", "height"])
        dialog.style.removeProperty(`--window-${name}`);
    };
    const save = () => {
      preferred = read();
      try {
        accountLocalStorage.setItem(storageKey, JSON.stringify(preferred));
      } catch {}
    };
    const oldTabIndex = heading.getAttribute("tabindex"),
      oldTitle = heading.getAttribute("title");
    const grips = directions.map((direction) => {
      const grip = document.createElement("button");
      grip.type = "button";
      grip.className = "window-resize-grip";
      grip.dataset.direction = direction;
      grip.tabIndex = direction === "se" ? 0 : -1;
      grip.setAttribute("aria-label", "Изменить размер окна");
      grip.title =
        "Размер окна: потяни край или угол. Стрелки — размер, Alt + стрелки — положение. Home — сброс.";
      dialog.append(grip);
      return grip;
    });
    let drag: {
      pointer: number;
      target: HTMLElement;
      x: number;
      y: number;
      box: Box;
      direction: string;
    } | null = null;
    const finish = (commit: boolean) => {
      const start = drag;
      if (!start) return;
      drag = null;
      delete dialog.dataset.windowDragging;
      if (commit) {
        const end = read();
        if (
          (["x", "y", "width", "height"] as const).some(
            (name) => Math.abs(end[name] - start.box[name]) > 0.5,
          )
        )
          save();
      } else apply(start.box);
      if (start.target.hasPointerCapture(start.pointer))
        start.target.releasePointerCapture(start.pointer);
    };
    const refresh = () => {
      finish(false);
      if (dialog.dataset.windowMinimized === "true") return;
      const active = enabled();
      dialog.dataset.windowMovable = String(active);
      for (const grip of grips) grip.hidden = !active;
      if (active) {
        heading.tabIndex = 0;
        heading.title = instruction;
        // Remove only our overrides before measuring the CSS default. A viewport clamp is never saved.
        clear();
        apply(fit(preferred ?? read()));
      } else {
        clear();
        if (oldTabIndex === null) heading.removeAttribute("tabindex");
        else heading.setAttribute("tabindex", oldTabIndex);
        if (oldTitle === null) heading.removeAttribute("title");
        else heading.title = oldTitle;
      }
    };
    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const grip = target.closest<HTMLElement>(".window-resize-grip");
      const title = heading.contains(target) && !target.closest(interactive);
      if (
        drag ||
        !enabled() ||
        !event.isPrimary ||
        event.button !== 0 ||
        (!grip && !title) ||
        target.closest("dialog") !== dialog
      )
        return;
      event.preventDefault();
      const capture = grip || heading;
      capture.focus({ preventScroll: true });
      drag = {
        pointer: event.pointerId,
        target: capture,
        x: event.clientX,
        y: event.clientY,
        box: read(),
        direction: grip?.dataset.direction || "",
      };
      dialog.dataset.windowDragging = "true";
      capture.setPointerCapture(event.pointerId);
    };
    const resized = (b: Box, direction: string, dx: number, dy: number): Box => {
      const v = viewport(),
        minWidth = Math.min(640, v.width),
        minHeight = Math.min(360, v.height);
      let left = b.x,
        top = b.y,
        right = b.x + b.width,
        bottom = b.y + b.height;
      if (direction.includes("w")) left = Math.max(v.x, Math.min(right - minWidth, left + dx));
      if (direction.includes("e"))
        right = Math.min(v.x + v.width, Math.max(left + minWidth, right + dx));
      if (direction.includes("n")) top = Math.max(v.y, Math.min(bottom - minHeight, top + dy));
      if (direction.includes("s"))
        bottom = Math.min(v.y + v.height, Math.max(top + minHeight, bottom + dy));
      return { x: left, y: top, width: right - left, height: bottom - top };
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.pointer !== event.pointerId) return;
      const { box, direction, x, y } = drag,
        dx = event.clientX - x,
        dy = event.clientY - y;
      apply(
        direction ? resized(box, direction, dx, dy) : fit({ ...box, x: box.x + dx, y: box.y + dy }),
      );
    };
    const up = (event: PointerEvent) => {
      if (drag?.pointer === event.pointerId) finish(true);
    };
    const cancel = (event: PointerEvent) => {
      if (drag?.pointer === event.pointerId) finish(false);
    };
    const reset = () => {
      preferred = null;
      try {
        accountLocalStorage.removeItem(storageKey);
      } catch {}
      refresh();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag) {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        return;
      }
      const target = event.target as HTMLElement;
      if (!enabled() || (target !== heading && !grips.includes(target as HTMLButtonElement)))
        return;
      if (event.key === "Home") {
        event.preventDefault();
        reset();
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const b = read(),
        dx = event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0,
        dy = event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0;
      const resize = target === heading ? event.shiftKey : !event.altKey;
      apply(resize ? resized(b, "se", dx, dy) : fit({ ...b, x: b.x + dx, y: b.y + dy }));
      save();
    };
    const doubleClick = (event: MouseEvent) => {
      if (
        enabled() &&
        heading.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(interactive)
      )
        reset();
    };
    const observer = new MutationObserver(refresh);
    const blur = () => finish(false);
    observer.observe(dialog, { attributes: true, attributeFilter: ["open", "data-expanded"] });
    dialog.addEventListener("pointerdown", down);
    dialog.addEventListener("pointermove", move);
    dialog.addEventListener("pointerup", up);
    dialog.addEventListener("pointercancel", cancel);
    dialog.addEventListener("lostpointercapture", cancel);
    dialog.addEventListener("keydown", keyboard, true);
    heading.addEventListener("dblclick", doubleClick);
    window.addEventListener("resize", refresh);
    window.addEventListener("blur", blur);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    refresh();
    return () => {
      unregisterDock();
      finish(false);
      observer.disconnect();
      dialog.removeEventListener("pointerdown", down);
      dialog.removeEventListener("pointermove", move);
      dialog.removeEventListener("pointerup", up);
      dialog.removeEventListener("pointercancel", cancel);
      dialog.removeEventListener("lostpointercapture", cancel);
      dialog.removeEventListener("keydown", keyboard, true);
      heading.removeEventListener("dblclick", doubleClick);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("blur", blur);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
      for (const grip of grips) grip.remove();
      if (oldTabIndex === null) heading.removeAttribute("tabindex");
      else heading.setAttribute("tabindex", oldTabIndex);
      if (oldTitle === null) heading.removeAttribute("title");
      else heading.title = oldTitle;
      delete dialog.dataset.windowMovable;
      clear();
    };
  }, [ref, key, open]);
}
