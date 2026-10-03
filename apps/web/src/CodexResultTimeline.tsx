import type { ResultItem, ResultTimelinePage } from "@codex-web/shared";
import { useEffect, useState } from "react";
import { api, messageOf } from "./api";
import { LiveCommandOutput } from "./LiveCommandOutput";
import { type ResultDisclosure, ResultWork } from "./ResultCard";

export function CodexResultTimeline({
  result,
  expanded,
  onFile,
  disclosure,
  setDisclosure,
}: ResultDisclosure & {
  result: ResultItem;
  expanded: boolean;
  onFile?: (path: string) => void;
}) {
  const [page, setPage] = useState<ResultTimelinePage | null>(null);
  const [legacy, setLegacy] = useState<{ items: ResultItem[]; nextBefore: number | null } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const endpoint = `/threads/${encodeURIComponent(result.threadId!)}/reasoning`;
  const query = `turnId=${encodeURIComponent(result.turnId!)}`;
  // Revalidate only on opening or actual parent revision; never poll the native provider.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision and retry deliberately refresh this exact turn.
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setBusy(true);
    void Promise.all([
      api<ResultTimelinePage>(`${endpoint}?${query}`, { signal: controller.signal }),
      api<{ items: ResultItem[]; nextBefore: number | null }>(`${endpoint}/work?${query}`, {
        signal: controller.signal,
      }),
    ])
      .then(([next, old]) => {
        if (controller.signal.aborted) return;
        setPage((previous) => ({
          ...next,
          items: [
            ...new Map(
              [
                ...next.items,
                ...(previous?.items ?? []).filter(
                  (item) => !next.items.some((n) => n.id === item.id),
                ),
              ].map((item) => [item.id, item]),
            ).values(),
          ],
          nextAfter: previous?.nextAfter ?? next.nextAfter,
        }));
        setLegacy((previous) => ({
          ...old,
          items: [
            ...new Map(
              [...old.items, ...(previous?.items ?? [])].map((item) => [item.id, item]),
            ).values(),
          ],
          nextBefore: previous?.nextBefore ?? old.nextBefore,
        }));
        setError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(messageOf(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [expanded, endpoint, query, result.payload.revision, retry]);
  const more = async (work: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (work) {
        const next = await api<{ items: ResultItem[]; nextBefore: number | null }>(
          `${endpoint}/work?${query}&before=${legacy!.nextBefore}`,
        );
        setLegacy((old) => ({
          ...next,
          items: [
            ...new Map(
              [...(old?.items ?? []), ...next.items].map((item) => [item.id, item]),
            ).values(),
          ],
        }));
      } else {
        const next = await api<ResultTimelinePage>(`${endpoint}?${query}&after=${page!.nextAfter}`);
        setPage((old) => ({
          ...next,
          items: [
            ...new Map(
              [...(old?.items ?? []), ...next.items].map((item) => [item.id, item]),
            ).values(),
          ],
        }));
      }
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };
  const workCard = (
    id: string,
    label: string,
    value?: ResultItem,
    text?: string,
    logUrl?: string,
  ) => (
    <details
      key={id}
      className="result-work-step"
      open={!!disclosure[id]}
      onToggle={(event) => {
        const value = event.currentTarget.open;
        setDisclosure((old) => (old[id] === value ? old : { ...old, [id]: value }));
      }}
    >
      <summary>
        {label}
        {value?.payload.exitCode !== undefined && (
          <span className={`badge ${value.payload.exitCode === 0 ? "success" : "danger"}`}>
            {value.payload.exitCode === 0 ? "Успешно" : `Код ${value.payload.exitCode}`}
          </span>
        )}
      </summary>
      {value ? <ResultWork result={value} onFile={onFile} /> : <p>{text}</p>}
      {logUrl && disclosure[id] && <LiveCommandOutput url={logUrl} />}
    </details>
  );
  // Progress labels alone have no content to expand; keep them in live status UI.
  const steps = page?.items.filter(
    (item) => item.text?.trim() || (item.kind === "work" && (item.result || item.logUrl)),
  );
  return (
    <div className="result-timeline">
      {error && (
        <div role="status">
          {error}
          <button
            type="button"
            className="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить
          </button>
        </div>
      )}
      {steps?.map((item) =>
        item.kind === "work" ? (
          workCard(`${result.id}:${item.id}`, item.label, item.result, item.text, item.logUrl)
        ) : (
          <div key={item.id} className={`result-public-step result-step-${item.kind}`}>
            <small className="muted">{item.label}</small>
            <p>{item.text}</p>
          </div>
        ),
      )}
      {page?.nextAfter != null && (
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void more(false)}
        >
          Продолжить ход задачи
        </button>
      )}
      {!!legacy?.items.length && (
        <div className="result-legacy-work">
          <p className="muted">Сохранённая работа</p>
          {legacy.items.map((item) => workCard(`${result.id}:${item.id}`, item.title, item))}
        </div>
      )}
      {legacy?.nextBefore != null && (
        <button type="button" className="secondary" disabled={busy} onClick={() => void more(true)}>
          Ещё сохранённая работа
        </button>
      )}
      {busy && <p role="status">Загружаем…</p>}
      {!busy &&
        !error &&
        page &&
        !steps?.length &&
        page.nextAfter == null &&
        !legacy?.items.length && (
          <p className="muted">Для этого хода нет сохранённых публичных шагов.</p>
        )}
    </div>
  );
}
