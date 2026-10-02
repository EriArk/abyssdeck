import type { GptHistoryPage, GptJob, GptMessage } from "@codex-web/shared";
import type { GptCachedChat } from "./gptCache";

/** Queued followers never replace the earlier response awaiting canonical receipt. */
export function currentGptProgress(jobs: GptJob[]): GptJob | undefined {
  return jobs
    .filter(
      (job) =>
        !job.dismissed &&
        (["queued", "preparing", "running"].includes(job.status) ||
          (job.status === "unknown" && !job.error)),
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];
}

export function gptJobUser(job: GptJob, messages: GptMessage[]): number {
  const matches = messages.flatMap((message, index) =>
    message.role === "user" &&
    (job.userMessageId
      ? message.id === job.userMessageId
      : message.text === job.text &&
        message.createdAt * 1000 >= job.createdAt - 30000 &&
        message.createdAt * 1000 <= job.updatedAt)
      ? [index]
      : [],
  );
  return matches.length === 1 ? matches[0]! : -1;
}

// A later native turn is history, not evidence that an earlier receipt succeeded.
// Keep that receipt accessible without appending its optimistic text to the new tail.
export function historicalGptJob(
  job: GptJob,
  messages: GptMessage[],
  historyUnavailable: boolean,
  jobs: GptJob[] = [],
): boolean {
  if (job.status !== "unknown" || !job.error) return false;
  // A newer canonical completion remains chronology evidence during a slow
  // history refresh. It does not resolve or discard this older receipt.
  if (
    jobs.some(
      (next) =>
        next.nativeId === job.nativeId &&
        next.id !== job.id &&
        next.status === "completed" &&
        next.createdAt > job.createdAt,
    )
  )
    return true;
  if (historyUnavailable) return false;
  const user = gptJobUser(job, messages);
  return user >= 0
    ? messages.slice(user + 1).some((message) => message.role === "user")
    : messages.some(
        (message) =>
          message.role === "user" &&
          message.createdAt * 1000 > job.createdAt + (job.userMessageId ? 0 : 30000),
      );
}

export function gptTurnProgress(messages: GptMessage[], job?: GptJob, receipts: GptJob[] = []) {
  const latest = messages.findLastIndex((message) => message.role === "user");
  const own = job ? gptJobUser(job, messages) : -1;
  const external =
    latest >= 0 &&
    latest !== own &&
    (!job || messages[latest]!.createdAt * 1000 > job.createdAt + 30000);
  const user = external ? latest : own;
  const after = user < 0 ? [] : messages.slice(user + 1);
  const next = after.findIndex((message) => message.role === "user");
  const turn = next < 0 ? after : after.slice(0, next);
  const answers = turn.filter((message) => message.role === "assistant");
  // Recent intermediate output must not resurrect a known stopped/idle turn
  // as activity in another client. Match the actual user message, never text.
  const settled = receipts.some(
    (receipt) =>
      !!receipt.userMessageId &&
      receipt.userMessageId === messages[user]?.id &&
      ["idle", "cancelled", "completed"].includes(receipt.status),
  );
  return {
    external,
    userId: messages[user]?.id,
    pending:
      !settled &&
      user >= 0 &&
      next < 0 &&
      // An old unfinished public node is not live activity. Recent output is
      // a bounded display hint only; expiry never completes or cancels a turn.
      (!external ||
        turn.some(
          (message) =>
            message.role === "assistant" && message.createdAt * 1000 >= Date.now() - 60000,
        )) &&
      !answers.some((message) => message.phase !== "commentary" && message.complete !== false),
    items: answers.map((message) => ({
      id: message.id,
      text: message.text,
      activity: message.activity,
      state: message.complete ? ("completed" as const) : ("active" as const),
    })),
  };
}
// The durable outbox's initial "queued" state is not a user-visible queue.
export function waitingGptJob(job: GptJob, jobs: GptJob[]): boolean {
  return (
    job.status === "queued" &&
    !!job.nativeId &&
    jobs.some(
      (other) =>
        other.id !== job.id &&
        !other.dismissed &&
        other.nativeId === job.nativeId &&
        other.createdAt <= job.createdAt &&
        ["queued", "preparing", "running", "unknown"].includes(other.status),
    )
  );
}

// A failed pre-dispatch attempt can outlive an explicit successful retry.
// Hide only that obsolete presentation; do not mutate receipts or resolve unknown sends.
export function completedGptRetry(job: GptJob, jobs: GptJob[]): boolean {
  if (job.status !== "failed" || !job.nativeId || job.summaryOnly) return false;
  return jobs.some(
    (next) =>
      next.id !== job.id &&
      !next.dismissed &&
      !next.summaryOnly &&
      next.status === "completed" &&
      next.nativeId === job.nativeId &&
      next.createdAt >= job.updatedAt &&
      next.createdAt <= job.updatedAt + 300000 &&
      next.text === job.text &&
      next.files.length === job.files.length &&
      next.files.every((file, index) => file.id === job.files[index]?.id),
  );
}

