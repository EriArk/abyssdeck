import {
  AnnotationMode,
  GlobalWorkerOptions,
  getDocument,
  type PageViewport,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

import PdfMarkup from "./PdfMarkup";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfFilePreview({
  file,
  source,
  annotate = false,
}: {
  file: File;
  source?: string;
  annotate?: boolean;
}) {
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [comments, setComments] = useState<{ id: string; text: string }[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(100),
    [error, setError] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false,
      task: ReturnType<typeof getDocument> | undefined;
    const timer = setTimeout(() => {
      setError(true);
      void task?.destroy();
    }, 15000);
    void file
      .arrayBuffer()
      .then(async (data) => {
        if (disposed) return;
        task = getDocument({
          data,
          enableXfa: false,
          useWasm: false,
          useWorkerFetch: false,
          disableFontFace: true,
          useSystemFonts: true,
          maxImageSize: 8_000_000,
          canvasMaxAreaInBytes: 16_000_000,
        });
        task.onPassword = () => {
          setError(true);
          void task?.destroy();
        };
        const doc = await task.promise;
        if (!disposed) setPdf(doc);
      })
      .catch(() => {
        if (!disposed) setError(true);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      disposed = true;
      clearTimeout(timer);
      void task?.destroy();
    };
  }, [file]);
  useEffect(() => {
    if (!pdf) return;
    let disposed = false,
      render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    setReady(false);
    const timer = setTimeout(() => {
      setError(true);
      render?.cancel();
    }, 15000);
    void pdf
      .getPage(page)
      .then(async (sheet) => {
        if (disposed || !canvas.current) return;
        const original = sheet.getViewport({ scale: 1 });
        setViewport(original);
        const viewport = sheet.getViewport({
          scale: Math.min(
            2 * (zoom / 100),
            4096 / original.width,
            4096 / original.height,
            Math.sqrt(4_000_000 / (original.width * original.height)),
          ),
        });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        render = sheet.render({ canvas: target, viewport, annotationMode: AnnotationMode.ENABLE });
        const [, notes] = await Promise.all([render.promise, sheet.getAnnotations()]);
        if (!disposed)
          setComments(
            notes
              .filter((note) => note.subtype === "Text" && note.contentsObj?.str)
              .map((note) => ({ id: note.id, text: note.contentsObj.str })),
          );
        if (!disposed) setReady(true);
      })
      .catch(() => {
        if (!disposed) setError(true);
      })
      .finally(() => clearTimeout(timer));
    return () => {
      disposed = true;
      clearTimeout(timer);
      render?.cancel();
    };
  }, [pdf, page, zoom]);
  if (error) return <p className="file-preview-fallback">PDF · Предпросмотр недоступен</p>;
  return (
    <div className="file-pdf">
      {!ready && (
        <p role="status">
          <span className="spinner" /> Загружаю предпросмотр…
        </p>
      )}
      <PdfMarkup
        key={file.name + file.lastModified}
        file={file}
        source={source}
        enabled={annotate}
        page={page}
        viewport={viewport}
        zoom={zoom}
        ready={ready}
      >
        <canvas ref={canvas} hidden={!ready} role="img" aria-label={"PDF, страница " + page} />
      </PdfMarkup>
      {comments.length > 0 && (
        <details className="pdf-comments">
          <summary>Комментарии в документе</summary>
          {comments.map((note) => (
            <p key={note.id}>{note.text}</p>
          ))}
        </details>
      )}
      {pdf && (
        <div className="file-pages">
          <button
            type="button"
            aria-label="Предыдущая страница PDF"
            disabled={page <= 1 || !ready}
            onClick={() => setPage((p) => p - 1)}
          >
            ‹
          </button>
          <span>
            {page} / {pdf.numPages}
          </span>
          <select
            aria-label="Масштаб PDF"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[100, 125, 150, 200, 300].map((value) => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Следующая страница PDF"
            disabled={page >= pdf.numPages || !ready}
            onClick={() => setPage((p) => p + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
