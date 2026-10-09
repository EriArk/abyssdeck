/* biome-ignore-all lint/suspicious/noArrayIndexKey: Chapter ordinals belong to immutable document bytes. */
import { useEffect, useRef, useState } from "react";
import { accountLocalStorage as storage, workspaceMediaUrl } from "./accountStorage";
import { api } from "./api";
import type { ReadingDocument } from "./bookReader/document";
import { type ReaderLocation, type ReaderMatch, validLocation } from "./bookReader/navigation";
import type { Position, SpeechPage, VoiceInfo } from "./bookReader/page-voice";
import {
  type Anchor,
  anchorRange,
  createBookPageIndex,
  createReaderPages,
  type Geometry,
  readerTextBlocks,
} from "./bookReader/pages";
import { PrivatePageVoice, speechTransport } from "./bookReader/speech";
import { BrowserSpeech, chunks, VoiceController } from "./bookReader/voice-reader";
import type { DocumentResolver } from "./documentReferences";
import { Icon } from "./icons";
import { claimSpeech } from "./MessageSpeech";
import { ReaderNavigation } from "./ReaderNavigation";
import "./book-reader.css";

type Preferences = { size: number; line: number; rate: number; engine: "server" | "browser" };
const preferences = (): Preferences => {
  try {
    const saved = JSON.parse(storage.getItem("codexweb-reader-preferences") || "{}");
    return {
      size: saved.size >= 14 && saved.size <= 32 ? saved.size : 20,
      line: saved.line >= 1.2 && saved.line <= 2.2 ? saved.line : 1.7,
      rate: saved.rate >= 0.5 && saved.rate <= 2 ? saved.rate : 0.85,
      engine: saved.engine === "browser" ? "browser" : "server",
    };
  } catch {
    return { size: 20, line: 1.7, rate: 0.85, engine: "server" };
  }
};
type Controls = {
  turn(delta: number): void;
  chapter(index: number): void;
  play(): void;
  stop(): void;
  configure(prefs: Preferences): void;
  position(): ReaderLocation & { excerpt: string };
  jump(location: ReaderLocation, hit?: ReaderMatch): Promise<boolean>;
};
export function BookReader({
  document: book,
  onOpenLink,
  resolveImage,
}: {
  document: ReadingDocument;
  onOpenLink?: (href: string) => void;
  resolveImage?: DocumentResolver;
}) {
  const root = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    article = useRef<HTMLElement>(null),
    highlight = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const [prefs, setPrefs] = useState(preferences),
    [settings, setSettings] = useState(false);
  const [state, setState] = useState({
    chapter: 0,
    label: "Считаем страницы…",
    previous: false,
    next: false,
    busy: true,
    voice: "idle",
    error: "",
  });
  const [navigation, setNavigation] = useState<"search" | "bookmarks" | null>(null);
  const imageResolver = useRef(resolveImage);
  imageResolver.current = resolveImage;
  const initialPrefs = useRef(prefs);
  initialPrefs.current = prefs;
  useEffect(() => {
    const host = root.current!,
      pane = viewport.current!,
      text = article.current!;
    let disposed = false,
      sessionEnded = false,
      ticket = 0,
      chapter = 0,
      loading = false;
    let anchor: Anchor = { block: 0, char: 0 },
      pages: ReturnType<typeof createReaderPages> | undefined;
    let blocks = readerTextBlocks(text),
      currentPrefs = initialPrefs.current;
    let voice: VoiceController | PrivatePageVoice | undefined,
      voiceStatus = "idle",
      error = "",
      savedAt = 0;
    let voiceInfo: VoiceInfo = { available: false },
      infoReady = false;
    const owner = "reader:" + crypto.randomUUID(),
      cache = new Map<number, Promise<string>>();
    const html = (index: number) => {
      let found = cache.get(index);
      if (!found) {
        found = book.chapter(index);
        cache.set(index, found);
      }
      while (cache.size > 8) cache.delete(cache.keys().next().value!);
      return found;
    };
    const geometry = (): Geometry => ({
      width: pane.clientWidth,
      height: pane.clientHeight,
      font: `${currentPrefs.size}:${currentPrefs.line}`,
    });
    const key = () => JSON.stringify(geometry());
    const measure = (value: string, g = geometry()) => {
      const v = document.createElement("div"),
        a = document.createElement("article");
      v.className = "reader-scroll reader-measure";
      v.setAttribute("aria-hidden", "true");
      v.setAttribute("inert", "");
      v.style.width = `${g.width}px`;
      v.style.height = `${g.height}px`;
      a.innerHTML = value;
      v.append(a);
      host.append(v);
      const b = readerTextBlocks(a),
        p = createReaderPages(v, a, b, (at) => anchorRange(at, at.char + 1, b));
      p.layout(null);
      return { viewport: v, article: a, blocks: b, pages: p, dispose: () => v.remove() };
    };
    let hit: ReaderMatch | undefined;
    const paintHit = () => {
      const layer = highlight.current;
      if (!layer) return;
      layer.replaceChildren();
      if (!hit || hit.chapter !== chapter || loading) return;
      const range = anchorRange(hit.anchor, hit.anchor.char, blocks);
      const end = anchorRange(hit.end, hit.end.char, blocks);
      if (!range || !end) return;
      range.setEnd(end.endContainer, end.endOffset);
      const box = pane.getBoundingClientRect();
      for (const rect of Array.from(range.getClientRects()).slice(0, 200)) {
        if (
          rect.right <= box.left ||
          rect.left >= box.right ||
          rect.bottom <= box.top ||
          rect.top >= box.bottom
        )
          continue;
        const mark = document.createElement("i");
        Object.assign(mark.style, {
          left: `${rect.left - box.left}px`,
          top: `${rect.top - box.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
        layer.append(mark);
      }
    };
    const update = () => {
      if (disposed) return;
      paintHit();
      const position = index.position(chapter, pages?.spreadStart || 0);
      const end = pages ? pages.spreadEnd - pages.spreadStart : 0;
      setState({
        chapter,
        label: loading
          ? "Загрузка…"
          : position
            ? `Стр. ${position.page}${end ? "–" + (position.page + end) : ""} / ${position.total}`
            : index.error
              ? `Раздел ${chapter + 1} · стр. ${(pages?.page || 0) + 1}`
              : "Считаем страницы…",
        previous: chapter > 0 || (pages?.spreadStart || 0) > 0,
        next: chapter < book.titles.length - 1 || (!!pages && pages.spreadEnd < pages.count - 1),
        busy: loading,
        voice: voiceStatus,
        error,
      });
    };
    const index = createBookPageIndex({
      load: async (start) => ({
        total: book.titles.length,
        next: start + 1,
        items: [{ chapter: start, html: await html(start) }],
      }),
      measure: (value, g) => {
        const m = measure(value, g);
        try {
          return m.pages.count;
        } finally {
          m.dispose();
        }
      },
      changed: update,
      frame: () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
    });
    const save = (position?: Position) => {
      if (disposed || sessionEnded || loading) return;
      try {
        const records = JSON.parse(storage.getItem("codexweb-reader-positions") || "{}");
        records[book.id] = {
          chapter: position?.chapter ?? chapter,
          anchor: position?.anchor ?? anchor,
          updated: Date.now(),
        };
        const recent = Object.entries(records)
          .sort(
            (a, b) =>
              Number((b[1] as { updated: number }).updated) -
              Number((a[1] as { updated: number }).updated),
          )
          .slice(0, 64);
        storage.setItem("codexweb-reader-positions", JSON.stringify(Object.fromEntries(recent)));
      } catch {}
    };
    const refresh = () => {
      if (disposed || loading || !pages) return;
      anchor = pages.layout(anchor);
      index.refresh(key(), book.titles.length, chapter, pages.count, geometry());
      if (voice instanceof PrivatePageVoice) voice.reflow();
      update();
    };
    const load = async (
      target: number,
      at: Anchor | null = null,
      offset = 0,
      current = () => true,
    ) => {
      const serial = ++ticket;
      loading = true;
      update();
      try {
        const value = await html(target);
        if (disposed || serial !== ticket || !current()) return false;
        chapter = target;
        text.innerHTML = value;
        // Fetch only the displayed chapter, after text/pagination are ready. Fixed
        // thumbnail geometry keeps late images from shifting the reading position.
        const pendingImages = Array.from(
          text.querySelectorAll<HTMLImageElement>("img[data-document-image]"),
        );
        const resolve = imageResolver.current;
        if (resolve)
          void Promise.all(
            Array.from({ length: Math.min(3, pendingImages.length) }, async () => {
              while (pendingImages.length && !disposed && serial === ticket) {
                const image = pendingImages.shift()!;
                try {
                  const linked = await resolve(image.dataset.documentImage!);
                  const url = workspaceMediaUrl(linked.url);
                  if (!disposed && serial === ticket && url) image.src = url;
                } catch {
                  /* Keep the clickable source for an explicit retry. */
                }
              }
            }),
          );
        blocks = readerTextBlocks(text);
        pages = createReaderPages(pane, text, blocks, (pos) =>
          anchorRange(pos, pos.char + 1, blocks),
        );
        anchor = pages.layout(at, offset);
        loading = false;
        index.refresh(key(), book.titles.length, chapter, pages.count, geometry());
        update();
        save();
        return true;
      } catch {
        if (!disposed && serial === ticket) {
          error = "Не удалось открыть раздел.";
          update();
        }
        return false;
      } finally {
        if (!disposed && serial === ticket) {
          loading = false;
          update();
        }
      }
    };
    const follow = (pos: Anchor) => {
      anchor = { ...pos };
      const old = pages?.page;
      pages?.follow(anchor);
      text.querySelector(".spoken-block")?.classList.remove("spoken-block");
      if (voice?.active) blocks[anchor.block]?.element.classList.add("spoken-block");
      if (old !== pages?.page) update();
      if (old !== pages?.page || Date.now() - savedAt > 2000) {
        save();
        savedAt = Date.now();
      }
    };
    const voiceState = (status: string, message = "") => {
      voiceStatus = status;
      error =
        status === "error"
          ? message === "unavailable"
            ? "Голос недоступен. Выбери другой режим."
            : "Озвучивание остановилось. Нажми воспроизведение для продолжения."
          : message;
      if (status === "idle" || status === "ended")
        text.querySelector(".spoken-block")?.classList.remove("spoken-block");
      update();
    };
    const position = (): Position => ({ book: book.id, chapter, anchor });
    const speechPage = (pos?: Position): SpeechPage => {
      if (!pages || loading) throw Error("Дождись загрузки страницы");
      if (pos?.book === book.id && pos.chapter === chapter) anchor = pos.anchor;
      anchor = pages.layout(anchor);
      update();
      const bounds = pages.bounds();
      return {
        book: book.id,
        chapter,
        ...bounds,
        anchor: { ...anchor },
        empty:
          bounds.empty || (anchor.block === bounds.end.block && anchor.char === bounds.end.char),
        layout: key(),
      };
    };
    const nextPage = async (previous: SpeechPage): Promise<SpeechPage | null> => {
      if (disposed || previous.layout !== key()) return null;
      let target = previous.chapter,
        page = previous.page + 1;
      const value = await html(target);
      if (disposed || previous.layout !== key()) return null;
      const measured = measure(value);
      try {
        if (page < measured.pages.count)
          return {
            book: book.id,
            chapter: target,
            ...measured.pages.bounds(page),
            layout: previous.layout,
          };
      } finally {
        measured.dispose();
      }
      target++;
      page = 0;
      if (disposed || target >= book.titles.length) return null;
      const nextValue = await html(target);
      if (disposed || previous.layout !== key()) return null;
      const next = measure(nextValue);
      try {
        return {
          book: book.id,
          chapter: target,
          ...next.pages.bounds(page),
          layout: previous.layout,
        };
      } finally {
        next.dispose();
      }
    };
    const setupVoice = () => {
      voice?.stop();
      const engine = currentPrefs.engine === "server" && voiceInfo.available ? "server" : "browser";
      if (engine === "server") {
        voice = new PrivatePageVoice(
          speechTransport(async (target) => {
            const a = document.createElement("article");
            a.innerHTML = await html(target);
            return readerTextBlocks(a);
          }),
          {
            position,
            startPosition: position,
            page: speechPage,
            next: nextPage,
            layout: key,
            follow: async (pos, current = () => true) => {
              if (disposed || !current()) return false;
              if (chapter !== pos.chapter && !(await load(pos.chapter, pos.anchor, 0, current)))
                return false;
              if (disposed || !current()) return false;
              follow(pos.anchor);
              return true;
            },
            state: voiceState,
            save,
            finish: save,
          },
          voiceInfo,
        );
      } else {
        const backend = new BrowserSpeech();
        voice = new VoiceController(backend, {
          position: () => anchor,
          segments: () => blocks.flatMap((block, i) => chunks(block.text, i)),
          follow,
          state: voiceState,
          save,
          next: async (current) =>
            chapter + 1 < book.titles.length && (await load(chapter + 1, null, 0, current)),
          finish: async () => save(),
        });
      }
      voice.backend.rate = currentPrefs.rate;
    };
    const navigate = async (target: number, page?: number, offset = 0) => {
      if (loading || target < 0 || target >= book.titles.length) return;
      const resume = voiceStatus === "playing";
      voice?.stop();
      if (target !== chapter) await load(target, null, offset);
      else if (pages && page !== undefined) {
        pages.show(page, true);
        anchor = pages.firstAnchor();
        update();
        save();
      }
      if (!disposed && resume) voice?.play();
    };
    const ownedStop = (event: Event) => {
      if ((event as CustomEvent).detail !== owner) voice?.stop();
    };
    const stop = () => voice?.stop();
    window.addEventListener("codexweb-speech-owner", ownedStop);
    const endSession = () => {
      sessionEnded = true;
      stop();
    };
    window.addEventListener("pagehide", stop);
    window.addEventListener("private-session-ended", endSession);
    const resize = new ResizeObserver(refresh);
    resize.observe(pane);
    void document.fonts.ready.then(refresh);
    void api<{ available: boolean; voices?: string[] }>("/speech/status")
      .then((info) => {
        let chosen = "";
        try {
          chosen = storage.getItem("codex-speech-server-voice") || "";
        } catch {}
        voiceInfo = {
          available: info.available,
          voice: info.voices?.includes(chosen) ? chosen : info.voices?.[0],
          voices: info.voices?.map((v) => ({ voiceURI: v, name: v, lang: "ru" })),
        };
      })
      .catch(() => {})
      .finally(() => {
        infoReady = true;
        if (!disposed && !voice?.active) setupVoice();
      });
    let start = 0,
      restored: Anchor | null = null;
    try {
      const saved = JSON.parse(storage.getItem("codexweb-reader-positions") || "{}")[book.id];
      if (
        saved &&
        Number.isInteger(saved.chapter) &&
        saved.chapter >= 0 &&
        saved.chapter < book.titles.length
      ) {
        start = saved.chapter;
        restored = saved.anchor;
      }
    } catch {}
    void load(start, restored);
    controls.current = {
      turn: (delta) => {
        if (!pages) return;
        const next = pages.spreadStart + delta * pages.columns;
        void navigate(
          next < 0 || next >= pages.count ? chapter + delta : chapter,
          next,
          delta < 0 ? 1 : 0,
        );
      },
      chapter: (target) => {
        void navigate(target);
      },
      stop,
      play: () => {
        if (!pages || loading) return;
        if (voiceStatus === "playing" || voiceStatus === "loading") {
          voice?.pause();
          return;
        }
        if (!infoReady && currentPrefs.engine === "server") {
          error = "Проверяем доступность голоса…";
          update();
          return;
        }
        if (currentPrefs.engine === "server" && !voiceInfo.available) {
          error = "Фоновое аудио недоступно. Выбери системный голос в Aa.";
          update();
          return;
        }
        if (!voice) setupVoice();
        claimSpeech(owner);
        voice?.play();
      },
      position: () => ({
        chapter,
        anchor: { ...anchor },
        excerpt: (
          blocks[anchor.block]?.text.slice(anchor.char, anchor.char + 180) ||
          book.titles[chapter] ||
          ""
        )
          .replace(/\s+/gu, " ")
          .trim(),
      }),
      jump: async (location, match) => {
        if (disposed || sessionEnded || loading || !validLocation(location, book.titles.length))
          return false;
        const was = voiceStatus;
        voice?.stop();
        if (location.chapter !== chapter && !(await load(location.chapter, location.anchor)))
          return false;
        if (
          disposed ||
          sessionEnded ||
          !pages ||
          !blocks[location.anchor.block] ||
          location.anchor.char > blocks[location.anchor.block]!.text.length
        )
          return false;
        hit = match;
        anchor = pages.layout(location.anchor);
        update();
        save();
        if (was === "playing" || was === "loading") voice?.play();
        else if (was === "paused") voiceState("paused");
        return true;
      },
      configure: (next) => {
        const switched = next.engine !== currentPrefs.engine;
        currentPrefs = next;
        if (switched) setupVoice();
        if (voice instanceof PrivatePageVoice) voice.setRate(next.rate);
        else if (voice) voice.backend.rate = next.rate;
        refresh();
      },
    };
    return () => {
      voice?.stop();
      save();
      disposed = true;
      ticket++;
      resize.disconnect();
      index.close();
      controls.current = null;
      window.removeEventListener("codexweb-speech-owner", ownedStop);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("private-session-ended", endSession);
    };
  }, [book]);
  useEffect(() => {
    controls.current?.configure(prefs);
    try {
      storage.setItem("codexweb-reader-preferences", JSON.stringify(prefs));
    } catch {}
  }, [prefs]);
  const running = state.voice === "playing" || state.voice === "loading";
  return (
    <div
      className="book-reader"
      ref={root}
      style={
        { "--reader-size": `${prefs.size}px`, "--reader-line": prefs.line } as React.CSSProperties
      }
    >
      <div className="reader-toolbar">
        <select
          aria-label="Оглавление"
          value={state.chapter}
          disabled={state.busy}
          onChange={(e) => controls.current?.chapter(Number(e.target.value))}
        >
          {book.titles.map((title, i) => (
            <option key={`${i}:${title}`} value={i}>
              {title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="secondary"
          aria-label={
            running
              ? "Приостановить озвучивание"
              : state.voice === "paused"
                ? "Продолжить озвучивание"
                : "Озвучить страницу"
          }
          onClick={() => controls.current?.play()}
          disabled={state.busy}
        >
          {running ? "Ⅱ" : "▶"}
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Настройки чтения"
          aria-expanded={settings}
          onClick={() => setSettings(!settings)}
        >
          Aa
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Поиск по книге"
          title="Поиск по книге"
          aria-expanded={navigation === "search"}
          onClick={() => setNavigation(navigation === "search" ? null : "search")}
        >
          <Icon name="search" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Закладки книги"
          title="Закладки"
          aria-expanded={navigation === "bookmarks"}
          onClick={() => setNavigation(navigation === "bookmarks" ? null : "bookmarks")}
        >
          <Icon name="results" />
        </button>
      </div>
      {settings && (
        <div className="reader-settings">
          <label>
            Шрифт{" "}
            <input
              aria-label="Размер шрифта"
              type="range"
              min="14"
              max="32"
              value={prefs.size}
              onChange={(e) => setPrefs({ ...prefs, size: Number(e.target.value) })}
            />
          </label>
          <label>
            Интервал{" "}
            <input
              aria-label="Межстрочный интервал"
              type="range"
              min="1.2"
              max="2.2"
              step=".1"
              value={prefs.line}
              onChange={(e) => setPrefs({ ...prefs, line: Number(e.target.value) })}
            />
          </label>
          <label>
            Голос{" "}
            <select
              aria-label="Голос читалки"
              value={prefs.engine}
              onChange={(e) =>
                setPrefs({ ...prefs, engine: e.target.value as Preferences["engine"] })
              }
            >
              <option value="server">Фоновое аудио</option>
              <option value="browser">Системный голос</option>
            </select>
          </label>
          <label>
            Темп{" "}
            <select
              aria-label="Темп чтения"
              value={prefs.rate}
              onChange={(e) => setPrefs({ ...prefs, rate: Number(e.target.value) })}
            >
              {[0.5, 0.75, 0.85, 1, 1.25, 1.5, 2].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" onClick={() => controls.current?.stop()}>
            Остановить озвучивание
          </button>
        </div>
      )}
      <small className="reader-voice-status" role="status">
        {state.error ||
          (state.voice === "loading" && (
            <>
              <span className="spinner" /> Подготовка озвучки…
            </>
          ))}
      </small>
      <div ref={viewport} className="reader-scroll" aria-busy={state.busy}>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Delegated native anchor clicks already include keyboard Enter activation. */}
        <article
          ref={article}
          onClick={(event) => {
            const link = (event.target as Element).closest<HTMLAnchorElement>(
              "a[data-document-link]",
            );
            if (link) {
              event.preventDefault();
              onOpenLink?.(link.dataset.documentLink || "");
            }
          }}
        />
        <div ref={highlight} className="reader-search-highlight" aria-hidden="true" />
      </div>
      <ReaderNavigation
        key={book.id}
        book={book}
        mode={navigation}
        busy={state.busy}
        onClose={() => setNavigation(null)}
        position={() => controls.current?.position()}
        jump={(at, match) => controls.current?.jump(at, match) ?? Promise.resolve(false)}
      />
      <nav className="reader-bottom" aria-label="Страницы книги">
        <button
          type="button"
          className="secondary"
          aria-label="Предыдущая страница"
          disabled={state.busy || !state.previous}
          onClick={() => controls.current?.turn(-1)}
        >
          ‹
        </button>
        <span role="status">{state.label}</span>
        <button
          type="button"
          className="secondary"
          aria-label="Следующая страница"
          disabled={state.busy || !state.next}
          onClick={() => controls.current?.turn(1)}
        >
          ›
        </button>
      </nav>
    </div>
  );
}
