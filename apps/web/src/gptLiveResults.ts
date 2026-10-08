import type { GptJob, GptMessage, GptProgress, ResultItem } from "@codex-web/shared";

/** Fresh stream steps extend canonical history; completed canonical steps win
 * over retained stream snapshots after completion or branch navigation. */
export function mergeGptSteps(canonical: GptProgress[], incoming: GptProgress[]): GptProgress[] {
  const items = new Map(canonical.map((item) => [item.id, item]));
  for (const item of incoming) {
    const old = items.get(item.id);
    if (!old || (!old.incomplete && (old.state !== "completed" || item.state === "completed")))
      items.set(item.id, item);
  }
  return [...items.values()];
}

/** Display already confirmed requests while the separate Results read catches up.
 * Receipts are durable on the Hub; this projection never sends or polls anything.
 */
export function gptLiveResults(
  conversationId: string,
  messages: GptMessage[],
  jobs: GptJob[],
  live?: { jobId: string; items: GptProgress[] } | null,
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
      !job.userMessageId
    )
      continue;
    const existing = requests.get(job.userMessageId);
    const userIndex = messages.findIndex((message) => message.id === job.userMessageId);
    const tail = userIndex < 0 ? [] : messages.slice(userIndex + 1);
    const nextUser = tail.findIndex((message) => message.role === "user");
    const turn = nextUser < 0 ? tail : tail.slice(0, nextUser);
    if (
      existing &&
      turn.some(
        (message) =>
          message.role === "assistant" &&
          (message.incomplete || (message.phase !== "commentary" && message.complete !== false)),
      )
    )
      continue;
    const incoming = mergeGptSteps(job.progress ?? [], live?.jobId === job.id ? live.items : []);
    if (existing) {
      existing.payload.steps = mergeGptSteps(existing.payload.steps ?? [], incoming);
      continue;
    }
    // Do not resurrect a receipt from an older branch after canonical navigation.
    if (messages.some((m) => m.role === "user" && m.createdAt * 1000 > job.createdAt)) continue;
    requests.set(job.userMessageId, {
      id: "reasoning-" + job.userMessageId,
      turnId: job.userMessageId,
      type: "reasoning",
      title: job.text.trim().slice(0, 160) || "Запрос с вложениями",
      createdAt: new Date(job.createdAt).toISOString(),
      payload: { text: job.text, steps: incoming },
    });
  }
  return [...requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Results history can lag behind already received stream content. Merge by
 * exact request/step identity instead of replacing the whole request card. */
export function mergeResultItems(items: ResultItem[]): ResultItem[] {
  const merged = new Map<string, ResultItem>();
  for (const item of items) {
    const old = merged.get(item.id);
    merged.set(
      item.id,
      old?.type === "reasoning" && item.type === "reasoning"
        ? {
            ...item,
            payload: {
              ...item.payload,
              steps: mergeGptSteps(item.payload.steps ?? [], old.payload.steps ?? []),
            },
          }
        : item,
    );
  }
  return [...merged.values()];
}
