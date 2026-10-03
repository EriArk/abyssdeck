import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import "./file-format-tools.css";

export default function MediaFilePreview({ file, video }: { file: File; video: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    // The download URL deliberately has an inert MIME. Give only the native media
    // element its own typed immutable blob, never a navigable HTML/SVG document.
    const types: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    const type =
      types[file.name.split(".").at(-1)?.toLowerCase() || ""] ||
      (/^(audio|video)\//.test(file.type) ? file.type : "application/octet-stream");
    const value = URL.createObjectURL(new Blob([file], { type }));
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  const media = useRef<HTMLMediaElement | null>(null);
  const [duration, setDuration] = useState(0),
    [time, setTime] = useState(0),
    [seek, setSeek] = useState("0"),
    [rate, setRate] = useState(1),
    [a, setA] = useState<number | null>(null),
    [b, setB] = useState<number | null>(null),
    [loop, setLoop] = useState(false);
  const timestamp = (n: number) => `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, "0")}`;
  const events = {
    src: url || undefined,
    controls: true,
    preload: "metadata" as const,
    onLoadedMetadata: () => {
      const m = media.current;
      if (m) {
        setDuration(Number.isFinite(m.duration) ? m.duration : 0);
        m.playbackRate = rate;
      }
    },
    onTimeUpdate: () => {
      const m = media.current;
      if (!m) return;
      setTime(m.currentTime);
      if (loop && a !== null && b !== null && m.currentTime >= b) m.currentTime = a;
    },
    onEnded: () => {
      const m = media.current;
      if (m && loop && a !== null && b !== null) {
        m.currentTime = a;
        void m.play().catch(() => {});
      }
    },
  };
  return (
    <div className="file-media-preview">
      {/* biome-ignore lint/a11y/useMediaCaption: Existing user files have no supplied caption track. */}
      {video ? (
        <video
          {...events}
          ref={(n) => {
            media.current = n;
          }}
          playsInline
        />
      ) : (
        <audio
          {...events}
          ref={(n) => {
            media.current = n;
          }}
        />
      )}
      <div role="toolbar" className="format-tool-row" aria-label="Инструменты воспроизведения">
        <select
          aria-label="Скорость воспроизведения"
          value={rate}
          onChange={(e) => {
            const r = Number(e.target.value);
            setRate(r);
            if (media.current) media.current.playbackRate = r;
          }}
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <output>
          {timestamp(time)} / {timestamp(duration)}
        </output>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(seek);
            if (media.current && Number.isFinite(n))
              media.current.currentTime = Math.max(0, Math.min(duration, n));
          }}
        >
          <input
            type="number"
            aria-label="Позиция в секундах"
            min="0"
            max={duration || undefined}
            step="0.1"
            value={seek}
            onChange={(e) => setSeek(e.target.value)}
            style={{ width: 90 }}
          />
          <button
            type="submit"
            className="icon-button"
            title="Перейти к позиции"
            aria-label="Перейти к позиции"
            disabled={!duration}
          >
            <Icon name="chevron" />
          </button>
        </form>
        <button
          type="button"
          className="secondary"
          title="Начало повторяемого фрагмента"
          disabled={!duration}
          onClick={() => {
            const value = media.current?.currentTime ?? 0;
            setA(value);
            if (b === null || b <= value) {
              setB(null);
              setLoop(false);
            }
          }}
        >
          A {a === null ? "" : timestamp(a)}
        </button>
        <button
          type="button"
          className="secondary"
          title="Конец повторяемого фрагмента"
          disabled={!duration || a === null}
          onClick={() => {
            const value = media.current?.currentTime ?? 0;
            if (a !== null && value > a) setB(value);
          }}
        >
          B {b === null ? "" : timestamp(b)}
        </button>
        <button
          type="button"
          className="icon-button"
          title="Повторять A–B"
          aria-label="Повторять A–B"
          aria-pressed={loop}
          disabled={a === null || b === null || b <= a}
          onClick={() => setLoop(!loop)}
        >
          <Icon name="refresh" />
        </button>
      </div>
    </div>
  );
}
