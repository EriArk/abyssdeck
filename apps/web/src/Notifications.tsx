import { useEffect, useRef, useState } from "react";
import { accountLocalStorage as localStorage } from "./accountStorage.ts";
import { api, messageOf } from "./api";
import {
  createPushState,
  type PushCategories as Categories,
  type PushStatus,
} from "./pushState.ts";
import "./notifications.css";

const changed = "codex-push-changed";
const pushState = createPushState({
  storage: localStorage,
  api,
  ready: () => navigator.serviceWorker.ready,
  permission: () => Notification.permission,
  hash: async (endpoint) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join(""),
  changed: () => window.dispatchEvent(new Event(changed)),
});
const deviceId = pushState.id;
export function Notifications({ visible }: { visible: boolean }) {
  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [status, setStatus] = useState<PushStatus | null>(null),
    [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null),
    [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!visible || !supported) return;
    let disposed = false;
    const timer = setTimeout(() => {
      if (!disposed) setError("Не удалось подготовить уведомления. Обнови страницу.");
    }, 12000);
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void pushState
        .restore()
        .then(({ status: data, registration: reg, subscription: sub }) => {
          if (disposed) return;
          setStatus(data);
          setRegistration(reg);
          setSubscription(sub);
          setError("");
        })
        .catch((e) => {
          if (!disposed) setError(messageOf(e));
        })
        .finally(() => clearTimeout(timer));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("online", refresh);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [visible, supported]);
  const store = async (
    sub: PushSubscription,
    categories: Categories,
    preview = status?.preview ?? true,
  ) => {
    await pushState.save(sub, categories, preview);
    setSubscription(sub);
    setStatus((s) => (s ? { ...s, enabled: true, categories, preview } : s));
  };
  const enable = () => {
    if (!registration || !status?.publicKey || pending) return;
    setPending(true);
    setError("");
    const key = Uint8Array.from(
      atob(status.publicKey.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    // Subscribe directly in this tap. Safari must not lose activation during a fetch first.
    const request = subscription
      ? Promise.resolve(subscription)
      : registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    void request
      .then((sub) => store(sub, status.categories))
      .catch((e) =>
        setError(
          e?.name === "NotAllowedError"
            ? "Уведомления не разрешены на этом устройстве."
            : messageOf(e),
        ),
      )
      .finally(() => setPending(false));
  };
  const disable = async () => {
    setPending(true);
    setError("");
    try {
      await pushState.disable();
      setStatus((s) => (s ? { ...s, enabled: false } : s));
      await subscription?.unsubscribe();
      setSubscription(null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  };
  const preference = async (key: keyof Categories, value: boolean) => {
    if (!subscription || !status) return;
    setPending(true);
    setError("");
    try {
      await store(subscription, { ...status.categories, [key]: value });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="notification-settings" aria-label="Уведомления">
      <h3>Уведомления</h3>
      {!supported ? (
        <p className="small muted">Для уведомлений открой установленное веб-приложение.</p>
      ) : status?.available === false ? (
        <p className="small muted">Уведомления пока недоступны.</p>
      ) : (
        <>
          <button
            type="button"
            disabled={
              pending ||
              !registration ||
              !status ||
              (!status.enabled && Notification.permission === "denied")
            }
            onClick={() => (status?.enabled ? void disable() : enable())}
          >
            {status?.enabled ? "Выключить на этом устройстве" : "Включить на этом устройстве"}
          </button>
          {Notification.permission === "denied" && (
            <p className="small muted">Уведомления запрещены в настройках устройства.</p>
          )}
          {status?.enabled && !subscription && Notification.permission === "granted" && (
            <button type="button" disabled={pending} onClick={enable}>
              Восстановить на этом устройстве
            </button>
          )}
          {status?.enabled && (
            <>
              <fieldset disabled={pending}>
                {(
                  [
                    ["completed", "Завершение работы"],
                    ["attention", "Вопросы и разрешения"],
                    ["errors", "Сбои и проверка состояния"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={status.categories[key]}
                      onChange={(e) => void preference(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={status.preview ?? true}
                    onChange={(e) => {
                      if (!subscription) return;
                      setPending(true);
                      setError("");
                      void store(subscription, status.categories, e.target.checked)
                        .catch((e) => setError(messageOf(e)))
                        .finally(() => setPending(false));
                    }}
                  />
                  Показывать чат и текст ответа
                </label>
              </fieldset>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  setError("");
                  void api("/push/test", {
                    method: "POST",
                    body: { id: deviceId() },
                    timeoutMs: 10000,
                  })
                    .catch((e) => setError(messageOf(e)))
                    .finally(() => setPending(false));
                }}
              >
                Проверить уведомление
              </button>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="small">
          {error}
        </p>
      )}
    </section>
  );
}
export function useNotificationPresence(client: "codex" | "gpt", target: string, active: boolean) {
  const tab = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!active) return;
    const update = (hidden = false) => {
      const id = deviceId();
      if (!id) return;
      void api("/push/presence", {
        method: "POST",
        timeoutMs: 5000,
        body: {
          id,
          tab: tab.current,
          client,
          target,
          visible: !hidden && document.visibilityState === "visible" && document.hasFocus(),
        },
      }).catch(() => {});
    };
    const show = () => update(),
      hide = () => update(true);
    const restore = () => {
      if (
        document.visibilityState === "visible" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
      )
        void pushState.restore().catch(() => {});
    };
    restore();
    show();
    const timer = setInterval(show, 10000);
    document.addEventListener("visibilitychange", show);
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("pageshow", restore);
    window.addEventListener("online", restore);
    window.addEventListener("focus", show);
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener(changed, show);
    return () => {
      clearInterval(timer);
      hide();
      document.removeEventListener("visibilitychange", show);
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("online", restore);
      window.removeEventListener("focus", show);
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener(changed, show);
    };
  }, [active, client, target]);
}
export type NotificationTarget = {
  schedule?: { projectId: string; threadId: string; chatRole: "work" | "intake" };
  id: string;
  client: "codex" | "gpt";
  threadId?: string;
  projectId?: string;
  nativeId?: string;
  jobId?: string;
};
