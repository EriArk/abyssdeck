import { useEffect, useState } from "react";
import { workspaceUrl } from "./accountStorage";
import { DownloadLink, isDownloadUrl } from "./DownloadLink";
import { FilePreview } from "./FilePreview";
import { FileViewerDialog } from "./FileViewerDialog";
import { Icon } from "./icons";
import { ResultShareButton } from "./ResultSharing";
import { resultPreview } from "./resultPreview";
import type { Result } from "./types";

/** Full viewers are mounted only when a file/image is opened. */
export function ResultFilePreview({
  result,
  onClose,
  navigation,
  onSource,
  resolving = false,
  resolutionError = "",
}: {
  result: Result;
  onClose: () => void;
  navigation?: { index: number; count: number; previous?: () => void; next?: () => void };
  onSource?: () => void;
  resolving?: boolean;
  resolutionError?: string;
}) {
  const path = result.payload.url,
    mime = result.payload.mime,
    title = result.title;
  const { kind, limit } = resultPreview(result);
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const identity = `${result.id}:${path}:${revision}`;
  const [loaded, setLoaded] = useState("");
  const ready = loaded === identity;
  useEffect(() => {
    const saved = (event: Event) => {
      if ((event as CustomEvent).detail?.source === path) setRevision((v) => v + 1);
    };
    window.addEventListener("workspace-file-saved", saved);
    return () => window.removeEventListener("workspace-file-saved", saved);
  }, [path]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: An exact working-source save refreshes the viewer bytes.
  useEffect(() => {
    setFile(null);
    setUrl("");
    setError("");
    if (resolving || resolutionError) return;
    const controller = new AbortController();
    let resource = "";
    void (async () => {
      if (!isDownloadUrl(path)) throw Error();
      if (!limit || kind === "card") throw Error();
      const response = await fetch(workspaceUrl(path), {
        credentials: "same-origin",
        redirect: "error",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
      });
      if (!response.ok || !response.body) throw Error();
      const reader = response.body.getReader(),
        chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const remaining = limit - size;
          if (value.length > remaining) throw Error();
          size += value.length;
          chunks.push(new Uint8Array(value));
        }
      } finally {
        await reader.cancel();
      }
      if (controller.signal.aborted) return;
      const type =
        mime || response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      const value = new File(chunks, title, { type });
      resource = URL.createObjectURL(
        new Blob([value], { type: kind === "image" ? type : "application/octet-stream" }),
      );
      setFile(value);
      setLoaded(identity);
      setUrl(resource);
    })().catch(() => {
      if (!controller.signal.aborted)
        setError("Предпросмотр недоступен. Можно скачать исходный файл.");
    });
    return () => {
      controller.abort();
      if (resource) URL.revokeObjectURL(resource);
    };
  }, [path, mime, title, kind, limit, revision, identity, resolving, resolutionError]);
  return (
    <FileViewerDialog
      name={title}
      file={ready && !resolving && !resolutionError ? file : null}
      source={path}
      onClose={onClose}
      navigation={
        (navigation || onSource) && (
          <div className="file-viewer-navigation">
            {navigation && (
              <nav className="file-viewer-sequence" aria-label="Загруженные файлы">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Предыдущий файл"
                  disabled={!navigation.previous}
                  onClick={navigation.previous}
                >
                  <Icon name="back" />
                </button>
                <small>
                  {navigation.index + 1} / {navigation.count}
                </small>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Следующий файл"
                  disabled={!navigation.next}
                  onClick={navigation.next}
                >
                  <Icon name="chevron" />
                </button>
              </nav>
            )}
            {onSource && (
              <button type="button" className="secondary" onClick={onSource}>
                <Icon name="chat" size={17} /> К сообщению
              </button>
            )}
          </div>
        )
      }
      actions={
        !resolving &&
        !resolutionError && (
          <>
            <ResultShareButton result={result} />
            {isDownloadUrl(path) ? (
              <DownloadLink href={path} name={title} mime={mime} directDownload>
                Скачать файл
              </DownloadLink>
            ) : null}
          </>
        )
      }
    >
      {resolutionError || error ? (
        <p role="status">{resolutionError || error}</p>
      ) : file && ready ? (
        <>
          <FilePreview key={identity} file={file} objectUrl={url} source={path} full />
        </>
      ) : (
        <p role="status">
          <span className="spinner" /> Загружаем файл…
        </p>
      )}
    </FileViewerDialog>
  );
}
