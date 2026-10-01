import type { ThreadActivity } from "@codex-web/shared";
import type { History } from "./types";

export function taskEndLabel(
  turnId: string | null,
  status: string,
  last: boolean,
  completion?: ThreadActivity,
  outcomes?: History["turnOutcomes"],
) {
  const outcome =
    (turnId ? outcomes?.[turnId]?.status : undefined) ??
    (completion?.completedTurnId === turnId ? completion?.completedStatus : last ? status : null);
  return outcome === "failed"
    ? "Ход завершился с ошибкой"
    : outcome === "interrupted"
      ? "Ход остановлен"
      : "Конец задачи";
}

export function turnFailureMessage(turnId: string | null, outcomes?: History["turnOutcomes"]) {
  const outcome = turnId ? outcomes?.[turnId] : undefined;
  if (outcome?.status !== "failed" || !outcome.error) return "";
  if (/Selected model is at capacity/i.test(outcome.error))
    return "Модель сейчас перегружена. Выбери другую модель или попробуй позже.";
  return outcome.error;
}
