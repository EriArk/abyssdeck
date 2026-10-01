// Extracted from MybookOpds books reader; see SOURCE.md.
function createBookPageIndex({ load, measure, changed, frame }) {
  const layouts = new Map();
  let active = null, generation = 0, controller = null, closed = false;
  const complete = entry => entry.counts.every(n => Number.isInteger(n) && n > 0);
  function cancel() { generation++; controller?.abort(); controller = null; }
  async function calculate(entry, geometry) {
    const ticket = ++generation;
    controller = new AbortController();
    const signal = controller.signal;
    const current = () => !closed && ticket === generation;
    entry.running = true;
    try {
      let start = 0;
      while (start < entry.counts.length) {
        if (entry.counts[start] !== null) { start++; continue; }
        const batch = await load(start, signal);
        if (!current()) return;
        if (batch.total !== entry.counts.length || !Array.isArray(batch.items) || !batch.items.length ||
            batch.next !== start + batch.items.length || batch.next > batch.total)
          throw new Error('Invalid page-count batch');
        for (const [offset, item] of batch.items.entries()) {
          if (item.chapter !== start + offset || typeof item.html !== 'string')
            throw new Error('Invalid page-count chapter');
          if (entry.counts[item.chapter] !== null) continue;
          // One chapter per frame; never replace the text being read to measure it.
          await frame();
          if (!current()) return;
          const count = measure(item.html, geometry);
          if (!Number.isInteger(count) || count < 1) throw new Error('Invalid page count');
          entry.counts[item.chapter] = count;
        }
        start = batch.next;
      }
    } catch (error) {
      if (current()) entry.error = true;
    } finally {
      if (current()) { entry.running = false; changed(); }
    }
  }
  return {
    refresh(key, total, chapter, count, geometry, retry = false) {
      if (closed || total < 1) return;
      if (active?.key !== key || active.counts.length !== total) {
        cancel();
        active = layouts.get(key);
        if (!active || active.counts.length !== total) {
          active = { key, counts: Array(total).fill(null), error: false, running: false };
          layouts.set(key, active);
        }
        active.running = false;
        active.error = false;
        while (layouts.size > 3) layouts.delete(layouts.keys().next().value);
      }
      active.counts[chapter] = count;
      if (retry) active.error = false;
      if (!active.running && !active.error && !complete(active)) calculate(active, geometry);
    },
    position(chapter, page) {
      if (!active || !complete(active)) return null;
      return {
        page: active.counts.slice(0, chapter).reduce((a, b) => a + b, 0) + page + 1,
        total: active.counts.reduce((a, b) => a + b, 0),
      };
    },
    get error() { return !!active?.error; },
    invalidate() { cancel(); active = null; layouts.clear(); },
    close() { closed = true; cancel(); active = null; layouts.clear(); },
  };
}

