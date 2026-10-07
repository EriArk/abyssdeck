import { useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
import { Icon } from "./icons";
import { gptSettingsChanged } from "./WorkspaceSettings";

type Recovery = {
  available: boolean;
  operation: null | { key: string; state: "restarting" | "restarted"; requestedAt: number };
};

export function GptClientRecovery({ visible }: { visible: boolean }) {
  const [state, setState] = useState<Recovery>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [observing, setObserving] = useState(false);
  const [requested, setRequested] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const attempt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let timer: number | undefined;
    const read = async () => {
      const current = revision.current;
      try {
        const next = await api<Recovery>(
          "/gpt/client-restart" + (attempt.current ? "?key=" + attempt.current : ""),
        );
        if (disposed || current !== revision.current) return;
        setState(next);
        setError(
          attempt.current && !next.operation ? "Перезапуск не был подтверждён клиентом." : "",
        );
        if (next.operation?.state === "restarting") setObserving(true);
        else {
          setObserving(false);
          if (observing) window.dispatchEvent(new Event(gptSettingsChanged));
        }
      } catch (e) {
        if (!disposed && current === revision.current) setError(messageOf(e));
      } finally {
        // Only read a manually requested recovery while this page is visible.
        // A slow/unavailable client never triggers another restart.
        if (!disposed && observing) timer = window.setTimeout(read, 2000);
      }
    };
    void read();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [visible, observing]);
  const restart = async () => {
    if (lock.current || observing) return;
    lock.current = true;
    revision.current++;
    setSending(true);
    setRequested(true);
    setError("");
    attempt.current = crypto.randomUUID();
    try {
      setState(
        await api<Recovery>("/gpt/client-restart", {
          method: "POST",
          key: attempt.current,
          body: { confirm: true },
        }),
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      // A lost acknowledgement is reconciled by reads, never by another POST.
      setObserving(true);
      lock.current = false;
      setSending(false);
    }
  };
  return (
    <div className="gpt-client-recovery">
      <button
        type="button"
        className="secondary"
        disabled={!state?.available || sending || observing}
        onClick={() => void restart()}
      >
        <Icon name="refresh" />
        {sending || observing ? "Перезапускаю GPT…" : "Перезапустить GPT-клиент"}
      </button>
      <p className="small muted">
        Ручной перезапуск при зависании. Текущий ответ может прерваться; история и черновик
        сохранятся.
      </p>
      {requested && !observing && state?.operation?.state === "restarted" && (
        <p role="status">Клиент перезапущен. GPT загрузит свои данные.</p>
      )}
      {state?.available === false && (
        <p className="small muted">Для перезапуска нужно обновить клиент на сервере.</p>
      )}
      {error && (
        <p role="status">
          {error}
          {observing ? " Проверяем результат перезапуска…" : ""}
        </p>
      )}
    </div>
  );
}
