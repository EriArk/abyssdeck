import { useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
import type { Capabilities, TurnSettings } from "./types";

const efforts: Record<string, string> = {
  none: "Выключено",
  minimal: "Минимально",
  low: "Низкое",
  medium: "Среднее",
  high: "Высокое",
  xhigh: "Очень высокое",
  max: "Максимум",
  ultra: "Ультра",
};
const cache = new Map<string, Capabilities>();
const reads = new Map<string, Promise<Capabilities>>();
let generation = 0;
if (typeof window !== "undefined")
  window.addEventListener("private-session-ended", () => {
    generation++;
    cache.clear();
    reads.clear();
  });
function readCapabilities(projectId: string) {
  const existing = reads.get(projectId);
  if (existing) return existing;
  const session = generation;
  const read = api<Capabilities>(`/projects/${projectId}/capabilities`)
    .then((value) => {
      if (session === generation) {
        cache.delete(projectId);
        cache.set(projectId, value);
        while (cache.size > 64) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
      }
      return value;
    })
    .finally(() => {
      if (reads.get(projectId) === read) reads.delete(projectId);
    });
  reads.set(projectId, read);
  return read;
}
export function useTurnSettings(projectId: string, threadId: string, saved?: TurnSettings) {
  const [caps, setCaps] = useState<Capabilities | undefined>(cache.get(projectId));
  const [selection, setSelection] = useState<TurnSettings | undefined>(saved);
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const current = useRef(threadId);
  current.current = threadId;
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry restarts the reader.
  useEffect(() => {
    if (!projectId) return;
    let disposed = false;
    setError("");
    const stored = cache.get(projectId);
    setCaps(stored);
    let checking = false;
    const session = generation;
    const refresh = () => {
      if (disposed || checking || session !== generation || document.visibilityState === "hidden")
        return;
      checking = true;
      setLoading(true);
      void readCapabilities(projectId)
        .then((value) => {
          if (disposed || session !== generation) return;
          setCaps(value);
          setError("");
        })
        .catch((e) => {
          if (!disposed) setError(messageOf(e));
        })
        .finally(() => {
          checking = false;
          if (!disposed) setLoading(false);
        });
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [projectId, revision]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A thread switch must reset an unsaved local selection.
  useEffect(() => {
    setSelection(saved);
    setSaving(false);
  }, [threadId, saved]);
  useEffect(() => {
    if (caps && !selection) setSelection(caps.defaults);
  }, [caps, selection]);
  const change = async (value: TurnSettings) => {
    if (!threadId || saving) return;
    const id = threadId;
    setSaving(true);
    setError("");
    setSelection(value);
    try {
      await api(`/threads/${id}/settings`, { method: "PATCH", body: value });
    } catch (e) {
      if (current.current === id) {
        setError(messageOf(e));
        try {
          const actual = await api<TurnSettings>(`/threads/${id}/settings`);
          if (current.current === id) setSelection(actual);
        } catch {
          if (current.current === id) setSelection(saved ?? caps?.defaults);
        }
      }
    } finally {
      if (current.current === id) setSaving(false);
    }
  };
  return {
    caps,
    selection,
    loading,
    saving,
    error,
    change,
    reload: () => setRevision((v) => v + 1),
  };
}
export type ReturnTypeOfSettings = ReturnType<typeof useTurnSettings>;
export function ComposerOptions({
  options,
  disabled,
  effortDisabled = disabled,
  analysisOnly = false,
}: {
  options: ReturnType<typeof useTurnSettings>;
  disabled: boolean;
  effortDisabled?: boolean;
  analysisOnly?: boolean;
}) {
  const { caps, selection, loading, saving, error, change, reload } = options;
  const model = caps?.models.find((m) => m.id === selection?.model);
  if (!caps || !selection)
    return (
      <div className="composer-options options-loading">
        <span>{loading ? "Загружаем модели…" : error || "Выбери проект"}</span>
        {error && (
          <button type="button" className="text-button" onClick={reload}>
            Повторить
          </button>
        )}
      </div>
    );
  return (
    <>
      <div className="composer-options">
        <div className="composer-option model-option">
          <span aria-hidden="true">{model?.name ?? selection.model}</span>
          <select
            aria-label="Модель Codex"
            value={selection.model}
            disabled={disabled || saving}
            onChange={(e) => {
              const model = caps.models.find((m) => m.id === e.target.value);
              if (model)
                void change({
                  ...selection,
                  model: model.id,
                  effort: model.efforts.includes(selection.effort)
                    ? selection.effort
                    : model.defaultEffort,
                });
            }}
          >
            {caps.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="composer-option mode-option" hidden={analysisOnly}>
          <span aria-hidden="true">{selection.mode === "plan" ? "План" : "Работа"}</span>
          <select
            className="mode-select"
            aria-label="Режим Codex"
            value={selection.mode}
            disabled={disabled || saving}
            onChange={(e) =>
              void change({ ...selection, mode: e.target.value as TurnSettings["mode"] })
            }
          >
            {caps.modes.map((mode) => (
              <option key={mode} value={mode}>
                {mode === "plan" ? "План" : "Работа"}
              </option>
            ))}
          </select>
        </div>
        <div className="composer-option effort-option">
          <span aria-hidden="true">{efforts[selection.effort] ?? selection.effort}</span>
          <select
            className="effort-select"
            aria-label="Уровень размышления"
            value={selection.effort}
            disabled={effortDisabled || saving}
            onChange={(e) =>
              void change({ ...selection, effort: e.target.value as TurnSettings["effort"] })
            }
          >
            {model?.efforts.map((e) => (
              <option key={e} value={e}>
                {efforts[e] ?? e}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selection.mode === "plan" && (
        <div className="composer-mode-hint">Планируем и уточняем задачу перед реализацией.</div>
      )}
      {!!caps.warnings?.length && (
        <details className="composer-mode-hint">
          <summary>Совместимость Codex</summary>
          {caps.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </details>
      )}
      {error && (
        <div className="composer-error" role="alert">
          {error}
          <button type="button" className="text-button" onClick={reload}>
            Обновить модели
          </button>
        </div>
      )}
    </>
  );
}