function createReaderPages(viewport, article, blocks, rangeFor) {
  // `page` remains the individual page (including the right-hand speech page).
  // Only the visual translation and manual turns are grouped into spreads.
  let page = 0, count = 1, stride = 1, columns = 1;
  const spreadStart = () => Math.floor(page / columns) * columns;
  function snapshot(direction) {
    const doc = viewport.ownerDocument, win = doc?.defaultView;
    viewport.querySelectorAll?.('.reader-turn-sheet').forEach(node => node.remove());
    if (!article.animate || !doc || !win?.matchMedia('(min-width: 768px) and (min-height: 600px)').matches ||
        win?.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        viewport.classList.contains('reader-measure')) return () => {};
    const sheet = doc.createElement('div'), copy = article.cloneNode(true);
    sheet.className = 'reader-turn-sheet';
    sheet.setAttribute('aria-hidden', 'true'); sheet.setAttribute('inert', '');
    copy.removeAttribute('id'); copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    sheet.style.width = `${stride}px`;
    sheet.style.left = columns === 2 && direction > 0 ? `${stride}px` : '0';
    sheet.style.transformOrigin = direction > 0 ? 'left center' : 'right center';
    copy.style.transform = `translateX(${-(spreadStart() + (columns === 2 && direction > 0 ? 1 : 0)) * stride}px)`;
    sheet.append(copy);
    // Animate only a disposable visual copy. Range geometry and speech anchors
    // on the real article must never be transformed by an in-flight animation.
    return () => {
      viewport.append(sheet);
      const animation = sheet.animate([
        {transform: 'perspective(1600px) rotateY(0deg)', opacity: 1},
        {transform: `perspective(1600px) rotateY(${direction > 0 ? -85 : 85}deg)`, opacity: 0},
      ], {duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards'});
      animation.finished.catch(() => {}).finally(() => sheet.remove());
    };
  }
  const runs = blocks.flatMap((block, index) => {
    const first = block.text.search(/\S/u), last = block.text.trimEnd().length - 1;
    return first < 0 ? [] : [{ block: index, first, last, text: block.text }];
  });
  const clamp = n => Math.max(0, Math.min(count - 1, Math.floor(n) || 0));
  const valid = a => a && Number.isInteger(a.block) && Number.isInteger(a.char) &&
    a.char >= 0 && blocks[a.block] && a.char <= blocks[a.block].text.length;
  function column(anchor) {
    const length = blocks[anchor.block]?.text.length || 0;
    const rect = rangeFor({ block: anchor.block, char: Math.min(anchor.char, Math.max(0, length - 1)) })?.getBoundingClientRect();
    return rect ? clamp((rect.left - viewport.getBoundingClientRect().left + spreadStart() * stride) / stride) : 0;
  }
  function show(next, animate = false) {
    const previous = spreadStart(), target = clamp(next);
    const finish = animate && Math.floor(target / columns) * columns !== previous
      ? snapshot(target > page ? 1 : -1) : () => {};
    page = target;
    article.style.transform = `translateX(${-spreadStart() * stride}px)`;
    viewport.scrollLeft = viewport.scrollTop = 0;
    finish();
  }
  function firstAnchor(target = page) {
    // Find the exact first visible character, including pages inside a long paragraph.
    for (const run of runs) {
      if (column({ block: run.block, char: run.last }) < target) continue;
      const ink = n => { while (n < run.last && /\s/u.test(run.text[n])) n++; return n; };
      let low = run.first, high = run.last;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (column({ block: run.block, char: ink(mid) }) < target) low = mid + 1;
        else high = mid;
      }
      return { block: run.block, char: ink(low) };
    }
    const last = runs[runs.length - 1];
    return last ? { block: last.block, char: blocks[last.block].text.length } : { block: 0, char: 0 };
  }
  return {
    get page() { return page; }, get count() { return count; },
    get columns() { return columns; }, get spreadStart() { return spreadStart(); },
    get spreadEnd() { return Math.min(count - 1, spreadStart() + columns - 1); },
    get offset() { return page / Math.max(1, count - 1); },
    show, firstAnchor, snapshot,
    bounds(index = page) {
      const last = runs.at(-1);
      const anchor = firstAnchor(index), end = index + 1 < count ? firstAnchor(index + 1)
        : {block: last?.block || 0, char: last ? blocks[last.block].text.length : 0};
      return {page: index, anchor, end, empty: !last || (anchor.block === end.block && anchor.char === end.char)};
    },
    follow(anchor) { if (valid(anchor)) show(column(anchor), true); },
    layout(anchor, offset = 0) {
      if (viewport.clientWidth < 1 || viewport.clientHeight < 1) return anchor;
      viewport.querySelectorAll?.('.reader-turn-sheet').forEach(node => node.remove());
      columns = viewport.clientWidth >= 900 ? 2 : 1;
      stride = viewport.clientWidth / columns;
      viewport.classList?.toggle('reader-spread', columns === 2);
      page = 0;
      article.style.transform = "none";
      article.style.width = `${Math.max(1, stride - 44)}px`;
      // Explicit width establishes a multicol container on older iPhone WebKit.
      // column-count: 1 alone can leave a chapter as clipped vertical overflow.
      article.style.columnWidth = article.style.width;
      article.style.height = `${Math.max(1, viewport.clientHeight - 32)}px`;
      // A column plus its gap is one page wide; a spread contains two pages.
      count = Math.max(1, Math.ceil((article.scrollWidth + 44 - 1) / stride));
      show(valid(anchor) ? column(anchor) : Math.round(Math.max(0, Math.min(1, offset || 0)) * (count - 1)));
      return valid(anchor) ? { ...anchor } : firstAnchor();
    },
  };
}

function readerTextBlocks(article) {
  const blocks = [];
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const excluded = node.parentElement.closest("script,style,img,[aria-hidden='true']");
    // The offscreen measurement viewport is aria-hidden/inert, not the book's
    // text. Only exclusions INSIDE this article may remove speech content.
    if (excluded && article.contains(excluded)) continue;
    const element = node.parentElement.closest("p,h1,h2,h3,h4,blockquote,li") || article;
    let block = blocks[blocks.length - 1];
    if (!block || block.element !== element) {
      block = { element, text: "", nodes: [] };
      blocks.push(block);
    }
    block.nodes.push({ node, start: block.text.length });
    block.text += node.textContent;
  }
  return blocks;
}
function anchorRange(anchor, end = anchor.char + 1, blocks = []) {
  const block = blocks?.[anchor.block];
  if (!block?.nodes.length) return null;
  const locate = offset => {
    offset = Math.min(block.text.length, Math.max(0, offset));
    const item = [...block.nodes].reverse().find(n => n.start <= offset) || block.nodes[0];
    return [item.node, Math.min(item.node.length, offset - item.start)];
  };
  const range = document.createRange();
  range.setStart(...locate(anchor.char));
  range.setEnd(...locate(end));
  return range;
}

export {createBookPageIndex, createReaderPages, readerTextBlocks, anchorRange};
