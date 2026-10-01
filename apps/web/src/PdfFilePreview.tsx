import {
  AnnotationMode,
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfFilePreview({ file }: { file: File }) {
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
        render = sheet.render({ canvas: target, viewport, annotationMode: AnnotationMode.DISABLE });
        await render.promise;
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
      <div className="pdf-sheet-scroll">
        <div style={{ width: `${zoom}%`, minWidth: "100%" }}>
          <canvas ref={canvas} hidden={!ready} role="img" aria-label={"PDF, страница " + page} />
        </div>
      </div>
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
