import type { GptConnection } from "@codex-web/shared";
import { useEffect, useRef, useState } from "react";
import { pageWorkspace } from "./accountStorage";
import { api, messageOf } from "./api";
import { Icon } from "./icons";
import { gptSettingsChanged } from "./WorkspaceSettings";
export function GptConnectionSettings({ visible }: { visible: boolean }) {
  const [status, setStatus] = useState<GptConnection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const sequence = useRef(0);
  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController();
    const current = ++sequence.current;
    void api<GptConnection>("/gpt/status", { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted && current === sequence.current) {
          setStatus(value);
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(messageOf(e));
      });
    return () => abort.abort();
  }, [visible]);
  const check = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const current = ++sequence.current;
    try {
      const next = await api<GptConnection>("/gpt/reconnect", { method: "POST" });
      if (current === sequence.current) setStatus(next);
      window.dispatchEvent(new Event(gptSettingsChanged));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="gpt-connection-settings" aria-label="Состояние GPT">
      <p role="status">{error || status?.message || "Проверяем подключение GPT…"}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void check()}>
        <Icon name="refresh" />
        {busy ? "Проверяем…" : "Перепроверить подключение"}
      </button>
      {!pageWorkspace && (
        <a
          className="primary"
          href={
            status?.connectUrl === "/gpt-connect?runtime=native"
              ? "/gpt-connect?runtime=native&immersive=1"
              : "/gpt-connect?immersive=1"
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="remote" />
          {status?.connectUrl === "/gpt-connect?runtime=native"
            ? "Открыть клиент ChatGPT"
            : "Браузер ChatGPT на сервере"}
        </a>
      )}
    </section>
  );
}
