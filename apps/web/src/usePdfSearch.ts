import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { type PdfMatch, pdfMatches, pdfText, readPdfText } from "./pdfText";

export function usePdfSearch(
  pdf: PDFDocumentProxy | null,
  query: string,
  navigate: (page: number) => void,
) {
  const [result, setResult] = useState<{
    query: string;
    matches: PdfMatch[];
    progress: number;
    done: boolean;
    partial: boolean;
  }>({ query: "", matches: [], progress: 0, done: true, partial: false });
  const [selected, setSelected] = useState(0);
  const nav = useRef(navigate);
  nav.current = navigate;
  useEffect(() => {
    setSelected(0);
    if (!pdf || !query.trim()) {
      setResult({ query, matches: [], progress: 0, done: true, partial: false });
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      const matches: PdfMatch[] = [];
      let progress = 0,
        partial = false,
        jumped = false;
      const publish = (done: boolean) => {
        if (!disposed) setResult({ query, matches: [...matches], progress, done, partial });
      };
      publish(false);
      void (async () => {
        try {
          for (let number = 1; number <= pdf.numPages; number++) {
            deadline = setTimeout(() => controller.abort(), 15000);
            const sheet = await pdf.getPage(number);
            const content = await readPdfText(sheet, controller.signal);
            controller.signal.throwIfAborted();
            clearTimeout(deadline);
            matches.push(...pdfMatches(pdfText(content), query, number, 10000 - matches.length));
            progress = number;
            if (!jumped && matches.length) {
              jumped = true;
              nav.current(matches[0]!.page);
            }
            if (matches.length >= 10000) {
              partial = true;
              break;
            }
            publish(false);
          }
        } catch {
          partial = true;
        } finally {
          clearTimeout(deadline);
          publish(true);
        }
      })();
    }, 250);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [pdf, query]);
  const matches = result.query === query ? result.matches : [];
  return {
    matches,
    current: matches[selected],
    status:
      result.query !== query || !result.done
        ? `Поиск… ${result.query === query ? result.progress : 0} / ${pdf?.numPages ?? 0}`
        : `${matches.length ? selected + 1 : 0} / ${matches.length}${result.partial ? "+ · поиск неполный" : ""}`,
    step: (delta: number) => {
      if (!matches.length) return;
      const index = (selected + delta + matches.length) % matches.length;
      setSelected(index);
      nav.current(matches[index]!.page);
    },
  };
}
