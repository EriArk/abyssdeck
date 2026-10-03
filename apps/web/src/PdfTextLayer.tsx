import { type PDFPageProxy, TextLayer } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { type PdfMatch, readPdfText } from "./pdfText";

export default function PdfTextLayer({
  sheet,
  matches,
  current,
}: {
  sheet: PDFPageProxy;
  matches: PdfMatch[];
  current?: PdfMatch;
}) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<TextLayer | null>(null);
  const offsets = useRef<number[]>([]);
  const highlighted = useRef<{ layer: TextLayer; matches: PdfMatch[]; current?: PdfMatch } | null>(
    null,
  );
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const wrapper = host.current!;
    const container = document.createElement("div");
    container.className = "pdf-text-layer";
    const viewport = sheet.getViewport({ scale: 1 });
    container.style.setProperty("--total-scale-factor", String(viewport.userUnit));
    wrapper.replaceChildren(container);
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    const stage = wrapper.parentElement!;
    const resize = () => {
      if (!wrapper.isConnected) return;
      const width = stage.getBoundingClientRect().width;
      wrapper.style.transform = `scale(${width / viewport.width})`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();
    const controller = new AbortController();
    let rendered: TextLayer | undefined;
    const timer = setTimeout(() => {
      setStatus("Текстовый слой этой страницы недоступен.");
      controller.abort();
      rendered?.cancel();
    }, 15000);
    setStatus("");
    void readPdfText(sheet, controller.signal)
      .then(async (content) => {
        controller.signal.throwIfAborted();
        let offset = 0;
        offsets.current = content.items.flatMap((item) => {
          if (!("str" in item)) return [];
          const start = offset;
          offset += item.str.length + (item.hasEOL ? 1 : 0);
          return [start];
        });
        rendered = new TextLayer({ textContentSource: content, container, viewport });
        await rendered.render();
        controller.signal.throwIfAborted();
        layer.current = rendered;
        if (!content.items.some((item) => "str" in item && item.str.trim()))
          setStatus("На этой странице нет текстового слоя.");
        setVersion((v) => v + 1);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("Текстовый слой этой страницы недоступен.");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
      rendered?.cancel();
      layer.current = null;
      observer.disconnect();
      wrapper.replaceChildren();
    };
  }, [sheet]);
  // Highlight only actual text. Never interpret PDF strings as HTML or mutate selection.
  useEffect(() => {
    if (!version || !layer.current) return;
    const previous = highlighted.current;
    if (
      previous?.layer === layer.current &&
      previous.current === current &&
      previous.matches.length === matches.length &&
      previous.matches.every((hit, i) => hit === matches[i])
    )
      return;
    highlighted.current = { layer: layer.current, matches, current };
    let selected: HTMLElement | undefined;
    let first = 0;
    layer.current.textDivs.forEach((div, i) => {
      const text = layer.current!.textContentItemsStr[i]!;
      const offset = offsets.current[i]!;
      while (first < matches.length && matches[first]!.end <= offset) first++;
      const hits: PdfMatch[] = [];
      for (let n = first; n < matches.length && matches[n]!.start < offset + text.length; n++)
        hits.push(matches[n]!);
      const nodes: Node[] = [];
      let position = 0;
      for (const hit of hits) {
        const start = Math.max(0, hit.start - offset),
          end = Math.min(text.length, hit.end - offset);
        nodes.push(document.createTextNode(text.slice(position, start)));
        const mark = document.createElement("mark");
        mark.textContent = text.slice(start, end);
        if (hit === current) {
          mark.dataset.current = "true";
          selected ??= mark;
        }
        nodes.push(mark);
        position = end;
      }
      nodes.push(document.createTextNode(text.slice(position)));
      div.replaceChildren(...nodes);
    });
    if (selected) {
      const scroll = host.current!.closest(".pdf-sheet-scroll")!;
      const area = scroll.getBoundingClientRect(),
        rect = selected.getBoundingClientRect();
      if (rect.top < area.top || rect.bottom > area.bottom)
        scroll.scrollTop += rect.top - area.top - area.height / 3;
      if (rect.left < area.left || rect.right > area.right)
        scroll.scrollLeft += rect.left - area.left - area.width / 3;
    }
  }, [matches, current, version]);
  return (
    <>
      <div ref={host} className="pdf-text-scale" />
      {status && (
        <span className="pdf-text-status" role="status">
          {status}
        </span>
      )}
    </>
  );
}
