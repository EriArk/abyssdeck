import type { ResultItem } from "@codex-web/shared";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArtifactCapture } from "./ArtifactCapture";
import { workspaceMediaUrl } from "./accountStorage";
import { CodexResultTimeline } from "./CodexResultTimeline";
import { CollapsibleCode } from "./CollapsibleCode";
import { CommandOutput } from "./CommandOutput";
import { CopyButton } from "./CopyButton";
import { DownloadLink, isDownloadUrl } from "./DownloadLink";
import { GptSteps } from "./GptProgress";
import { Icon } from "./icons";
import { MarkdownTable } from "./MarkdownTable";
import { ResultActions } from "./ResultActions";
import { resultSelectable } from "./ResultBatchActions";
import { ResultShareButton } from "./ResultSharing";

function openResultLink(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.open(
    event.currentTarget.href,
    "_blank",
    "popup=yes,width=1100,height=800,noopener,noreferrer",
  );
}

export type ResultDisclosure = {
  disclosure: Record<string, boolean>;
  setDisclosure: Dispatch<SetStateAction<Record<string, boolean>>>;
};
export function ResultWork({
  result: r,
  onFile,
}: {
  result: ResultItem;
  onFile?: (path: string) => void;
}) {
  return (
    <>
      {r.payload.message && <p>{r.payload.message}</p>}
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
        <div className="result-command">
          <CopyButton text={r.payload.command} label="Копировать команду" />
          <pre>{r.payload.command}</pre>
        </div>
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
            <button type="button" className="secondary" onClick={() => onFile(change.path)}>
              <Icon name="file" />
              Посмотреть файл
            </button>
          )}
          <pre>{change.diff || "Сводка изменений без текстового diff"}</pre>
        </details>
      ))}
      {r.payload.excerpt && <pre className="result-text-excerpt">{r.payload.excerpt}</pre>}
    </>
  );
}

