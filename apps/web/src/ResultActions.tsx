import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

/** Keep children mounted: prepared downloads and nested sharing own durable state. */
export function ResultActions({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLFieldSetElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      const box = menu.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({
        left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)),
        top: Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - box.height - 8)),
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !button.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus({ preventScroll: true });
      }
    };
    place();
    menu.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-button result-more"
        aria-label={`Действия: ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
      </button>
      {createPortal(
        // biome-ignore lint/a11y/useKeyWithClickEvents: Delegates activation from native buttons/links, including keyboard-generated clicks.
        <fieldset
          id={id}
          ref={menu}
          className="result-action-menu"
          aria-label={`Действия: ${title}`}
          hidden={!open}
          style={position}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button,a")) setOpen(false);
          }}
        >
          {children}
        </fieldset>,
        document.body,
      )}
    </>
  );
}
