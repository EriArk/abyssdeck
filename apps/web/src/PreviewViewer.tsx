import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { workspaceMediaUrl } from "./accountStorage.ts";
import { api, messageOf } from "./api";
import { Icon } from "./icons";
import type { Result } from "./types";
import "./preview.css";

export function PreviewViewer({
  result,
  onClose,
  embedded = false,
}: {
  result: Result;
  onClose: () => void;
  embedded?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [wide, setWide] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry replaces the frame and must cancel its old image requests.
  useEffect(() => {
    const base = result.payload.url ?? "";
    if (!/^\/api\/previews\/[0-9a-f]{64}$/.test(base)) return;
    const controller = new AbortController();
    const pending = new Set<string>();
    const queue: string[] = [];
    let running = 0;
    const pump = () => {
      while (running < 3 && queue.length && !controller.signal.aborted) {
        const key = queue.shift()!;
        const target = frame.current?.contentWindow;
        running++;
        void (async () => {
          const file = await api<{ url: string }>(base.slice(4) + "/images/" + key, {
            signal: controller.signal,
          });
          if (!/^\/api\/artifacts\/[a-f0-9-]{36}$/.test(file.url))
            throw new Error("Изображение недоступно.");
          const response = await fetch(workspaceMediaUrl(file.url)!, {
            credentials: "same-origin",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Не удалось загрузить изображение. Повтори загрузку.");
          const blob = await response.blob();
          if (!controller.signal.aborted && target === frame.current?.contentWindow)
            target?.postMessage({ kind: "abyssdeck-preview-image", key, blob }, "*");
        })()
          .catch((error) => {
            if (!controller.signal.aborted && target === frame.current?.contentWindow)
              target?.postMessage(
                { kind: "abyssdeck-preview-image", key, error: messageOf(error) },
                "*",
              );
          })
          .finally(() => {
            pending.delete(key);
            running--;
            pump();
          });
      }
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.kind !== "abyssdeck-preview-image" ||
        typeof event.data.key !== "string" ||
        !/^[a-f0-9]{64}$/.test(event.data.key) ||
        pending.has(event.data.key)
      )
        return;
      pending.add(event.data.key);
      queue.push(event.data.key);
      pump();
    };
    window.addEventListener("message", receive);
    return () => {
      controller.abort();
      window.removeEventListener("message", receive);
    };
  }, [result.payload.url, attempt]);
  useEffect(() => {
    if (embedded) return;
    const root = document.getElementById("root"),
      focused = document.activeElement as HTMLElement | null;
    const prior = root?.inert ?? false;
    if (root) root.inert = true;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (root) root.inert = prior;
      focused?.focus();
    };
  }, [embedded]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: The retry counter deliberately reloads a failed document.
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setError("");
    const path = result.payload.url ?? "";
    if (!/^\/api\/(?:gpt\/)?previews\/[0-9a-f]{64}$/.test(path)) {
      setError("Демо недоступно.");
      return;
    }
    void api(path.slice(4) + "/ready?images=1")
      .then(() => {
        if (!disposed) setReady(true);
      })
      .catch((e) => {
        if (!disposed) setError(messageOf(e));
      });
    return () => {
      disposed = true;
    };
  }, [result.payload.url, attempt]);
  const content = (
    <div className={embedded ? "preview-embedded" : "preview-overlay"}>
      <div
        ref={dialog}
        className={embedded ? "preview-inline-viewer" : "preview-viewer"}
        role="dialog"
        aria-modal={embedded ? undefined : true}
        aria-label={result.title}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (!embedded && event.key === "Tab") {
            const items = dialog.current?.querySelectorAll<HTMLElement>("button, iframe");
            const first = items?.[0],
              last = items?.[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        {!embedded && (
          <div className="viewer-toolbar">
            <strong>{result.title}</strong>
            <button
              type="button"
              className="secondary"
              aria-pressed={wide}
              onClick={() => setWide(!wide)}
            >
              {wide ? "По ширине" : "960 px"}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Закрыть демо"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        <div className="preview-stage" data-wide={wide}>
          {!ready && (
            <div className="empty-state" role="status">
              {error ? (
                <>
                  <p>{error}</p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setAttempt((n) => n + 1)}
                  >
                    Повторить
                  </button>
                </>
              ) : (
                <>
                  <span className="activity-spinner" />
                  <p>Открываем демо…</p>
                </>
              )}
            </div>
          )}
          {ready && (
            <iframe
              ref={frame}
              title={result.title}
              src={workspaceMediaUrl(result.payload.url + "?images=1")}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>
    </div>
  );
  return embedded ? content : createPortal(content, document.body);
}
