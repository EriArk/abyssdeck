import { useLayoutEffect, useRef, useState } from "react";
import "./panel-divider.css";

/** Shared pointer lifecycle; neither disconnects parents nor steals ordinary text selection. */
export function useColumnDrag(
  onDelta: (pixels: number, start: number) => void,
  value: number | (() => number),
  onEnd?: () => void,
) {
  const drag = useRef<{ pointer: number; x: number; value: number } | null>(null);
  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      drag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        value: typeof value === "function" ? value() : value,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const start = drag.current;
      if (
        start?.pointer === event.pointerId &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      )
        onDelta(event.clientX - start.x, start.value);
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      if (drag.current?.pointer !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      onEnd?.();
    },
    onPointerCancel() {
      drag.current = null;
    },
    onLostPointerCapture() {
      drag.current = null;
    },
  };
}

/** Explicitly registered neighboring panes; CSS owns their layout and phone navigation. */
export function PanelDivider({
  target,
  peer,
  storageKey,
  variable = "--panel-width",
  label,
  min = 180,
  max = 480,
  peerMin = 240,
  trailing = false,
}: {
  target: string;
  peer: string;
  storageKey: string;
  variable?: string;
  label: string;
  min?: number;
  max?: number;
  peerMin?: number;
  trailing?: boolean;
}) {
  const element = useRef<HTMLHRElement>(null);
  const preferred = useRef<number | null>(null);
  const measure = useRef<() => void>(() => {});
  const [layout, setLayout] = useState({ visible: false, left: 0, value: min, max });
  useLayoutEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent) return;
    try {
      const n = Number(localStorage.getItem(`codex-panel:${storageKey}`));
      preferred.current = Number.isFinite(n) && n >= min && n <= max ? n : null;
    } catch {}
    let frame = 0;
    const update = () => {
      const pane = parent.querySelector<HTMLElement>(target),
        other = parent.querySelector<HTMLElement>(peer);
      if (!pane || !other) return;
      const a = pane.getBoundingClientRect(),
        b = other.getBoundingClientRect(),
        container = parent.getBoundingClientRect();
      const visible =
        a.width > 0 &&
        b.width > 0 &&
        a.height > 0 &&
        b.height > 0 &&
        getComputedStyle(pane).visibility !== "hidden" &&
        getComputedStyle(other).visibility !== "hidden" &&
        Math.abs(a.top - b.top) < 20 &&
        (a.right <= b.left + 2 || b.right <= a.left + 2) &&
        getComputedStyle(pane).position !== "absolute";
      const limit = Math.max(min, Math.min(max, a.width + b.width - peerMin));
      if (visible && preferred.current !== null) {
        const width = Math.round(Math.max(min, Math.min(limit, preferred.current)));
        if (parent.style.getPropertyValue(variable) !== `${width}px`)
          parent.style.setProperty(variable, `${width}px`);
      }
      const edge = trailing ? a.left : a.right;
      const next = {
        visible,
        left: edge - container.left - parent.clientLeft + parent.scrollLeft,
        value: Math.round(a.width),
        max: Math.round(limit),
      };
      setLayout((old) =>
        Object.keys(next).every(
          (key) => old[key as keyof typeof old] === next[key as keyof typeof next],
        )
          ? old
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    measure.current = schedule;
    const observer = new ResizeObserver(schedule);
    observer.observe(parent);
    for (const selector of [target, peer]) {
      const node = parent.querySelector(selector);
      if (node) observer.observe(node);
    }
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      parent.style.removeProperty(variable);
    };
  }, [target, peer, storageKey, variable, min, max, peerMin, trailing]);
  useLayoutEffect(() => {
    measure.current();
  });
  const persist = () => {
    try {
      if (preferred.current !== null)
        localStorage.setItem(`codex-panel:${storageKey}`, String(preferred.current));
    } catch {}
  };
  const change = (value: number) => {
    preferred.current = Math.max(min, Math.min(layout.max, value));
    measure.current();
  };
  const gesture = useColumnDrag(
    (delta, start) => change(start + delta * (trailing ? -1 : 1)),
    layout.value,
    persist,
  );
  return (
    <hr
      ref={element}
      className="panel-divider"
      hidden={!layout.visible}
      style={{ left: layout.left }}
      aria-label={label}
      title={`${label}. Перетащи или используй стрелки; двойное нажатие — сброс.`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={layout.max}
      aria-valuenow={layout.value}
      tabIndex={layout.visible ? 0 : -1}
      {...gesture}
      onDoubleClick={() => {
        preferred.current = null;
        element.current?.parentElement?.style.removeProperty(variable);
        try {
          localStorage.removeItem(`codex-panel:${storageKey}`);
        } catch {}
        measure.current();
      }}
      onKeyDown={(event) => {
        const values: Record<string, number> = {
          ArrowLeft: layout.value + (trailing ? 16 : -16),
          ArrowRight: layout.value + (trailing ? -16 : 16),
          Home: min,
          End: layout.max,
        };
        const next = values[event.key];
        if (next === undefined) return;
        event.preventDefault();
        change(next);
        persist();
      }}
    />
  );
}
