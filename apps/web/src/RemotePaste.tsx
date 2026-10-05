import { useEffect, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { Icon } from "./icons";
import { type ClipboardClient, pasteRemoteText } from "./remoteClipboard";

export function RemotePaste({
  client,
  onClose,
  releaseKeys,
}: {
  client: ClipboardClient;
  onClose: () => void;
  releaseKeys: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0),
    transfer = useRef<AbortController | null>(null);
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const cancel = () => {
      generation.current++;
      transfer.current?.abort();
      if (document.hidden) onClose();
    };
    document.addEventListener("visibilitychange", cancel);
    return () => {
      generation.current++;
      transfer.current?.abort();
      document.removeEventListener("visibilitychange", cancel);
    };
  }, [onClose]);
  const readClipboard = async () => {
    const target = field.current;
    if (!target) return;
    const request = ++generation.current,
      start = target.selectionStart,
      end = target.selectionEnd;
    setReading(true);
    setError("");
    try {
      const value = await navigator.clipboard.readText();
      if (request !== generation.current || !target.isConnected || document.hidden) return;
      target.setRangeText(value, start, end, "end");
      setText(target.value);
      target.focus({ preventScroll: true });
    } catch {
      if (request !== generation.current || !target.isConnected || document.hidden) return;
      setError("Вставь текст в поле через меню устройства или Ctrl+V.");
      target.focus({ preventScroll: true });
    } finally {
      if (request === generation.current) setReading(false);
    }
  };
  const send = async () => {
    if (transfer.current || !text) return;
    generation.current++;
    setReading(false);
    const controller = new AbortController();
    transfer.current = controller;
    setBusy(true);
    setError("");
    releaseKeys();
    try {
      await pasteRemoteText(client, text, controller.signal);
      if (!controller.signal.aborted) onClose();
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Не удалось вставить текст.");
    } finally {
      transfer.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <fieldset className="remote-control-panel remote-paste-panel" aria-label="Вставка текста">
      <div className="remote-control-heading">
        <strong>Вставить текст</strong>
        <button
          type="button"
          className="remote-fab"
          aria-label="Закрыть вставку текста"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="small muted">Текст будет вставлен в выбранное поле удалённого приложения.</p>
      <p className="small muted">Перенос строки — Enter, табуляция — Tab.</p>
      <AutoTextarea
        ref={field}
        aria-label="Текст для удалённого компьютера"
        value={text}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        onKeyDownCapture={(event) => event.stopPropagation()}
        onKeyUpCapture={(event) => event.stopPropagation()}
        onKeyPressCapture={(event) => event.stopPropagation()}
        onCompositionStartCapture={(event) => event.stopPropagation()}
        onCompositionEndCapture={(event) => event.stopPropagation()}
        onInputCapture={(event) => {
          // Guacamole listens on the pane before React's bubbling handlers.
          // Local paste preparation must never reach that remote keyboard.
          event.stopPropagation();
          generation.current++;
          setReading(false);
          setText(event.currentTarget.value);
        }}
        onChange={() => {}}
      />
      <div className="remote-paste-actions">
        <button type="button" disabled={busy || reading} onClick={() => void readClipboard()}>
          <Icon name="paste" />
          Из буфера
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !text}
          onClick={() => void send()}
        >
          {busy ? "Вставляем…" : "Вставить"}
        </button>
      </div>
      {error && (
        <p role="alert" className="small">
          {error}
        </p>
      )}
    </fieldset>
  );
}
