import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

function Thumbnail({ pdf, number }: { pdf: PDFDocumentProxy; number: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false,
      task: RenderTask | undefined;
    const timer = setTimeout(() => {
      disposed = true;
      task?.cancel();
    }, 15000);
    void pdf
      .getPage(number)
      .then(async (sheet) => {
        if (disposed) return;
        const base = sheet.getViewport({ scale: 1 });
        const viewport = sheet.getViewport({
          scale: Math.min(144 / base.width, 160 / base.height),
        });
        const target = canvas.current!;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = sheet.render({ canvas: target, viewport });
        await task.promise;
        if (!disposed) setReady(true);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      disposed = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, number]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`Миниатюра страницы ${number}`}
      style={{ visibility: ready ? "visible" : "hidden" }}
    />
  );
}
// Virtual horizontal strip: canvases exist only near its viewport, not for the whole book.
export default function PdfThumbnails({
  pdf,
  page,
  navigate,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  navigate: (page: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 1 });
  useEffect(() => {
    const el = strip.current!;
    const update = () =>
      setRange({
        start: Math.max(0, Math.floor(el.scrollLeft / 92) - 1),
        end: Math.min(pdf.numPages, Math.ceil((el.scrollLeft + el.clientWidth) / 92) + 1),
      });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [pdf]);
  useEffect(() => {
    const el = strip.current!,
      left = (page - 1) * 92;
    if (left < el.scrollLeft || left + 92 > el.scrollLeft + el.clientWidth)
      el.scrollLeft = Math.max(0, left - el.clientWidth / 2 + 46);
  }, [page]);
  return (
    <section ref={strip} className="pdf-thumbnails" aria-label="Миниатюры страниц PDF">
      <div style={{ width: pdf.numPages * 92, height: 112, position: "relative" }}>
        {Array.from({ length: Math.max(0, range.end - range.start) }, (_, index) => {
          const number = range.start + index + 1;
          return (
            <button
              type="button"
              key={number}
              style={{ left: (number - 1) * 92 }}
              aria-label={`Страница PDF ${number}`}
              aria-current={number === page ? "page" : undefined}
              onClick={() => navigate(number)}
            >
              <Thumbnail pdf={pdf} number={number} />
              <span>{number}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
