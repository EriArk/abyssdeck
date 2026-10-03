import type { ThemeVariant } from "@codex-web/shared";
import { useState, useSyncExternalStore } from "react";
import { accountLocalStorage as localStorage } from "./accountStorage.ts";
import { api } from "./api";
import { CaseColorSettings } from "./CaseColorSettings";
import {
  setThemeVariant,
  subscribeThemeVariant,
  type Theme,
  themes,
  themeVariant,
  themeVariantKey,
  themeVariants,
  variantNames,
} from "./theme";

const layoutKey = "codex-legacy-layout";
const layoutEvent = "codex-layout-change";

function legacyLayout() {
  try {
    return localStorage.getItem(layoutKey) === "true";
  } catch {
    return document.documentElement.dataset.layout === "legacy";
  }
}

export function applyLayoutPreference() {
  document.documentElement.dataset.layout = legacyLayout() ? "legacy" : "refined";
}

function subscribe(listener: () => void) {
  const update = () => {
    applyLayoutPreference();
    listener();
  };
  window.addEventListener(layoutEvent, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(layoutEvent, update);
    window.removeEventListener("storage", update);
  };
}

export function useLegacyLayout() {
  return useSyncExternalStore(subscribe, legacyLayout);
}

export function AppearanceSettings({
  theme,
  onTheme,
}: {
  theme: Theme;
  onTheme: (id: Theme) => void;
}) {
  const variant = useSyncExternalStore(subscribeThemeVariant, () => themeVariant(theme));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function selectVariant(value: ThemeVariant) {
    if (pending || value === variant) return;
    setPending(true);
    setError(false);
    setThemeVariant(theme, value);
    try {
      await api("/preferences", { method: "PATCH", body: { [themeVariantKey(theme)]: value } });
    } catch {
      setThemeVariant(theme, variant);
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <fieldset className="theme-picker">
      <legend>Тема</legend>
      <div className="theme-options">
        {themes.map(({ id, title, description }) => (
          <label key={id} className={`theme-option ${id}`} data-variant={themeVariant(id)}>
            <input type="radio" name="theme" checked={theme === id} onChange={() => onTheme(id)} />
            <span className="theme-swatch" />
            <span>
              {title}
              <small>{description}</small>
            </span>
          </label>
        ))}
      </div>
      <fieldset className="theme-variant-picker" disabled={pending}>
        <legend>Вариант оформления</legend>
        <div className="theme-variant-options">
          {themeVariants[theme].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={variant === value}
              onClick={() => void selectVariant(value)}
            >
              {variantNames[value]}
            </button>
          ))}
        </div>
        {error && <p role="alert">Не удалось сохранить вариант. Выбери его ещё раз.</p>}
      </fieldset>
      <CaseColorSettings key={theme} theme={theme} />
    </fieldset>
  );
}

export function LayoutPreference() {
  const legacy = useLegacyLayout();
  return (
    <label className="layout-preference">
      <input
        type="checkbox"
        checked={legacy}
        onChange={(event) => {
          const value = event.currentTarget.checked;
          document.documentElement.dataset.layout = value ? "legacy" : "refined";
          try {
            localStorage.setItem(layoutKey, String(value));
          } catch {
            /* Device preference is optional. */
          }
          window.dispatchEvent(new Event(layoutEvent));
        }}
      />
      Прежняя компоновка
    </label>
  );
}