export function ResultCard({
  result: r,
  focusId,
  inspect,
  onTurn,
  onFile,
  onSaveLink,
  onRetry,
  selecting,
  selected,
  onSelect,
  disclosure,
  setDisclosure,
}: ResultDisclosure & {
  result: ResultItem;
  focusId: string;
  inspect: (r: ResultItem) => void;
  onTurn?: (id: string, threadId?: string) => void;
  onFile?: (path: string) => void;
  onSaveLink?: (r: ResultItem) => void;
  onRetry?: () => void;
  selecting: boolean;
  selected: ResultItem[];
  onSelect: Dispatch<SetStateAction<ResultItem[]>>;
}) {
  const image = r.type === "image",
    reasoning = ["reasoning", "reasoning-request"].includes(r.type);
  const file = ["file", "artifact", "image"].includes(r.type);
  const service = r.type === "link" || r.type === "preview";
  const work = !file && !service && !reasoning;
  const open = !!disclosure[r.id];
  const toggle = (value: boolean) =>
    setDisclosure((old) => (old[r.id] === value ? old : { ...old, [r.id]: value }));
  const format =
    r.type === "preview"
      ? "HTML-демо"
      : r.type === "link"
        ? "Ссылка"
        : r.title.split(".").length > 1
          ? r.title.split(".").at(-1)!.toUpperCase()
          : "Файл";
  const date = new Date(r.payload.capturedAt || r.createdAt).toLocaleString("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = reasoning ? r.payload.text || r.title : r.title;
  const actions = (
    <ResultActions title={r.title}>
      <ResultShareButton result={r} withIcon />
      {file && r.payload.url && (
        <DownloadLink directDownload href={r.payload.url} name={r.title}>
          <Icon name="arrow-down" /> Скачать
        </DownloadLink>
      )}
      {r.type === "link" && r.payload.url && (
        <a className="secondary" href={r.payload.url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" />
          Открыть ссылку
        </a>
      )}
      {r.type === "link" && r.payload.url && (
        <CopyButton text={r.payload.url} label="Копировать ссылку" />
      )}
      {onSaveLink && !r.payload.codexTurn && (
        <button type="button" className="secondary" onClick={() => onSaveLink(r)}>
          <Icon name="pin" />
          Сохранить ссылку
        </button>
      )}
      {r.turnId && onTurn && (
        <button
          type="button"
          className="result-origin"
          onClick={() => onTurn(r.turnId!, r.threadId)}
        >
          <Icon name="chat" />
          {r.threadTitle || "К сообщению"}
        </button>
      )}
    </ResultActions>
  );
  const select = selecting && resultSelectable(r) && (
    <label className="result-select">
      <input
        type="checkbox"
        aria-label={`Выбрать ${r.title}`}
        checked={selected.some((item) => item.id === r.id)}
        disabled={selected.length >= 100 && !selected.some((item) => item.id === r.id)}
        onChange={(event) =>
          onSelect((old) =>
            event.target.checked
              ? [...old.filter((item) => item.id !== r.id), r]
              : old.filter((item) => item.id !== r.id),
          )
        }
      />
    </label>
  );
  return (
    <article
      className={`result-entry result-${r.type}`}
      data-result={r.id}
      data-focused={r.id === focusId}
    >
      {image && (
        <div className="result-picture">
          <button
            type="button"
            className="screenshot-preview"
            onClick={() => inspect(r)}
            aria-label="Открыть снимок"
          >
            <img
              src={workspaceMediaUrl(r.payload.url || "")}
              loading="lazy"
              decoding="async"
              alt={r.title}
              width={r.payload.width}
              height={r.payload.height}
            />
          </button>
          {select}
          {actions}
        </div>
      )}
      <div className="result-entry-heading">
        {!image && select}
        {!image && (
          <Icon
            name={
              reasoning
                ? "chat"
                : r.type === "link"
                  ? "link"
                  : r.type === "preview"
                    ? "remote"
                    : work
                      ? "activity"
                      : "file"
            }
          />
        )}
        <div className="result-entry-name">
          <h3 aria-label={r.title}>
            {(file && r.payload.url) || r.type === "preview" ? (
              <button
                className="result-title-open"
                type="button"
                onClick={() => inspect(r)}
                aria-label={`Открыть ${r.title}`}
              >
                {title}
              </button>
            ) : r.type === "link" && r.payload.url ? (
              <a
                className="result-title-open"
                href={r.payload.url}
                onClick={openResultLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                {title}
              </a>
            ) : (
              title
            )}
          </h3>
          <div className="result-entry-meta">
            {(file || service) && <span>{format}</span>}
            {r.payload.bytes !== undefined && (
              <span>
                {new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
                  r.payload.bytes / 1024,
                )}{" "}
                КБ
              </span>
            )}
            {r.createdAt && <time dateTime={r.createdAt}>{date}</time>}
          </div>
        </div>
        {!image && actions}
      </div>
      {r.type === "artifact" && !r.payload.url && r.payload.captureId && (
        <ArtifactCapture
          id={r.payload.captureId}
          status={r.payload.status || "failed"}
          message={r.payload.message}
          onComplete={onRetry}
        />
      )}
      {file && r.payload.message && (
        <p className="result-file-size" role="status">
          {r.payload.message}
        </p>
      )}
      {(reasoning || work || (service && (r.payload.excerpt || r.payload.text))) && (
        <details
          className="result-reasoning-details"
          open={open}
          onToggle={(event) => toggle(event.currentTarget.open)}
        >
          <summary>
            <Icon name="chevron" size={16} />
            {reasoning ? "Рассуждения" : work ? r.title : "Описание"}
            {r.type === "check" && (
              <span className={`badge ${r.payload.exitCode === 0 ? "success" : "danger"}`}>
                {r.payload.exitCode === 0 ? "Успешно" : "Ошибка"}
              </span>
            )}
          </summary>
          {reasoning ? (
            r.payload.codexTurn ? (
              <CodexResultTimeline
                result={r}
                expanded={open}
                onFile={onFile}
                disclosure={disclosure}
                setDisclosure={setDisclosure}
              />
            ) : (
              <GptSteps items={r.payload.steps ?? []} />
            )
          ) : work ? (
            <ResultWork result={r} onFile={onFile} />
          ) : (
            <p>{r.payload.excerpt || r.payload.text}</p>
          )}
        </details>
      )}
    </article>
  );
}
