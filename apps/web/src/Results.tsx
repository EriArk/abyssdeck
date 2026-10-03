import type { ResultItem } from "@codex-web/shared";
import {
  emptyResultCounts,
  type ResultCategory,
  type ResultCounts,
  resultCategory,
} from "@codex-web/shared";
import type { ArtifactSelection } from "./ArtifactMarkdown";
import { FileViewerDialog } from "./FileViewerDialog";
import { ResultBatchActions, resultSelectable } from "./ResultBatchActions";
import { ResultCard } from "./ResultCard";
import { ResultFilePreview } from "./ResultFilePreview";
import "./resultsFeed.css";
import { ResultFilters, resultLabels } from "./ResultFilters";
import { resultPreview } from "./resultPreview";
import { useResultImages } from "./useResultImages";
import "./resultCategories.css";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { LiveCommandOutput } from "./LiveCommandOutput";
import { PreviewViewer } from "./PreviewViewer";
import { TurnDetails } from "./TurnDetails";
import type { Activity, Result } from "./types";
export function Results({
  galleryEndpoint,
  sourceClient,
  focusVersion = 0,
  onRetry,
  category = "files",
  onCategory = () => {},
  counts = emptyResultCounts(),
  error = "",
  onOverlayChange,
  results,
  visible,
  focusId,
  busy,
  hasMore,
  onOlder,
  onTurn,
  toolbar,
  onFile,
  onSaveLink,
  selection,
  onRevealRetry,
  onSearch,
  showLinks = false,
  showWork = true,
  showReasoning = false,
}: {
  galleryEndpoint?: string;
  sourceClient?: "gpt" | "codex";
  focusVersion?: number;
  onRetry?: () => void;
  category?: ResultCategory;
  onCategory?: (category: ResultCategory) => void;
  counts?: ResultCounts;
  error?: string;
  onOverlayChange: (open: boolean) => void;
  results: Result[];
  visible: boolean;
  focusId: string;
  busy: boolean;
  hasMore: boolean;
  onOlder: () => void;
  onTurn?: (id: string, threadId?: string) => void;
  toolbar?: ReactNode;
  onFile?: (path: string) => void;
  onSaveLink?: (result: ResultItem) => void;
  selection?: ArtifactSelection | null;
  onRevealRetry?: () => void;
  onSearch?: () => void;
  showLinks?: boolean;
  showWork?: boolean;
  showReasoning?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [inspected, setInspected] = useState<Result | null>(null),
    [revealNotice, setRevealNotice] = useState<string | null>(null),
    [inspecting, setInspecting] = useState(false);
  const [disclosure, setDisclosure] = useState<Record<string, boolean>>({});
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ResultItem[]>([]);
  const revealed = useRef<ArtifactSelection["request"] | null>(null);
  const focusedRequest = useRef("");
  useEffect(() => {
    onOverlayChange(inspecting);
    return () => onOverlayChange(false);
  }, [inspecting, onOverlayChange]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Newly loaded result cards must be focused after rendering.
  useEffect(() => {
    const request = `${focusId}:${focusVersion}`;
    if (!visible || !focusId || focusedRequest.current === request) return;
    const frame = requestAnimationFrame(() => {
      const pane = ref.current;
      const card = pane?.querySelector<HTMLElement>(`[data-result="${CSS.escape(focusId)}"]`);
      if (!pane || !card) return;
      const bounds = pane.getBoundingClientRect(),
        target = card.getBoundingClientRect();
      pane.scrollTop += target.top - bounds.top - 12;
      focusedRequest.current = request;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusId, focusVersion, visible, results]);
  const inspect = (result: Result) => {
    setRevealNotice(null);
    setInspected(result);
    setInspecting(true);
  };
  useEffect(() => {
    if (focusId || focusVersion) setInspecting(false);
  }, [focusId, focusVersion]);
  useEffect(() => {
    if (!selection) {
      revealed.current = null;
      return;
    }
    if (revealed.current !== selection.request) {
      revealed.current = selection.request;
      setInspecting(true);
    }
    setInspected(selection.item ?? null);
    setRevealNotice(selection.item ? null : selection.error || "Открываем результат…");
  }, [selection]);
  const current = inspected && (results.find((item) => item.id === inspected.id) ?? inspected);
  const imageSequence = useResultImages(
    galleryEndpoint,
    inspecting && !!current && resultPreview(current).kind === "image",
    current,
    results,
    inspect,
  );
  const gallery = results.filter(
    (item) =>
      ["file", "artifact", "image"].includes(item.type) &&
      item.payload.url &&
      (category === "all" || resultCategory(item.type) === category),
  );
  const position = current ? gallery.findIndex((item) => item.id === current.id) : -1;
  return (
    <section className="results-pane pane" data-visible={visible} aria-label="Результаты">
      <div className="pane-heading">
        <span>
          <Icon name="results" />
          Результаты
        </span>
        <div className="results-heading-actions">
          {results.some(resultSelectable) && (
            <button
              type="button"
              className="icon-button"
              aria-label="Выбрать несколько результатов"
              aria-pressed={selecting}
              onClick={() => setSelecting((v) => !v)}
            >
              <Icon name="check" />
            </button>
          )}
          {counts.all > 0 && <span className="small muted">{counts.all}</span>}
          {onSearch && (
            <button
              type="button"
              className="icon-button"
              aria-label="Найти файл в результатах"
              onClick={onSearch}
            >
              <Icon name="search" />
            </button>
          )}
        </div>
      </div>
      {toolbar}
      <div hidden={!selecting}>
        <ResultBatchActions
          client={sourceClient}
          items={results.filter((r) => category === "all" || resultCategory(r.type) === category)}
          selected={selected}
          onSelect={setSelected}
          onClose={() => setSelecting(false)}
        />
      </div>
      <ResultFilters
        showLinks={showLinks}
        showWork={showWork}
        showReasoning={showReasoning}
        category={category}
        counts={counts}
        onChange={(next) => {
          setInspecting(false);
          onCategory(next);
        }}
      />
      {error && (
        <div className="results-error" role="status">
          {error}
          {onRetry && (
            <button type="button" className="secondary" onClick={onRetry}>
              Повторить
            </button>
          )}
        </div>
      )}
      {inspecting && revealNotice && (
        <FileViewerDialog name="Результат" onClose={() => setInspecting(false)}>
          <p role="status">{revealNotice}</p>
          {selection?.error && (
            <button type="button" className="secondary" onClick={onRevealRetry}>
              Повторить
            </button>
          )}
        </FileViewerDialog>
      )}
      {inspecting &&
        current &&
        !revealNotice &&
        (current.type === "preview" ? (
          <PreviewViewer result={current} onClose={() => setInspecting(false)} />
        ) : (
          <ResultFilePreview
            result={current}
            navigation={
              current && resultPreview(current).kind === "image"
                ? imageSequence
                : position < 0
                  ? undefined
                  : {
                      index: position,
                      count: gallery.length,
                      previous: position > 0 ? () => inspect(gallery[position - 1]!) : undefined,
                      next:
                        position + 1 < gallery.length
                          ? () => inspect(gallery[position + 1]!)
                          : undefined,
                    }
            }
            onSource={
              current.turnId && onTurn
                ? () => {
                    setInspecting(false);
                    onTurn(current.turnId!, current.threadId);
                  }
                : undefined
            }
            onClose={() => setInspecting(false)}
          />
        ))}
      <div className="pane-scroll" ref={ref}>
        <div className="result-feed-caption">
          <span>{category === "work" ? "Сохранённые действия" : resultLabels[category]}</span>
          <span>{counts[category]}</span>
        </div>
        {!error &&
          !results.some((r) => category === "all" || resultCategory(r.type) === category) && (
            <div className="empty-state">
              <div className="empty-symbol">
                <Icon name="results" size={29} />
              </div>
              <h2>{busy ? "Загружаем…" : "Пока нет результатов."}</h2>
            </div>
          )}
        <div className={`result-feed result-feed-${category}`}>
          {results
            .filter((r) => category === "all" || resultCategory(r.type) === category)
            .map((r) => (
              <ResultCard
                key={r.id}
                result={r}
                focusId={focusId}
                inspect={inspect}
                onTurn={onTurn}
                onFile={onFile}
                onSaveLink={onSaveLink}
                onRetry={onRetry}
                selecting={selecting}
                selected={selected}
                onSelect={setSelected}
                disclosure={disclosure}
                setDisclosure={setDisclosure}
              />
            ))}
        </div>
        {hasMore && (
          <button type="button" className="secondary load-more" disabled={busy} onClick={onOlder}>
            Загрузить ещё результаты
          </button>
        )}
      </div>
    </section>
  );
}
export function ActivityPane({
  threadId,
  items,
  visible,
  hasMore,
  onOlder,
}: {
  threadId: string;
  items: Activity[];
  visible: boolean;
  hasMore: boolean;
  onOlder: () => void;
}) {
  return (
    <section className="activity-pane pane" data-visible={visible} aria-label="Ход работы">
      <div className="pane-heading">
        <span>
          <Icon name="activity" />
          Ход работы
        </span>
      </div>
      <div className="pane-scroll">
        {visible && threadId && (
          <TurnDetails
            key={threadId}
            id="activity-turn-details"
            threadId={threadId}
            turnId={null}
          />
        )}
        {!items.length && (
          <div className="empty-state">
            <Icon name="activity" size={30} />
            <h2>Пока тихо.</h2>
          </div>
        )}
        {items.map((item) => (
          <details className="activity-card" key={item.seq}>
            <summary>
              <span>
                {item.payload.command ??
                  item.payload.tool ??
                  item.payload.message ??
                  "Событие Codex"}
              </span>
              <span className="badge">
                {item.payload.exitCode !== undefined
                  ? `Код ${item.payload.exitCode}`
                  : (item.payload.status ?? "")}
              </span>
            </summary>
            {item.payload.logUrl ? (
              <LiveCommandOutput url={item.payload.logUrl} />
            ) : (
              <pre>{item.payload.output ?? item.payload.message ?? "Без текстового вывода"}</pre>
            )}
          </details>
        ))}
        {hasMore && (
          <button type="button" className="secondary load-more" onClick={onOlder}>
            Загрузить ещё
          </button>
        )}
      </div>
    </section>
  );
}
