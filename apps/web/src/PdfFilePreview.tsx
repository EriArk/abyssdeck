import {
  AnnotationMode,
  GlobalWorkerOptions,
  getDocument,
  type PageViewport,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import PdfMarkup from "./PdfMarkup";
import PdfTextLayer from "./PdfTextLayer";
import PdfThumbnails from "./PdfThumbnails";
import { usePdfSearch } from "./usePdfSearch";
import "./pdf-reading.css";

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
  const [sheet, setSheet] = useState<PDFPageProxy | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [thumbnails, setThumbnails] = useState(false);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [comments, setComments] = useState<{ id: string; text: string }[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(100),
    [error, setError] = useState(false),
    [ready, setReady] = useState(false);
  const search = usePdfSearch(pdf, query, setPage);
  const pageMatches = useMemo(
    () => search.matches.filter((hit) => hit.page === page),
    [search.matches, page],
  );
  useEffect(() => {
    setPdf(null);
    setSheet(null);
    setPage(1);
    setZoom(100);
    setError(false);
    setReady(false);
    setQuery("");
    setComments([]);
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
        if (!disposed) {
          setSheet(sheet);
          setReady(true);
        }
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
        readingTools={
          pdf && (
            <div className="pdf-toolbar-group">
              {" "}
              <button
                type="button"
                className="icon-button"
                aria-label="Миниатюры PDF"
                title="Миниатюры страниц"
                aria-pressed={thumbnails}
                onClick={() => setThumbnails(!thumbnails)}
              >
                <Icon name="grid" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Поиск в PDF"
                title="Найти в документе"
                aria-pressed={searchOpen}
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  if (searchOpen) setQuery("");
                }}
              >
                <Icon name="search" />
              </button>
            </div>
          )
        }
        navigation={
          pdf && (
            <>
              {searchOpen && (
                <div className="pdf-search-results">
                  {" "}
                  <input
                    type="search"
                    aria-label="Найти текст в PDF"
                    placeholder="Найти в документе"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        search.step(e.shiftKey ? -1 : 1);
                      }
                      if (e.key === "Escape") {
                        setSearchOpen(false);
                        setQuery("");
                      }
                    }}
                  />
                  <span role="status">{query.trim() ? search.status : ""}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Предыдущее совпадение PDF"
                    title="Предыдущее совпадение"
                    disabled={!search.matches.length}
                    onClick={() => search.step(-1)}
                  >
                    <Icon name="back" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Следующее совпадение PDF"
                    title="Следующее совпадение"
                    disabled={!search.matches.length}
                    onClick={() => search.step(1)}
                  >
                    <Icon name="chevron" />
                  </button>
                </div>
              )}
              {thumbnails && <PdfThumbnails pdf={pdf} page={page} navigate={setPage} />}
            </>
          )
        }
      >
        <canvas ref={canvas} hidden={!ready} role="img" aria-label={"PDF, страница " + page} />
        {ready && sheet && (
          <PdfTextLayer
            sheet={sheet}
            matches={pageMatches}
            current={search.current?.page === page ? search.current : undefined}
          />
        )}
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
