export type Anchor = { block: number; char: number };
export type TextBlock = { element: Element; text: string; nodes: { node: Text; start: number }[] };
export type PageBounds = { page: number; anchor: Anchor; end: Anchor; empty: boolean };
export function readerTextBlocks(article: HTMLElement): TextBlock[];
export function anchorRange(anchor: Anchor, end: number, blocks: TextBlock[]): Range | null;
export function createReaderPages(
  viewport: HTMLElement,
  article: HTMLElement,
  blocks: TextBlock[],
  range: (anchor: Anchor) => Range | null,
): {
  readonly page: number;
  readonly count: number;
  readonly columns: number;
  readonly spreadStart: number;
  readonly spreadEnd: number;
  show(page: number, animate?: boolean): void;
  layout(anchor: Anchor | null, offset?: number): Anchor;
  firstAnchor(page?: number): Anchor;
  bounds(page?: number): PageBounds;
  follow(anchor: Anchor): void;
};
export type Geometry = { width: number; height: number; font: string };
export function createBookPageIndex(options: {
  load: (
    start: number,
    signal: AbortSignal,
  ) => Promise<{ total: number; next: number; items: { chapter: number; html: string }[] }>;
  measure: (html: string, geometry: Geometry) => number;
  changed: () => void;
  frame: () => Promise<void>;
}): {
  refresh(key: string, total: number, chapter: number, count: number, geometry: Geometry): void;
  position(chapter: number, page: number): { page: number; total: number } | null;
  readonly error: boolean;
  close(): void;
};
