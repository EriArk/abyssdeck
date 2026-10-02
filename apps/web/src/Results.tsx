import type { ResultItem } from "@codex-web/shared";
import {
  emptyResultCounts,
  type ResultCategory,
  type ResultCounts,
  resultCategory,
} from "@codex-web/shared";
import { ArtifactCapture } from "./ArtifactCapture";
import type { ArtifactSelection } from "./ArtifactMarkdown";
import { workspaceMediaUrl } from "./accountStorage.ts";
import { DownloadLink, isDownloadUrl } from "./DownloadLink";
import { FileViewerDialog } from "./FileViewerDialog";
import { ResultBatchActions, resultSelectable } from "./ResultBatchActions";
import { ResultFilePreview } from "./ResultFilePreview";
import { ResultFilters } from "./ResultFilters";
import { ResultShareButton } from "./ResultSharing";
import { resultPreview } from "./resultPreview";
import { useResultImages } from "./useResultImages";
import "./resultCategories.css";
import { type ReactNode, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CollapsibleCode } from "./CollapsibleCode";
import { CommandOutput } from "./CommandOutput";
import { CopyButton } from "./CopyButton";
import { GptSteps } from "./GptProgress";
import { Icon } from "./icons";
import { LiveCommandOutput } from "./LiveCommandOutput";
import { MarkdownTable } from "./MarkdownTable";
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
        {!error &&
          !results.some((r) => category === "all" || resultCategory(r.type) === category) && (
            <div className="empty-state">
              <div className="empty-symbol">
                <Icon name="results" size={29} />
              </div>
              <h2>{busy ? "Загружаем…" : "Пока нет результатов."}</h2>
            </div>
          )}
        {results
          .filter((r) => category === "all" || resultCategory(r.type) === category)
          .map((r) =>
            r.type === "link" && r.payload.url ? (
              <a
                key={r.id}
                data-result={r.id}
                data-focused={r.id === focusId}
                className="result-site-link secondary"
                href={r.payload.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (
                    event.button ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  window.open(
                    r.payload.url,
                    "_blank",
                    "popup=yes,width=1100,height=800,noopener,noreferrer",
                  );
                }}
              >
                <Icon name="link" size={17} />
                <span>
                  <strong>{r.title}</strong>
                  <small>{new URL(r.payload.url).hostname}</small>
                </span>
                <Icon name="external" size={16} />
              </a>
            ) : (
              <article
                className={`result-card result-${r.type}`}
                key={r.id}
                data-result={r.id}
                data-focused={r.id === focusId}
              >
                <div className="result-title">
                  {selecting && resultSelectable(r) && (
                    <label className="result-select">
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${r.title}`}
                        checked={selected.some((item) => item.id === r.id)}
                        disabled={
                          selected.length >= 100 && !selected.some((item) => item.id === r.id)
                        }
                        onChange={(event) =>
                          setSelected((old) =>
                            event.target.checked
                              ? [...old.filter((item) => item.id !== r.id), r]
                              : old.filter((item) => item.id !== r.id),
                          )
                        }
                      />
                    </label>
                  )}
                  {onSaveLink && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Сохранить ссылку: ${r.title}`}
                      onClick={() => onSaveLink(r)}
                    >
                      <Icon name="pin" size={16} />
                    </button>
                  )}
                  <span className="result-icon">
                    <Icon
                      name={
                        r.type === "reasoning"
                          ? "activity"
                          : r.type === "image"
                            ? "image"
                            : r.type === "check"
                              ? "check"
                              : "folder"
                      }
                    />
                  </span>
                  <div>
                    <h3 aria-label={r.title}>
                      {["file", "artifact", "image"].includes(r.type) && r.payload.url ? (
                        <button
                          type="button"
                          className="result-title-open"
                          onClick={() => inspect(r)}
                          aria-label={`Открыть ${r.title}`}
                        >
                          {r.title}
                        </button>
                      ) : (
                        r.title
                      )}
                    </h3>
                    {r.createdAt && (
                      <time>
                        {new Date(r.payload.capturedAt || r.createdAt).toLocaleString("ru", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    )}
                  </div>
                  {r.type === "check" && (
                    <span className={`badge ${r.payload.exitCode === 0 ? "success" : "danger"}`}>
                      {r.payload.exitCode === 0 ? "Успешно" : "Ошибка"}
                    </span>
                  )}
                </div>
                {!["file", "artifact", "image"].includes(r.type) && (
                  <ResultShareButton result={r} />
                )}
                {r.type === "reasoning" && (
                  <details className="result-reasoning-details">
                    <summary>
                      <Icon name="chevron" size={16} /> Ход ответа{" "}
                      <span className="muted">{r.payload.steps?.length || 0}</span>
                    </summary>
                    {r.payload.text !== r.title && (
                      <p className="result-reasoning-request">{r.payload.text}</p>
                    )}
                    <GptSteps items={r.payload.steps ?? []} />
                  </details>
                )}
                {r.type === "image" && r.payload.url && (
                  <button
                    type="button"
                    className="screenshot-preview"
                    onClick={() => inspect(r)}
                    aria-label="Открыть снимок"
                  >
                    <img
                      src={workspaceMediaUrl(r.payload.url)}
                      loading="lazy"
                      alt={r.title}
                      width={r.payload.width}
                      height={r.payload.height}
                    />
                  </button>
                )}
                {r.type === "preview" && (
                  <button
                    type="button"
                    className="secondary result-demo-open"
                    onClick={() => inspect(r)}
                  >
                    <Icon name="remote" /> Открыть демо <Icon name="chevron" size={16} />
                  </button>
                )}
                {r.type === "artifact" && !r.payload.url && r.payload.captureId && (
                  <ArtifactCapture
                    id={r.payload.captureId}
                    status={r.payload.status || "failed"}
                    message={r.payload.message}
                    onComplete={onRetry}
                  />
                )}
                {r.payload.excerpt && (
                  <pre className="result-text-excerpt">{r.payload.excerpt}</pre>
                )}
                {r.type === "file" && r.payload.message && (
                  <p className="result-file-size" role="status">
                    {r.payload.message}
                  </p>
                )}
                {["file", "artifact", "image"].includes(r.type) && (
                  <div className="result-artifact-actions">
                    <ResultShareButton result={r} />
                    {r.payload.url && (
                      <DownloadLink directDownload href={r.payload.url} name={r.title}>
                        Скачать
                      </DownloadLink>
                    )}
                  </div>
                )}
                {r.type === "error" && r.payload.message && <p>{r.payload.message}</p>}
                {r.payload.bytes !== undefined && (
                  <small className="muted result-file-size">
                    {new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
                      r.payload.bytes / 1024,
                    )}{" "}
                    КБ
                  </small>
                )}
                {r.type === "plan" && (
                  <div className="result-plan">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre: CollapsibleCode,
                        table: MarkdownTable,
                        a: ({ node: _node, ...props }) =>
                          isDownloadUrl(props.href) ? (
                            <DownloadLink href={props.href}>{props.children}</DownloadLink>
                          ) : (
                            <a {...props} target="_blank" rel="noopener noreferrer" />
                          ),
                      }}
                    >
                      {r.payload.text ?? ""}
                    </Markdown>
                  </div>
                )}
                {r.payload.command && (
                  <CollapsibleCode label="Команда и код">{r.payload.command}</CollapsibleCode>
                )}
                {r.type === "check" && r.payload.command && r.threadId && (
                  <CommandOutput threadId={r.threadId} resultId={r.id} />
                )}
                {r.payload.changes?.map((change) => (
                  <details className="file-change" key={change.path}>
                    <summary>
                      <span>{change.path.split(/[\\/]/).at(-1)}</span>
                      <span className="small muted">{change.kind}</span>
                      <CopyButton text={change.diff ?? ""} label="Копировать diff" />
                    </summary>
                    <small className="file-path">{change.path}</small>
                    {onFile && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onFile(change.path)}
                      >
                        <Icon name="file" />
                        Посмотреть файл
                      </button>
                    )}
                    <pre>{change.diff || "Сводка изменений без текстового diff"}</pre>
                  </details>
                ))}
                {r.turnId && onTurn && (
                  <button
                    type="button"
                    className="result-origin"
                    onClick={() => onTurn(r.turnId ?? "", r.threadId)}
                  >
                    <Icon name="chat" size={15} />
                    {r.threadTitle || "К сообщению"}
                    <Icon name="chevron" size={14} />
                  </button>
                )}
              </article>
            ),
          )}
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
