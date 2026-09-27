import type { NotebookLink, WorkspaceNotice, WorkspaceNotices } from "@codex-web/shared";
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
export const isGptNotice = (notice: WorkspaceNotice) =>
  notice.target.client === "gpt" && notice.target.kind === "thread";

export function WorkNotices({
  notices,
  group = "events",
}: {
  notices: ReturnType<typeof useWorkNotices>;
  group?: "events" | "gpt";
}) {
  const title = group === "gpt" ? "Ответы GPT" : "Работа и планы";
  const items = notices.value?.items.filter((notice) => isGptNotice(notice) === (group === "gpt"));
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const read = async (ids: string[]) => {
    await api("/workspace/notices/read", { method: "POST", body: { ids } });
    window.dispatchEvent(new Event("workspace-notices-changed"));
  };
  return (
    <section className="work-notices" aria-label={title}>
      <div className="activity-attention-heading">
        <strong>{title}</strong>
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
      {group === "gpt" && items?.length === 0 && !notices.error && (
        <p className="muted">Новых ответов GPT нет.</p>
      )}
      {items?.map((n) => (
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
