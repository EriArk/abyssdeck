import { useEffect, useSyncExternalStore } from "react";
import { pageWorkspace } from "./accountStorage";
import { api } from "./api";

// One heartbeat per browser tab, shared by both responsive shells.
const id = crypto.randomUUID(),
  listeners = new Set<() => void>();
let value: string[] | null = null,
  users = 0,
  queued = false,
  running = false;
const publish = (next: string[] | null) => {
  value = next;
  for (const notify of listeners) notify();
};
async function update() {
  queued = true;
  if (running) return;
  running = true;
  try {
    while (queued) {
      queued = false;
      const active = users > 0 && !document.hidden;
      try {
        const r = await api<{ online: string[] }>("/team/communication/presence", {
          method: "POST",
          body: { id, active },
          timeoutMs: 15000,
        });
        publish(users && !document.hidden && navigator.onLine ? r.online : null);
      } catch {
        publish(null);
      }
    }
  } finally {
    running = false;
  }
}
let timer: ReturnType<typeof setInterval> | undefined;
const changed = () => {
  void update();
};
const offline = () => publish(null);
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};
export function useCommunicationPresence() {
  useEffect(() => {
    if (!pageWorkspace) return;
    if (++users === 1) {
      timer = setInterval(() => {
        if (!document.hidden) changed();
      }, 25000);
      document.addEventListener("visibilitychange", changed);
      window.addEventListener("pageshow", changed);
      window.addEventListener("online", changed);
      window.addEventListener("offline", offline);
      changed();
    }
    return () => {
      if (--users === 0) {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", changed);
        window.removeEventListener("pageshow", changed);
        window.removeEventListener("online", changed);
        window.removeEventListener("offline", offline);
        changed();
      }
    };
  }, []);
  return useSyncExternalStore(subscribe, () => value);
}
