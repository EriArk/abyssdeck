import type { GptJob, GptMessage, ResultItem } from "@codex-web/shared";

/** Display already confirmed requests while the separate Results read catches up.
 * Receipts are durable on the Hub; this projection never sends or polls anything.
 */
export function gptLiveResults(
  conversationId: string,
  messages: GptMessage[],
  jobs: GptJob[],
): ResultItem[] {
  const requests = new Map<string, ResultItem>();
  let current: ResultItem | undefined;
  for (const message of messages) {
    if (message.role === "user") {
      current = {
        id: "reasoning-" + message.id,
        turnId: message.id,
        type: "reasoning",
        title: message.text.trim().slice(0, 160) || "Запрос с вложениями",
        createdAt: new Date(message.createdAt * 1000 || 0).toISOString(),
        payload: { text: message.text, steps: [] },
      };
      requests.set(message.id, current);
    } else if (current) {
      current.payload.steps!.push({
        id: message.id,
        text: message.text,
        activity: message.activity,
        state: message.complete === false && !message.incomplete ? "active" : "completed",
        ...(message.incomplete ? { incomplete: true } : {}),
      });
    }
  }
  for (const job of jobs) {
    if (
      job.nativeId !== conversationId ||
      job.dismissed ||
      !job.deliveryConfirmed ||
      !job.userMessageId ||
      requests.has(job.userMessageId)
    )
      continue;
    // Do not resurrect a receipt from an older branch after canonical navigation.
    if (messages.some((m) => m.role === "user" && m.createdAt * 1000 > job.createdAt)) continue;
    requests.set(job.userMessageId, {
      id: "reasoning-" + job.userMessageId,
      turnId: job.userMessageId,
      type: "reasoning",
      title: job.text.trim().slice(0, 160) || "Запрос с вложениями",
      createdAt: new Date(job.createdAt).toISOString(),
      payload: { text: job.text, steps: job.progress ?? [] },
    });
  }
  return [...requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
