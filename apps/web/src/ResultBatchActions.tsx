import type { ResultItem, ResultShareSource } from "@codex-web/shared";
import { useState } from "react";
import { pageWorkspace } from "./accountStorage";
import { api, messageOf } from "./api";
import { DownloadLink } from "./DownloadLink";
import { durableKey, ResultShareWindow, type Snapshot } from "./ResultSharing";
import "./result-batch.css";

export function resultSelectable(result: ResultItem) {
  return (
    !!pageWorkspace &&
    !!result.threadId &&
    ["file", "artifact", "image"].includes(result.type) &&
    !!result.payload.url
  );
}
export function ResultBatchActions({
  items,
  selected,
  onSelect,
  onClose,
  client,
  hideSelectLoaded = false,
  loading = false,
}: {
  client?: "gpt" | "codex";
  hideSelectLoaded?: boolean;
  loading?: boolean;
  items: ResultItem[];
  selected: ResultItem[];
  onSelect: (items: ResultItem[]) => void;
  onClose: () => void;
}) {
  const [preparing, setBusy] = useState(false),
    [error, setError] = useState("");
  const [prepared, setPrepared] = useState<{ spec: string; snapshot: Snapshot } | null>(null);
  const [sharing, setSharing] = useState(false);
  const busy = preparing || loading;
  const sources: ResultShareSource[] = selected.map((result) => ({
    client: client ?? (result.payload.url?.startsWith("/api/gpt/") ? "gpt" : "codex"),
    threadId: result.threadId!,
    resultId: result.id,
  }));
  const spec = JSON.stringify(sources);
  const snapshot = prepared?.spec === spec ? prepared.snapshot : null;
  const prepare = async () => {
    if (busy || !selected.length) return;
    const input = { sources },
      request = durableKey("package", input);
    setBusy(true);
    setError("");
    try {
      const value = await api<Snapshot>("/team/result-packages", {
        method: "POST",
        key: request.key,
        body: input,
        timeoutMs: 120000,
      });
      setPrepared({ spec, snapshot: value });
      request.clear();
    } catch (e) {
      if ((e as { code?: string })?.code === "RESULT_COPY_EXPIRED") request.clear();
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="result-batch" aria-label="Действия с выбранными результатами">
      <div className="result-batch-summary">
        <strong>Выбрано: {selected.length}</strong>
        <button className="secondary" type="button" disabled={busy} onClick={onClose}>
          Готово
        </button>
      </div>
      <div className="result-batch-actions">
        {!hideSelectLoaded && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              onSelect(
                [
                  ...new Map(
                    [...selected, ...items.filter(resultSelectable)].map((r) => [r.id, r]),
                  ).values(),
                ].slice(0, 100),
              )
            }
          >
            Выбрать загруженные
          </button>
        )}
        <button
          type="button"
          className="secondary"
          disabled={busy || !selected.length}
          onClick={() => onSelect([])}
        >
          Снять выбор
        </button>
        {snapshot ? (
          <>
            <DownloadLink
              directDownload
              href={`/api/team/result-snapshots/${snapshot.id}/content`}
              name={snapshot.title}
            >
              Скачать ZIP
            </DownloadLink>
            <button type="button" className="secondary" onClick={() => setSharing(true)}>
              Отправить пакет
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary result-batch-prepare"
            disabled={busy || !selected.length}
            onClick={() => void prepare()}
          >
            {busy ? "Подготавливаем файлы…" : "Подготовить пакет"}
          </button>
        )}
      </div>
      {error && <p role="status">{error}</p>}
      {sharing && snapshot && (
        <ResultShareWindow
          prepared={snapshot}
          result={{ ...selected[0]!, id: snapshot.id, title: snapshot.title }}
          onClose={() => setSharing(false)}
        />
      )}
    </section>
  );
}
