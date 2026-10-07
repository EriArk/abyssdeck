import { isFileSource } from "@codex-web/shared";
import { type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { workspaceUrl } from "./accountStorage.ts";
import { FilePreview } from "./FilePreview";
import { FileViewerDialog } from "./FileViewerDialog";
import { CompactFileActions } from "./fileWorkspaceContext";
import { Icon } from "./icons";
import SaveFileWorker from "./saveFile.worker?worker";
import { useWorkspaceDialog } from "./useWorkspaceDialog";
import { ViewerEditButton } from "./ViewerEditButton";
import "./download.css";

function standalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// A preview memory budget. Explicit saves stream to disk without this ceiling.
const bufferedSaveBytes = 32 * 1024 * 1024;

function needsInPlaceSave() {
  return (
    standalone() ||
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Native browser downloads on desktop; an explicit copy fallback on iOS/PWA. */
function BrowserDownload({
  href,
  name,
  className = "secondary",
  children,
  visibleLabel = false,
}: {
  href: string;
  name: string;
  className?: string;
  children: ReactNode;
  visibleLabel?: boolean;
}) {
  const compact = useContext(CompactFileActions);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  // Never navigate an iOS/PWA window to binary content, even if sharing is unavailable.
  if (needsInPlaceSave())
    return (
      <div className="download-fallback">
        <p>
          Для этого файла системное сохранение здесь недоступно. Ссылку можно вставить в Safari.
        </p>
        {!href.startsWith("blob:") && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void (
                navigator.clipboard?.writeText(
                  new URL(
                    "/download?" + new URLSearchParams({ source: href, name }),
                    location.origin,
                  ).href,
                ) ?? Promise.reject(Error("Clipboard unavailable"))
              )
                .then(() => {
                  setCopied(true);
                  setCopyError(false);
                })
                .catch(() => setCopyError(true));
            }}
          >
            Копировать ссылку для Safari
          </button>
        )}
        {copied && <p role="status">Ссылка скопирована. Исходное окно остаётся здесь.</p>}
        {copyError && <p role="alert">Не удалось скопировать ссылку.</p>}
      </div>
    );
  return (
    <a
      className={compact && !visibleLabel ? "icon-button" : className}
      title={compact ? "Скачать файл" : undefined}
      href={href}
      download={name}
      target="_blank"
      rel="noopener noreferrer"
    >
      {compact && !visibleLabel ? (
        <>
          <Icon name="arrow-down" />
          <span className="file-action-label">{children}</span>
        </>
      ) : (
        children
      )}
    </a>
  );
}

