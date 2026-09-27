import type { Attachment } from "@codex-web/shared";
import { useEffect, useRef, useState } from "react";
import { pageWorkspace } from "./accountStorage";
import { api, messageOf } from "./api";

export type WorkResultTarget = {
  binding: string;
  kind: "work" | "intake";
  projectId: string;
  title: string;
  threadId: string | null;
};

type Props = {
  threadId?: string;
  projectId?: string;
  files: Attachment[];
  disabled: boolean;
  onAttach: (file: Attachment) => void;
};

/** Each destination owns its requests and UI state, including an in-flight attachment. */
export function WorkResultHandoffs(props: Props) {
  return (
    <ScopedWorkResultHandoffs
      key={props.threadId ? `thread:${props.threadId}` : `intake:${props.projectId ?? ""}`}
      {...props}
    />
  );
}

/** Incoming files stay beside the exact destination draft until explicitly attached. */
function ScopedWorkResultHandoffs({ threadId, projectId, files, disabled, onAttach }: Props) {
  const [items, setItems] = useState<{ id: string; title: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const active = useRef(""),
    locked = useRef(false);
  const scope = threadId
    ? `threadId=${encodeURIComponent(threadId)}`
    : `projectId=${encodeURIComponent(projectId ?? "")}`;
  active.current = scope;
  useEffect(() => {
    if (!pageWorkspace || (!threadId && !projectId)) return;
    active.current = scope;
    let live = true,
      reading = false;
    const refresh = async () => {
      if (reading || document.hidden) return;
      reading = true;
      try {
        const r = await api<{ items: typeof items }>("/team/result-work-handoffs?" + scope);
        if (live) setItems(r.items);
      } catch {
        /* The destination can be rotated while its old view is still mounted. */
      } finally {
        reading = false;
      }
    };
    setItems([]);
    setError("");
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      live = false;
      active.current = "";
      clearInterval(timer);
    };
  }, [scope, threadId, projectId]);
  const act = async (id: string, attach: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (attach) {
        const r = await api<{ file: Attachment }>(`/team/result-work-handoffs/${id}/attachment`, {
          method: "POST",
        });
        if (active.current === scope) onAttach(r.file);
      } else {
        await api(`/team/result-handoffs/${id}`, { method: "DELETE" });
        if (active.current === scope) setItems((old) => old.filter((v) => v.id !== id));
      }
    } catch (e) {
      if (active.current === scope) setError(messageOf(e));
    } finally {
      locked.current = false;
      if (active.current === scope) setBusy(false);
    }
  };
  const pending = items.filter((item) => !files.some((file) => file.id === item.id));
  if (!pending.length && !error) return null;
  return (
    <details className="work-result-handoffs" open>
      <summary>Переданные материалы · {pending.length}</summary>
      {error && <p role="alert">{error}</p>}
      {pending.map((item) => (
        <div className="work-result-handoff" key={item.id}>
          <span title={item.title}>{item.title}</span>
          <div>
            <button
              type="button"
              className="secondary"
              disabled={disabled || busy}
              onClick={() => void act(item.id, true)}
            >
              Прикрепить
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void act(item.id, false)}
            >
              Скрыть
            </button>
          </div>
        </div>
      ))}
    </details>
  );
}
