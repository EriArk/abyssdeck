import { workspaceUrl } from "../accountStorage";
import { api } from "../api";
import { PageVoice } from "./page-voice";
import type { Anchor, TextBlock } from "./pages";

export function pageText(blocks: TextBlock[], anchor: Anchor, end: Anchor) {
  return blocks
    .slice(anchor.block, end.block + 1)
    .map((block, index) => {
      const number = anchor.block + index;
      return block.text.slice(
        number === anchor.block ? anchor.char : 0,
        number === end.block ? end.char : undefined,
      );
    })
    .join("\n")
    .trim();
}
export function wavDuration(bytes: ArrayBuffer) {
  const view = new DataView(bytes),
    label = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (view.byteLength < 12 || label(0) !== "RIFF" || label(8) !== "WAVE")
    throw Error("Некорректное аудио");
  let rate = 0;
  for (let at = 12; at + 8 <= view.byteLength; ) {
    const kind = label(at),
      length = view.getUint32(at + 4, true);
    if (kind === "fmt " && length >= 16 && at + 24 <= view.byteLength)
      rate = view.getUint32(at + 16, true);
    if (kind === "data" && rate > 0) return length / rate;
    at += 8 + length + (length % 2);
  }
  throw Error("Не удалось прочитать длительность аудио");
}
export class PrivatePageVoice extends PageVoice {
  url(entry: { id: string }) {
    return workspaceUrl(`/api/speech/${entry.id}/audio`);
  }
}
/** Translate only transport: keep MybookOpds' playback/end/reflow logic intact. */
export function speechTransport(read: (chapter: number) => Promise<TextBlock[]>) {
  const clips = new Map<string, { done: Promise<unknown>; controller: AbortController }>();
  return async (path: string, body?: Record<string, unknown>) => {
    if (path.startsWith("/books/") && body) {
      const id = String(body.id),
        controller = new AbortController();
      const done = (async () => {
        const blocks = await read(Number(body.chapter));
        if (controller.signal.aborted) return {};
        const anchor = body.anchor as Anchor,
          end = body.end as Anchor;
        const text = pageText(blocks, anchor, end);
        if (!text) return { empty: true, complete: true, segments: [] };
        await api(`/speech/${id}`, {
          method: "POST",
          body: { text, language: /[а-яё]/iu.test(text) ? "ru" : "en", voice: body.voice },
        });
        if (controller.signal.aborted) {
          await api(`/speech/${id}`, { method: "DELETE" });
          return {};
        }
        const response = await fetch(workspaceUrl(`/api/speech/${id}/audio`), {
          credentials: "same-origin",
          headers: { Range: "bytes=0-65535" },
          signal: controller.signal,
        });
        if (!response.ok) throw Error("Не удалось загрузить озвучку страницы");
        const duration = wavDuration(await response.arrayBuffer());
        // Hub supplies one finite PCM page, no word timings. Do not invent word cues.
        return {
          complete: true,
          segments: [
            { at: 0, duration, pcmAt: 0, pcmDuration: duration, cues: [{ start: 0, anchor }] },
          ],
        };
      })();
      clips.set(id, { done, controller });
      void done.catch(() => {});
      return {};
    }
    const match = /^\/speech\/streams\/([a-f0-9-]+)\/(status|stop)$/.exec(path);
    if (!match) throw Error("Неизвестная операция озвучивания");
    const id = match[1]!,
      clip = clips.get(id);
    if (match[2] === "stop") {
      clip?.controller.abort();
      clips.delete(id);
      await api(`/speech/${id}`, { method: "DELETE" });
      return {};
    }
    if (!clip) throw Error("Озвучивание остановлено");
    return clip.done;
  };
}
