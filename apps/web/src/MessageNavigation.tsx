import { type RefObject, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import "./message-navigation.css";

type Props = {
  scope: string;
  scroller: RefObject<HTMLDivElement | null>;
  following: RefObject<boolean>;
  hasOlder: boolean;
  loading: boolean;
  older: () => Promise<void>;
  latest: () => void | Promise<void>;
};
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export function MessageNavigation(props: Props) {
  const current = useRef(props);
  current.current = props;
  const target = useRef("");
  const pending = useRef(false);
  const [state, setState] = useState({ previous: false, next: false, end: false, busy: false });
  const elements = () =>
    Array.from(
      current.current.scroller.current?.querySelectorAll<HTMLElement>("[data-chat-message]") ?? [],
    ).filter((el) => el.getClientRects().length > 0);
  const position = (items: HTMLElement[]) => {
    const fixed = items.findIndex((el) => el.dataset.chatMessage === target.current);
    if (fixed >= 0) return fixed;
    const root = current.current.scroller.current;
    if (!root || !items.length) return -1;
    const line = root.getBoundingClientRect().top + 16;
    const index = items.findIndex((el) => el.getBoundingClientRect().bottom > line + 1);
    return index < 0 ? items.length - 1 : index;
  };
  const refresh = () => {
    const p = current.current,
      root = p.scroller.current,
      items = elements(),
      index = position(items);
    const next = {
      previous: index > 0 || p.hasOlder,
      next: index >= 0 && index < items.length - 1,
      end:
        !!root &&
        (root.scrollHeight - root.scrollTop - root.clientHeight > 12 ||
          !!target.current ||
          !p.following.current),
      busy: pending.current || p.loading,
    };
    setState((old) =>
      Object.keys(next).every((k) => old[k as keyof typeof old] === next[k as keyof typeof next])
        ? old
        : next,
    );
  };
  // Native listeners use current props; observation is confined to this chat.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Ref-backed handlers intentionally remain stable for the scope.
  useEffect(() => {
    const root = props.scroller.current;
    if (!root) return;
    target.current = "";
    pending.current = false;
    delete root.dataset.messageNavigation;
    let scheduled = 0;
    const update = () => {
      if (!scheduled)
        scheduled = requestAnimationFrame(() => {
          scheduled = 0;
          refresh();
        });
    };
    const manual = () => {
      target.current = "";
      delete root.dataset.messageNavigation;
      update();
    };
    root.addEventListener("scroll", update, { passive: true });
    root.addEventListener("wheel", manual, { passive: true });
    root.addEventListener("pointerdown", manual, { passive: true });
    root.addEventListener("touchstart", manual, { passive: true });
    root.addEventListener("keydown", manual);
    const observer = new MutationObserver(update),
      resize = new ResizeObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    resize.observe(root);
    refresh();
    return () => {
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      resize.disconnect();
      root.removeEventListener("scroll", update);
      root.removeEventListener("wheel", manual);
      root.removeEventListener("pointerdown", manual);
      root.removeEventListener("touchstart", manual);
      root.removeEventListener("keydown", manual);
    };
  }, [props.scope, props.scroller]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refresh boundary state after canonical pagination finishes.
  useEffect(refresh, [props.loading, props.hasOlder]);
  async function move(direction: -1 | 1 | 0) {
    const p = current.current,
      root = p.scroller.current;
    if (!root || pending.current || p.loading) return;
    root.dispatchEvent(new Event("message-navigation"));
    pending.current = true;
    refresh();
    try {
      if (!direction) {
        target.current = "";
        delete root.dataset.messageNavigation;
        p.following.current = true;
        await p.latest();
        await frame();
        await frame();
        if (current.current.scope !== p.scope) return;
        root.scrollTop = root.scrollHeight;
        return;
      }
      p.following.current = false;
      root.dataset.messageNavigation = "true";
      let items = elements(),
        index = position(items);
      const anchor = items[index]?.dataset.chatMessage;
      if (direction < 0 && index <= 0 && p.hasOlder) {
        await p.older();
        await frame();
        await frame();
        if (current.current.scope !== p.scope) return;
        items = elements();
        index = items.findIndex((el) => el.dataset.chatMessage === anchor);
        // Branch replacement/error never turns into a jump to an unrelated message.
        if (index < 0) return;
      }
      const el = items[index + direction];
      if (!el) return;
      target.current = el.dataset.chatMessage ?? "";
      root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top - 16;
    } catch {
      /* Existing canonical history feedback owns failures; a tap can try again. */
    } finally {
      if (current.current.scope === p.scope) {
        pending.current = false;
        refresh();
      }
    }
  }
  if (!state.previous && !state.next && !state.end && !props.hasOlder) return null;
  return (
    <nav className="message-navigation" aria-label="Навигация по сообщениям">
      {(
        [
          [-1, "Предыдущее сообщение", "arrow-up", state.previous],
          [1, "Следующее сообщение", "arrow-down", state.next],
          [0, "В конец чата", "to-bottom", state.end],
        ] as const
      ).map(([direction, label, icon, enabled]) => (
        <button
          key={direction}
          type="button"
          className="icon-button secondary"
          title={label}
          aria-label={label}
          disabled={!enabled || state.busy}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => void move(direction)}
        >
          <Icon name={icon} size={18} />
        </button>
      ))}
    </nav>
  );
}
