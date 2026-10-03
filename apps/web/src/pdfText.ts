import type { PDFPageProxy } from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";

export type PdfMatch = { page: number; start: number; end: number };
// Preserve offsets into the original PDF.js strings, including explicit line breaks.
export function pdfText(content: TextContent) {
  return content.items
    .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
    .join("");
}
export function pdfMatches(text: string, query: string, page: number, limit = 10000): PdfMatch[] {
  const escaped = query
    .trim()
    .split(/\s+/u)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!escaped) return [];
  const pattern = new RegExp(escaped, "giu");
  const matches: PdfMatch[] = [];
  for (const hit of text.matchAll(pattern)) {
    matches.push({ page, start: hit.index, end: hit.index + hit[0].length });
    if (matches.length >= limit) break;
  }
  return matches;
}
// One page at a time; cancel the actual worker stream on query changes/unmount.
export async function readPdfText(page: PDFPageProxy, signal: AbortSignal): Promise<TextContent> {
  signal.throwIfAborted();
  const reader = page.streamTextContent().getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const content: TextContent = { items: [], styles: {}, lang: null };
  try {
    for (;;) {
      const result = await reader.read();
      signal.throwIfAborted();
      if (result.done) return content;
      content.items.push(...result.value.items);
      Object.assign(content.styles, result.value.styles);
      content.lang = result.value.lang;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