export function isDownloadUrl(value: string | undefined): value is string {
  if (value && /^\/api\/team\/result-snapshots\/[a-f0-9-]{36}\/content$/.test(value)) return true;
  if (
    value &&
    /^\/api\/projects\/[a-zA-Z0-9_-]+\/file-archives\/[a-f0-9-]{36}\/content$/.test(value)
  )
    return true;
  if (value && /^\/api\/team\/brainstorm-conversions\/[a-zA-Z0-9_-]+\/export$/.test(value))
    return true;
  if (isFileSource(value)) return true;
  if (value && /^\/api\/threads\/[a-zA-Z0-9_-]+\/commands\/[^/?#]+\?[^#]+$/.test(value)) {
    const query = new URLSearchParams(value.split("?")[1]);
    return (
      query.size === 2 &&
      query.get("download") === "1" &&
      /^[a-zA-Z0-9_-]{1,200}$/.test(query.get("turnId") ?? "")
    );
  }
  if (value && /^\/api\/projects\/[a-zA-Z0-9_-]+\/files\/content\?[^#]+$/.test(value)) {
    const query = new URLSearchParams(value.split("?")[1]);
    return (
      query.size === 1 &&
      query.has("path") &&
      !!query.get("path") &&
      (query.get("path")?.length ?? 0) <= 2048
    );
  }
  return (
    !!value &&
    /^\/api\/(?:gpt\/projects\/[a-zA-Z0-9_-]+\/files\/[a-zA-Z0-9_-]+|gpt\/text-artifacts\/[a-f0-9]{64}|gpt\/native-assets\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/file[-_][a-zA-Z0-9_-]+|gpt\/(?:assets|results|uploads)\/[a-zA-Z0-9_-]+|gpt\/downloads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/sandbox-[a-f0-9]{64}|(?:attachments|native-images|artifacts)\/[a-zA-Z0-9_-]+)$/.test(
      value,
    )
  );
}
function fileName(header: string | null, fallback: string, mime: string) {
  let name = fallback;
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  try {
    name = encoded
      ? decodeURIComponent(encoded)
      : header?.match(/filename="([^"]+)"/i)?.[1] || fallback;
  } catch {
    /* Keep the result title. */
  }
  name =
    name
      .replace(/./gs, (c) =>
        c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || "\\/:".includes(c) ? "_" : c,
      )
      .slice(0, 180)
      .trim() || "Файл";
  const extension: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/json": "json",
  };
  if (!/\.[a-zA-Z0-9]{1,10}$/.test(name) && extension[mime]) name += "." + extension[mime];
  return name;
}
export function DownloadLink({
  href,
  name = "Файл",
  mime,
  children,
  className = "secondary",
  directDownload = false,
  onEdit,
  editLabel = "Редактировать",
  sourceRevision = 0,
  preparedFile,
  initiallyOpen = false,
  title,
  visibleLabel = false,
}: {
  href?: string;
  /** Exact immutable local bytes, e.g. an editor snapshot or extracted archive entry. */
  preparedFile?: File;
  initiallyOpen?: boolean;
  title?: string;
  /** Explicit save label in viewers, including narrow layouts. */
  visibleLabel?: boolean;
  name?: string;
  mime?: string;
  children: ReactNode;
  className?: string;
  directDownload?: boolean;
  /** Working-copy action, including explicit unlock. Other sources use the common copy editor. */
  onEdit?: (signal?: AbortSignal) => void | Promise<void>;
  editLabel?: string;
  sourceRevision?: number;
}) {
  const compact = useContext(CompactFileActions);
  const [open, setOpen] = useState(initiallyOpen),
    [file, setFile] = useState<File | null>(null),
    [objectUrl, setObjectUrl] = useState(""),
    [error, setError] = useState(""),
    [direct, setDirect] = useState<{ name: string; bytes: number } | null>(null),
    [retry, setRetry] = useState(0);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const activeShare = useRef<Promise<void> | null>(null);
  const editRequest = useRef<AbortController | null>(null);
  const [editing, setEditing] = useState(false),
    [editError, setEditError] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: Closing or changing source cancels this exact editor launch.
  useEffect(() => {
    setEditing(false);
    setEditError("");
    return () => {
      editRequest.current?.abort();
      editRequest.current = null;
    };
  }, [open, href, preparedFile]);
  useEffect(() => {
    const saved = (event: Event) => {
      if ((event as CustomEvent).detail?.source === href) setRetry((v) => v + 1);
    };
    window.addEventListener("workspace-file-saved", saved);
    return () => window.removeEventListener("workspace-file-saved", saved);
  }, [href]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly starts a fresh bounded download.
  useEffect(() => {
    if (!open && !preparedFile) {
      setFile(null);
      setObjectUrl("");
      setDirect(null);
      return;
    }
    const controller = new AbortController();
    let url = "";
    let worker: Worker | undefined;
    setFile(null);
    setObjectUrl("");
    setError("");
    setDirect(null);
    setProgress(null);
    void (async () => {
      try {
        if (preparedFile) {
          url = URL.createObjectURL(new Blob([preparedFile], { type: "application/octet-stream" }));
          setObjectUrl(url);
          setFile(preparedFile);
          return;
        }
        if (!isDownloadUrl(href)) throw Error("Ссылка на файл недоступна.");
        if (
          directDownload &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          typeof navigator.storage?.getDirectory === "function"
        ) {
          const saveWorker = new SaveFileWorker();
          worker = saveWorker;
          const value = await new Promise<File>((resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
              once: true,
            });
            saveWorker.onerror = () =>
              reject(Error("Не удалось подготовить файл в хранилище браузера."));
            saveWorker.onmessage = (event) => {
              if (event.data.released) {
                worker?.terminate();
                return;
              }
              if (controller.signal.aborted) return;
              if (event.data.progress) setProgress(event.data.progress);
              if (event.data.error)
                reject(
                  Error(
                    event.data.error === "HTTP_401"
                      ? "Войди снова, чтобы скачать файл."
                      : /HTTP_40[34]/.test(event.data.error)
                        ? "Файл удалён или доступ к нему закрыт."
                        : /quota/i.test(event.data.error)
                          ? "В хранилище браузера не хватает места для подготовки файла."
                          : "Не удалось подготовить файл: " + event.data.error,
                  ),
                );
              if (event.data.file) {
                const type = event.data.type || mime || "application/octet-stream";
                resolve(
                  new File([event.data.file], fileName(event.data.disposition, name, type), {
                    type,
                  }),
                );
              }
            };
            saveWorker.postMessage({ source: new URL(workspaceUrl(href), location.origin).href });
          });
          if (!controller.signal.aborted) setFile(value);
          return;
        }
        if (
          directDownload &&
          (typeof navigator.share !== "function" || typeof navigator.canShare !== "function")
        ) {
          setDirect({ name, bytes: 0 });
          return;
        }
        if (/^\/api\/artifacts\/[a-zA-Z0-9_-]+$/.test(href)) {
          const head = await fetch(workspaceUrl(href), {
            method: "HEAD",
            credentials: "same-origin",
            redirect: "error",
            signal: controller.signal,
          });
          if (!head.ok)
            throw Error(
              head.status === 401
                ? "Войди снова, чтобы скачать файл."
                : "Файл удалён или доступ к нему закрыт.",
            );
          const bytes = Number(head.headers.get("content-length"));
          if (bytes > bufferedSaveBytes) {
            if (!controller.signal.aborted)
              setDirect({
                name: fileName(head.headers.get("content-disposition"), name, mime || ""),
                bytes,
              });
            return;
          }
        }
        const response = await fetch(workspaceUrl(href), {
          credentials: "same-origin",
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok || !response.body)
          throw Error(
            response.status === 401
              ? "Войди снова, чтобы скачать файл."
              : "Не удалось получить файл. Попробуй ещё раз.",
          );
        const chunks: Uint8Array<ArrayBuffer>[] = [],
          reader = response.body.getReader();
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > bufferedSaveBytes) {
              if (!controller.signal.aborted)
                setDirect({
                  name: fileName(response.headers.get("content-disposition"), name, mime || ""),
                  bytes: Math.max(size, Number(response.headers.get("content-length")) || 0),
                });
              return;
            }
            chunks.push(new Uint8Array(part.value));
          }
        } finally {
          await reader.cancel();
        }
        const type =
          response.headers.get("content-type")?.split(";")[0] || mime || "application/octet-stream";
        const value = new File(
          chunks,
          fileName(response.headers.get("content-disposition"), name, type),
          { type },
        );
        if (controller.signal.aborted) return;
        // Never give executable HTML/SVG a same-origin blob document in fallback viewers.
        url = URL.createObjectURL(
          /^image\/(png|jpeg|gif|webp|avif)$/.test(type)
            ? value
            : new Blob([value], { type: "application/octet-stream" }),
        );
        setObjectUrl(url);
        setFile(value);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof TypeError || e instanceof DOMException
              ? "Не удалось загрузить файл. Проверь связь и повтори."
              : e instanceof Error
                ? e.message
                : "Файл недоступен.",
          );
      }
    })();
    const dispose = () => {
      controller.abort();
      const release = () => {
        worker?.postMessage({ cancel: true });
        if (url) URL.revokeObjectURL(url);
      };
      if (activeShare.current) void activeShare.current.finally(release);
      else release();
    };
    const leaving = (event: PageTransitionEvent) => {
      if (!event.persisted) dispose();
    };
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("pagehide", leaving);
      dispose();
    };
  }, [open, href, name, mime, retry, sourceRevision, preparedFile, directDownload]);
  const shareable =
    !!file &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  const [sharing, setSharing] = useState(false);
  const shareRequest = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Invalidate the exact share when its source or window changes.
  useEffect(() => {
    shareRequest.current++;
    setSharing(false);
    return () => {
      shareRequest.current++;
    };
  }, [open, href, preparedFile]);
  const share = () => {
    if (!file || sharing) return;
    const request = ++shareRequest.current;
    setSharing(true);
    setError("");
    // Run directly in this fresh tap; a slow fetch must not consume iOS user activation.
    let nativeShare: Promise<void>;
    try {
      nativeShare = navigator.share({ files: [file] });
    } catch (error) {
      nativeShare = Promise.reject(error);
    }
    const operation = nativeShare
      .catch((e) => {
        if (request === shareRequest.current && e?.name !== "AbortError")
          setError("Не удалось открыть меню сохранения. Попробуй ещё раз.");
      })
      .finally(() => {
        if (activeShare.current === operation) activeShare.current = null;
        if (request === shareRequest.current) setSharing(false);
      });
    activeShare.current = operation;
  };
  // File-capable system sharing keeps standalone PWAs on their current screen.
  // Do not navigate to a raw attachment: iOS may replace the PWA with unclosable Quick Look.
  const systemSave =
    typeof navigator.share === "function" && typeof navigator.canShare === "function";
  const downloadHref = preparedFile ? objectUrl : isDownloadUrl(href) ? workspaceUrl(href) : "";
  if (directDownload && !systemSave && !initiallyOpen && !needsInPlaceSave())
    return downloadHref ? (
      <BrowserDownload
        visibleLabel={visibleLabel}
        className={className}
        href={downloadHref}
        name={preparedFile?.name || name}
      >
        {children}
      </BrowserDownload>
    ) : null;
  return (
    <>
      <button
        type="button"
        className={compact && !visibleLabel ? "icon-button" : className}
        title={title ?? (compact ? "Скачать файл" : undefined)}
        onClick={(event) => {
          // Safari does not focus a tapped button by default; retain an exact return target.
          event.currentTarget.focus({ preventScroll: true });
          setOpen(true);
        }}
      >
        {compact && !visibleLabel ? (
          <>
            <Icon name="arrow-down" />
            <span className="file-action-label">{children}</span>
          </>
        ) : (
          children
        )}
      </button>
      {open && directDownload ? (
        <SaveDialog name={direct?.name || file?.name || name} onClose={() => setOpen(false)}>
          {!file && !direct && !error && (
            <p role="status">
              <span className="spinner" /> Подготавливаю файл…
              {progress && (
                <>
                  {" "}
                  {new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
                    progress.received / 1024 / 1024,
                  )}{" "}
                  МБ
                  {progress.total > 0
                    ? ` / ${new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(progress.total / 1024 / 1024)} МБ`
                    : ""}
                </>
              )}
            </p>
          )}
          {file && shareable ? (
            <button type="button" className="secondary" disabled={sharing} onClick={share}>
              Сохранить / поделиться
            </button>
          ) : (file || direct) && downloadHref ? (
            <BrowserDownload href={downloadHref} name={direct?.name || file?.name || name}>
              Скачать через браузер
            </BrowserDownload>
          ) : null}
          {error && <p role="alert">{error}</p>}
          {error && !file && needsInPlaceSave() && downloadHref && (
            <BrowserDownload href={downloadHref} name={name}>
              Скачать
            </BrowserDownload>
          )}
          {error && (
            <button type="button" className="secondary" onClick={() => setRetry((v) => v + 1)}>
              Повторить
            </button>
          )}
        </SaveDialog>
      ) : (
        open && (
          <FileViewerDialog
            name={direct?.name || file?.name || name}
            file={file}
            source={href}
            editProvided={!!onEdit}
            editLabel={editLabel}
            onClose={() => setOpen(false)}
            actions={
              <>
                {onEdit && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={editing}
                    onClick={async () => {
                      if (editRequest.current) return;
                      const controller = new AbortController();
                      editRequest.current = controller;
                      setEditing(true);
                      setEditError("");
                      try {
                        await onEdit(controller.signal);
                      } catch (e) {
                        if (!controller.signal.aborted)
                          setEditError(
                            e instanceof Error ? e.message : "Не удалось открыть редактор.",
                          );
                      } finally {
                        if (!controller.signal.aborted) {
                          editRequest.current = null;
                          setEditing(false);
                        }
                      }
                    }}
                  >
                    {editing ? "Открываю редактор…" : editLabel}
                  </button>
                )}
                {(file || downloadHref) && (
                  <DownloadLink
                    href={href}
                    preparedFile={file ?? preparedFile}
                    name={file?.name || name}
                    directDownload
                    visibleLabel
                  >
                    <Icon name="arrow-down" size={17} /> Скачать
                  </DownloadLink>
                )}
              </>
            }
          >
            {!file && !direct && !error && (
              <p role="status">
                <span className="spinner" /> Подготавливаю файл…
              </p>
            )}
            {file && (
              <FilePreview
                key={file.name + retry}
                file={file}
                objectUrl={objectUrl}
                source={href}
                full
              />
            )}
            {direct && (
              <div className="download-actions">
                <ViewerEditButton name={direct.name} source={href} />
                <p>
                  {new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
                    direct.bytes / 1024 / 1024,
                  )}{" "}
                  МБ · Исходный файл доступен для сохранения
                </p>
              </div>
            )}
            {error && <p role="alert">{error}</p>}
            {editError && <p role="alert">{editError}</p>}
            {error && (
              <button type="button" onClick={() => setRetry((v) => v + 1)}>
                Повторить
              </button>
            )}
          </FileViewerDialog>
        )
      )}
    </>
  );
}

/** A save action stays separate from the full viewer and preserves the mounted source feed. */
function SaveDialog({
  name,
  onClose,
  children,
}: {
  name: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useWorkspaceDialog(dialog);
  return createPortal(
    <dialog
      ref={dialog}
      className="workspace-window result-save-dialog"
      aria-label="Сохранить файл"
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header>
        <div>
          <strong>Сохранить файл</strong>
          <p title={name}>{name}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть сохранение"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="result-save-body">
        <CompactFileActions.Provider value={false}>{children}</CompactFileActions.Provider>
      </div>
    </dialog>,
    document.body,
  );
}
