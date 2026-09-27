import type { NotebookLink, WorkspaceNotices } from "@codex-web/shared";
import { useEffect, useState } from "react";
import { api, messageOf } from "./api";
import { Icon } from "./icons";
import { useSharedResource } from "./sharedResources";

export function useWorkNotices() {
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setRevision((v) => v + 1);
    };
    const timer = setInterval(update, 15000);
    window.addEventListener("workspace-notices-changed", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("workspace-notices-changed", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return { ...useSharedResource<WorkspaceNotices>("/workspace/notices", revision), refresh };
}
export function WorkNotices({ notices }: { notices: ReturnType<typeof useWorkNotices> }) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const read = async (ids: string[]) => {
    await api("/workspace/notices/read", { method: "POST", body: { ids } });
    window.dispatchEvent(new Event("workspace-notices-changed"));
  };
  return (
    <section className="work-notices" aria-label="Работа и планы">
      <div className="activity-attention-heading">
        <strong>Работа и планы</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Обновить внутренние уведомления"
          disabled={notices.loading}
          onClick={notices.refresh}
        >
          <Icon name="refresh" />
        </button>
      </div>
      {!notices.value && notices.loading && <p className="muted">Загружаем события…</p>}
      {(error || notices.error) && <p role="status">{error || notices.error}</p>}
      {notices.value?.items.map((n) => (
        <article className="space-card" key={n.id}>
          <strong>{n.title}</strong>
          <p>{n.detail}</p>
          <small>
            {new Date(n.at).toLocaleString("ru", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
          <div className="activity-notice-actions">
            <button
              type="button"
              className="secondary"
              disabled={!!busy}
              onClick={() => {
                setBusy(n.id);
                setError("");
                void api<NotebookLink>("/workspace/notices/open", {
                  method: "POST",
                  body: { id: n.id },
                })
                  .then((target) => {
                    window.dispatchEvent(
                      new CustomEvent("open-workspace-notice", { detail: target }),
                    );
                    return read([n.id]);
                  })
                  .catch((e) => setError(messageOf(e)))
                  .finally(() => setBusy(""));
              }}
            >
              {n.target.kind === "plan" ? "Открыть план" : "Открыть чат"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!!busy}
              onClick={() => {
                setBusy(n.id);
                setError("");
                void read([n.id])
                  .catch((e) => setError(messageOf(e)))
                  .finally(() => setBusy(""));
              }}
            >
              Прочитано
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
