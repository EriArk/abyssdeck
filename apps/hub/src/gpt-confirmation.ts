import type { Store } from "./store.js";

// Presentation only: never grants dispatch admission or changes a receipt.
// Three failed confirmations can end recovery earlier; an unavailable worker
// must not leave the UI silently waiting forever either.
export const confirmationWaitMs = 120000;
export const confirmationWarning =
  "Не удалось подтвердить доставку сообщения. Проверь историю перед новой отправкой.";

export function gptConfirmationState(store: Pick<Store, "db">, id: string, now = Date.now()) {
  const db = store.db;
  if (
    Number(
      db
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('gpt_native_receipts','gpt_native_read_health')",
        )
        .get()?.n,
    ) !== 2
  )
    return undefined; // Legacy browser jobs retain their explicit uncertainty.
  const row = db
    .prepare(
      "SELECT j.status,j.error,COALESCE(r.uncertainSince,j.createdAt) since,COALESCE(h.paused,0) paused FROM gpt_jobs j JOIN gpt_native_receipts r ON r.jobId=j.id LEFT JOIN gpt_native_read_health h ON h.jobId=j.id WHERE j.id=?",
    )
    .get(id);
  if (!row || row.status !== "unknown") return undefined;
  return row.error !== "NATIVE_CHAT_PAUSED" &&
    !row.paused &&
    now - Number(row.since) < confirmationWaitMs
    ? "waiting"
    : "review";
}

export function gptConfirmationPending(store: Pick<Store, "db">, id: string) {
  return gptConfirmationState(store, id) === "waiting";
}
