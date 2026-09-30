export type PushCategories = { completed: boolean; attention: boolean; errors: boolean };
export type PushStatus = {
  available: boolean;
  publicKey?: string;
  enabled: boolean;
  categories: PushCategories;
  preview: boolean;
};
type Intent = { enabled: true; categories: PushCategories; preview: boolean };
type Api = <T>(
  path: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number },
) => Promise<T>;
type Dependencies = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  api: Api;
  ready: () => Promise<ServiceWorkerRegistration>;
  permission: () => NotificationPermission;
  hash: (endpoint: string) => Promise<string>;
  changed: () => void;
};
const idKey = "codex-push-device",
  intentKey = "codex-push-intent";
export function createPushState(deps: Dependencies) {
  let revision = 0,
    acceptedId = "";
  let pending:
    | Promise<{
        status: PushStatus;
        registration: ServiceWorkerRegistration;
        subscription: PushSubscription | null;
      }>
    | undefined;
  const id = () => {
    try {
      return deps.storage.getItem(idKey) || "";
    } catch {
      return "";
    }
  };
  const intent = (): Intent | null => {
    try {
      const value = JSON.parse(deps.storage.getItem(intentKey) || "null");
      return value?.enabled === true &&
        typeof value.preview === "boolean" &&
        ["completed", "attention", "errors"].every(
          (k) => typeof value.categories?.[k] === "boolean",
        )
        ? value
        : null;
    } catch {
      return null;
    }
  };
  const remember = (device: string, value?: PushStatus) => {
    try {
      if (device) deps.storage.setItem(idKey, device);
      else {
        deps.storage.removeItem(idKey);
        deps.storage.removeItem(intentKey);
      }
      if (value?.enabled)
        deps.storage.setItem(
          intentKey,
          JSON.stringify({ enabled: true, categories: value.categories, preview: value.preview }),
        );
    } catch {
      /* Storage failure never revokes the actual subscription. */
    }
    deps.changed();
  };
  const restore = () => {
    if (pending) return pending;
    const expected = revision;
    pending = (async () => {
      const storedId = id();
      const [registration, original] = await Promise.all([
        deps.ready(),
        deps.api<PushStatus>("/push" + (storedId ? "?id=" + storedId : "")),
      ]);
      let subscription = await registration.pushManager.getSubscription(),
        status = original;
      if (expected !== revision) return { status, registration, subscription };
      // Recover a lost storage key from this browser's actual endpoint. Never use
      // another device's row or delete settings merely because a browser read is empty.
      if (subscription) {
        const actualId = await deps.hash(subscription.endpoint);
        if (actualId !== storedId) status = await deps.api<PushStatus>("/push?id=" + actualId);
        if (expected !== revision) return { status, registration, subscription };
        if (status.enabled) remember(actualId, status);
      }
      const retainedDevice =
        subscription && storedId && (await deps.hash(subscription.endpoint)) === storedId;
      const preference = status.enabled ? status : (intent() ?? (retainedDevice ? status : null));
      if (preference && status.available && deps.permission() === "granted") {
        if (!subscription && status.publicKey) {
          // Some browsers still require a tap. Keep consent/preferences and let
          // the existing enable action repair it; never request permission here.
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: Uint8Array.from(
                atob(status.publicKey.replaceAll("-", "+").replaceAll("_", "/")),
                (c) => c.charCodeAt(0),
              ),
            });
          } catch {}
        }
        if (
          subscription &&
          expected === revision &&
          (!status.enabled ||
            (subscription.endpoint && (await deps.hash(subscription.endpoint)) !== storedId))
        ) {
          const saved = await deps.api<{ id: string }>("/push", {
            method: "POST",
            timeoutMs: 15000,
            body: {
              subscription: subscription.toJSON(),
              categories: preference.categories,
              preview: preference.preview,
            },
          });
          acceptedId = saved.id;
          if (expected === revision) {
            status = {
              ...status,
              enabled: true,
              categories: preference.categories,
              preview: preference.preview,
            };
            remember(saved.id, status);
          }
        }
      }
      if (expected === revision && status.enabled) remember(id() || storedId, status);
      return { status, registration, subscription };
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
  const disable = async () => {
    revision++;
    // Explicit disable wins over an already accepted background rebind.
    await pending?.catch(() => {});
    for (const device of new Set([id(), acceptedId].filter(Boolean)))
      await deps.api("/push/" + device, { method: "DELETE", timeoutMs: 10000 });
    acceptedId = "";
    remember("");
  };
  const save = async (
    subscription: PushSubscription,
    categories: PushCategories,
    preview: boolean,
  ) => {
    revision++;
    await pending?.catch(() => {});
    const saved = await deps.api<{ id: string }>("/push", {
      method: "POST",
      timeoutMs: 15000,
      body: { subscription: subscription.toJSON(), categories, preview },
    });
    acceptedId = saved.id;
    remember(saved.id, { available: true, enabled: true, categories, preview });
  };
  return { id, remember, restore, disable, save };
}
