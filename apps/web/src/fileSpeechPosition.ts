/** A tap-time mapping from the displayed document to its spoken text. No saved paths or selection. */
export function visibleFileSpeech(content: HTMLElement, toolbar: HTMLElement, prose: boolean) {
  const pane = content.closest<HTMLElement>(".readable-file")!;
  const viewport = () => {
    let top = Math.max(0, toolbar.getBoundingClientRect().bottom);
    let bottom = window.innerHeight;
    for (let parent: HTMLElement | null = pane; parent; parent = parent.parentElement) {
      const rect = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
      if (parent.classList.contains("file-viewer-content")) break;
    }
    return { top, bottom };
  };
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let flat = "",
    previousBlock: Element | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.textContent || (prose && node.parentElement?.closest("pre,script,style"))) continue;
    const block = node.parentElement?.closest("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote") ?? content;
    if (previousBlock && previousBlock !== block) flat += "\n\n";
    previousBlock = block;
    const start = flat.length;
    flat += node.textContent;
    nodes.push({ node, start, end: flat.length });
  }
  const words = [...flat.matchAll(/\S+/gu)].filter(
    (word) => !prose || !/^(https?:\/\/|sandbox:)/i.test(word[0]),
  );
  const anchor = (offset: number) => {
    let low = 0,
      high = nodes.length - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (nodes[mid]!.end <= offset) low = mid + 1;
      else high = mid;
    }
    return nodes[low]!;
  };
  const rect = (index: number) => {
    const word = words[index]!;
    const start = anchor(word.index),
      end = anchor(word.index + word[0].length - 1);
    const range = document.createRange();
    range.setStart(start.node, word.index - start.start);
    range.setEnd(end.node, word.index + word[0].length - end.start);
    return range.getBoundingClientRect();
  };
  // Binary search keeps a long, wrapped single paragraph cheap to open midway.
  let low = 0,
    high = words.length;
  const bounds = viewport();
  while (low < high) {
    const mid = (low + high) >>> 1,
      box = rect(mid);
    if (box.top + box.height / 2 < bounds.top) low = mid + 1;
    else high = mid;
  }
  const first = low;
  let text = "";
  const offsets: number[] = [];
  for (let i = first; i < words.length; i++) {
    if (text) {
      const previous = words[i - 1]!;
      text += flat.slice(previous.index + previous[0].length, words[i]!.index).includes("\n")
        ? "\n\n"
        : " ";
    }
    offsets.push(text.length);
    text += words[i]![0];
  }
  return {
    text,
    onPosition(offset: number) {
      if (!content.isConnected || !offsets.length || document.visibilityState === "hidden") return;
      let low = 0,
        high = offsets.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (offsets[mid]! <= offset) low = mid;
        else high = mid - 1;
      }
      const box = rect(first + low),
        bounds = viewport();
      if (box.top >= bounds.top && box.bottom <= bounds.bottom - 16) return;
      const delta = box.top - (bounds.top + Math.max(0, bounds.bottom - bounds.top) * 0.25);
      // Only the viewer pane moves; never scroll a mounted conversation or the page.
      for (let parent: HTMLElement | null = pane; parent; parent = parent.parentElement) {
        if (
          parent.scrollHeight > parent.clientHeight + 1 &&
          /auto|scroll/.test(getComputedStyle(parent).overflowY)
        ) {
          parent.scrollTop += delta;
          break;
        }
        if (parent.classList.contains("file-viewer-content")) break;
      }
    },
  };
}