export function showGptJob(
  job: GptJob,
  messages: GptMessage[],
  now = Date.now(),
  jobs: GptJob[] = [],
  historyUnavailable = false,
): boolean {
  // Catalog summaries carry status only: their empty strings are not message content.
  if (job.summaryOnly || job.dismissed || completedGptRetry(job, jobs)) return false;
  if (["queued", "preparing", "running", "failed", "unknown"].includes(job.status)) return true;
  if (job.status === "cancelled" && !job.answer && !job.assets.length) return false;
  // Completed outbox entries must never append old messages below a paged native history.
  if (!historyUnavailable && job.updatedAt < now - 120000) return false;
  if (
    historyUnavailable &&
    job.updatedAt < now - 120000 &&
    jobs.some(
      (next) =>
        next.nativeId === job.nativeId &&
        !next.summaryOnly &&
        !next.dismissed &&
        next.status === "completed" &&
        next.createdAt > job.createdAt,
    )
  )
    return false;
  const user = gptJobUser(job, messages);
  if (user >= 0) {
    const later = messages.slice(user + 1);
    const nextUser = later.findIndex((message) => message.role === "user");
    const turn = nextUser < 0 ? later : later.slice(0, nextUser);
    if (
      turn.some(
        (message) =>
          message.role === "assistant" &&
          message.phase !== "commentary" &&
          message.complete !== false,
      )
    )
      return false;
    if (nextUser >= 0) return false;
  } else if (messages.some((message) => message.createdAt * 1000 > job.createdAt + 1000))
    return false;
  return true;
}

export function mergeGptJobs(previous: GptJob[], incoming: GptJob[]): GptJob[] {
  if (!incoming.length) return previous;
  const map = new Map(previous.map((job) => [job.id, job]));
  for (const job of incoming) {
    const old = map.get(job.id);
    // A response already in flight must not resurrect an explicitly deleted outbox item.
    if (old?.dismissed && !job.dismissed) continue;
    if (old && old.updatedAt > job.updatedAt) continue;
    map.set(
      job.id,
      job.dismissed
        ? { ...job, text: "", files: [], answer: "", assets: [], progress: [], error: "" }
        : job.summaryOnly && old && !old.summaryOnly
          ? {
              ...old,
              status: job.status,
              nativeId: job.nativeId,
              updatedAt: job.updatedAt,
              // Summary payloads omit errors. Only a confirmed healthy status
              // supersedes the old failure; unknown/failed still need full details.
              error: ["queued", "preparing", "running", "idle", "completed"].includes(job.status)
                ? ""
                : old.error,
            }
          : job,
    );
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
}

export function mergeGptHistory(
  previous: GptCachedChat | undefined,
  page: GptHistoryPage,
  older = false,
): GptCachedChat {
  if (page.delta) {
    const delta = page.delta;
    if (!previous || previous.revision !== delta.baseRevision)
      throw Error("GPT_HISTORY_DELTA_MISMATCH");
    const replaced =
      delta.replaceFrom === null
        ? -1
        : previous.messages.findIndex((m) => m.id === delta.replaceFrom);
    const after =
      delta.after === null ? -1 : previous.messages.findIndex((m) => m.id === delta.after);
    const cut =
      replaced >= 0
        ? replaced
        : after >= 0
          ? after + 1
          : !previous.messages.length && delta.after === null
            ? 0
            : -1;
    if (cut < 0) throw Error("GPT_HISTORY_DELTA_MISMATCH");
    const messages = [...previous.messages.slice(0, cut), ...page.items];
    return {
      ...previous,
      messages,
      revision: page.revision,
      checkedAt: Date.now(),
      stale: page.stale,
      refreshMessage: page.refreshMessage,
    };
  }
  if (page.notModified && previous)
    return {
      ...previous,
      checkedAt: Date.now(),
      stale: page.stale,
      refreshMessage: page.refreshMessage,
    };
  const keep = !!previous && (older || page.retainOlder);
  let messages = page.items;
  if (keep && previous) {
    if (older)
      messages = [...new Map([...page.items, ...previous.messages].map((m) => [m.id, m])).values()];
    else {
      const overlap = previous.messages.findIndex((m) => m.id === page.items[0]?.id);
      if (overlap >= 0) messages = [...previous.messages.slice(0, overlap), ...page.items];
    }
  }
  const retained = keep && messages.length > page.items.length;
  return {
    stale: page.stale,
    refreshMessage: page.refreshMessage,
    messages,
    contextMessage: older ? previous?.contextMessage : page.contextMessage,
    hasNewer: older ? previous?.hasNewer : page.hasNewer,
    before: older ? page.nextBefore : retained ? previous!.before : page.nextBefore,
    revision: older && previous ? previous.revision : page.revision,
    prefix: older && previous ? previous.prefix : page.prefix,
    anchor: older && previous ? previous.anchor : (page.items[0]?.id ?? ""),
    checkedAt: older && previous ? previous.checkedAt : Date.now(),
    scrollTop: previous?.scrollTop ?? 0,
    sticky: previous?.sticky ?? true,
  };
}
