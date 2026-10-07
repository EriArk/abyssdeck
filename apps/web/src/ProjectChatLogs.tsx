import { useEffect, useState } from "react";
import { api, messageOf } from "./api";
import { DownloadLink } from "./DownloadLink";

type Log = {
  id: string;
  title: string;
  status: string;
  archived: number;
  messages: number;
  complete: number | null;
  updatedAt: number | null;
  error: string | null;
};
export function ProjectChatLogs({ projectId }: { projectId: string }) {
  const [threads, setThreads] = useState<Log[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setThreads([]);
    setSelected("");
    setError("");
    void api<{ threads: Log[] }>(`/projects/${encodeURIComponent(projectId)}/chat-logs`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setThreads(data.threads);
          setSelected(data.threads[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      });
    return () => controller.abort();
  }, [projectId]);
  const current = threads.find((t) => t.id === selected);
  return (
    <section className="overview-card overview-chat-log" aria-label="Журнал чатов">
      <header>
        <h2>Журнал чатов</h2>
      </header>
      <p className="muted">
        Переписка сохраняется на сервере. Архив можно передать новому чату, даже если прежний
        перестал работать. В архиве только текст и ссылки, без содержимого вложений.
      </p>
      {error && <p role="alert">{error}</p>}
      {!!threads.length && (
        <label>
          Диалог
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.archived ? " · Архив" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {current && (
        <>
          <p className="muted">
            {current.messages} сообщений сохранено.{" "}
            {current.complete
              ? "История скопирована."
              : "Старая история ещё не скопирована целиком."}
            {current.error ? " Доступна сохранённая часть." : ""}
          </p>
          <DownloadLink
            key={`${projectId}:${selected}`}
            href={`/api/projects/${encodeURIComponent(projectId)}/chat-logs/${selected}/archive`}
            name={`chat-${selected}.zip`}
            mime="application/zip"
            directDownload
            visibleLabel
          >
            Скачать архив чата
          </DownloadLink>
        </>
      )}
      {!error && !threads.length && <p className="muted">Сохранённых диалогов пока нет.</p>}
    </section>
  );
}
