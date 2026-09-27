import { useState, useSyncExternalStore } from "react";
import { accountLocalStorage as storage } from "./accountStorage";
import { api, messageOf } from "./api";
import "./personal-scale.css";

export type PersonalScale = { textScale: number; uiScale: number };
const defaults = { textScale: 1, uiScale: 1 };
const listeners = new Set<() => void>();
let value = defaults;
let revision = 0;
const bounded = (n: unknown, min: number, max: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 1;
export function hydratePersonalScale(input: Partial<PersonalScale>) {
  // Preserve the reader's actual message anchor while text reflows under a settings window.
  const anchors = Array.from(
    document.querySelectorAll<HTMLElement>(".chat-scroll, .gpt-message-scroll"),
  )
    .filter(
      (el) =>
        el.clientHeight &&
        (el.dataset.messageNavigation || el.scrollHeight - el.scrollTop - el.clientHeight > 120),
    )
    .map((el) => {
      const top = el.getBoundingClientRect().top;
      const message = Array.from(el.querySelectorAll<HTMLElement>("[data-chat-message]")).find(
        (m) => m.getBoundingClientRect().bottom > top + 16,
      );
      return { el, message, offset: message ? message.getBoundingClientRect().top - top : 0 };
    });
  value = {
    textScale: bounded(input.textScale, 0.9, 1.4),
    uiScale: bounded(input.uiScale, 0.9, 1.2),
  };
  const root = document.documentElement;
  root.style.setProperty("--user-text-scale", String(value.textScale));
  root.style.setProperty("--user-ui-scale", String(value.uiScale));
  root.dataset.uiScale = value.uiScale === 1 ? "default" : "custom";
  try {
    storage.setItem("codex-personal-scale", JSON.stringify(value));
  } catch {
    /* Optional cache. */
  }
  for (const listener of listeners) listener();
  window.dispatchEvent(new Event("workspace-scale-change"));
  requestAnimationFrame(() => {
    for (const { el, message, offset } of anchors)
      if (message?.isConnected && el.clientHeight)
        el.scrollTop +=
          message.getBoundingClientRect().top - el.getBoundingClientRect().top - offset;
  });
}
export function applyCachedPersonalScale() {
  try {
    hydratePersonalScale(JSON.parse(storage.getItem("codex-personal-scale") ?? "{}"));
  } catch {
    hydratePersonalScale(defaults);
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function PersonalScaleSettings() {
  const scale = useSyncExternalStore(subscribe, () => value);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(next: PersonalScale) {
    if (busy) return;
    const old = value,
      serial = ++revision;
    hydratePersonalScale(next);
    setBusy(true);
    setError("");
    try {
      await api("/preferences", { method: "PATCH", body: next });
    } catch (e) {
      if (revision === serial) hydratePersonalScale(old);
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="personal-scale" aria-label="Размер текста и интерфейса">
      <h3>Размер текста и интерфейса</h3>
      {(["textScale", "uiScale"] as const).map((key) => (
        <fieldset key={key} disabled={busy}>
          <legend>{key === "textScale" ? "Текст" : "Интерфейс"}</legend>
          <div className="scale-presets">
            {(key === "textScale" ? [0.9, 1, 1.15, 1.25, 1.4] : [0.9, 1, 1.1, 1.2]).map((size) => (
              <button
                type="button"
                className="secondary"
                key={size}
                aria-pressed={scale[key] === size}
                onClick={() => void save({ ...scale, [key]: size })}
              >
                {Math.round(size * 100)}%
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="small muted">
        Личная настройка для всех твоих устройств. Текст и размеры кнопок меняются независимо.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={busy || (scale.textScale === 1 && scale.uiScale === 1)}
        onClick={() => void save(defaults)}
      >
        Сбросить масштаб
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
