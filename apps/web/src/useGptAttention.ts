import { type RefObject, useEffect, useState } from "react";
import { api } from "./api";

type Completion = { conversationId: string; completedId: string };
export function useGptAttention(
  id: string,
  lastMessageId: string,
  visible: boolean,
  pane: RefObject<HTMLDivElement | null>,
) {
  const [items, setItems] = useState<Completion[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Recheck after navigation or newly loaded history.
  useEffect(() => {
    let disposed = false,
      pending = false;
    const refresh = async () => {
      if (disposed || pending || document.hidden) return;
      pending = true;
      try {
        const result = await api<{ items: Completion[] }>("/gpt/attention");
        if (!disposed && Array.isArray(result.items)) setItems(result.items);
      } catch {
        /* Keep the last confirmed private read markers. */
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id, lastMessageId]);
  const completion = items.find((row) => row.conversationId === id)?.completedId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Recheck the rendered answer after history changes.
  useEffect(() => {
    const el = pane.current;
    if (!visible || !el || !completion) return;
    let disposed = false,
      pending = false;
    let timer: ReturnType<typeof setTimeout>;
    const ready = () =>
      !document.hidden &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 100 &&
      !!el.querySelector(`[data-message="${CSS.escape(completion)}"]`);
    const check = () => {
      clearTimeout(timer);
      if (!ready() || pending) return;
      timer = setTimeout(async () => {
        if (!ready() || disposed) return;
        pending = true;
        try {
          await api(`/gpt/conversations/${encodeURIComponent(id)}/seen`, {
            method: "POST",
            body: { completedId: completion },
          });
          if (!disposed)
            setItems((old) =>
              old.filter((row) => row.conversationId !== id || row.completedId !== completion),
            );
        } catch {
          pending = false;
          if (!disposed) timer = setTimeout(check, 5000);
        }
      }, 1000);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      clearTimeout(timer);
      el.removeEventListener("scroll", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [id, completion, lastMessageId, visible, pane]);
  return new Set(items.map((item) => item.conversationId));
}
