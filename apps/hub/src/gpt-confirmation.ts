import type { Store } from "./store.js";

// Presentation only: never grants dispatch admission or changes a receipt.
// Elapsed time is not a native failure. Actual operation errors are shown on the
// job; incompatible/identity confirmation failures retain explicit review.
export const confirmationWarning =
  "Не удалось подтвердить доставку сообщения. Проверь историю перед новой отправкой.";

export function gptDeliveryConfirmed(store: Pick<Store, "db">, id: string): boolean {
  // Compatibility with legacy browser stores and migration/isolated fixtures.
  if (
    !store.db
      .prepare("PRAGMA table_info(gpt_native_receipts)")
      .all()
      .some((r) => r.name === "deliveredAt")
  )
    return false;
  return !!store.db.prepare("SELECT deliveredAt FROM gpt_native_receipts WHERE jobId=?").get(id)
    ?.deliveredAt;
}

export function gptConfirmationState(store: Pick<Store, "db">, id: string) {
  const db = store.db;
  if (gptDeliveryConfirmed(store, id)) return undefined;
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
      "SELECT j.status,j.error,COALESCE(h.paused,0) paused FROM gpt_jobs j JOIN gpt_native_receipts r ON r.jobId=j.id LEFT JOIN gpt_native_read_health h ON h.jobId=j.id WHERE j.id=?",
    )
    .get(id);
  if (!row || row.status !== "unknown") return undefined;
  return row.error !== "NATIVE_CHAT_PAUSED" && !row.paused ? "waiting" : "review";
}

export function gptConfirmationPending(store: Pick<Store, "db">, id: string) {
  return gptConfirmationState(store, id) === "waiting";
}
