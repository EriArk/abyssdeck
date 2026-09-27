import type { Store } from "./store.js";

export type GptMutationScope = {
  conversationId?: string | null;
  projectId?: string;
  scheduleId?: string;
};

/** Local admission only. The native ledger rechecks canonical project membership
 * before effects. Looking at these identities never confirms or replays work. */
export function gptMutationBlocked(
  store: Store,
  scope: GptMutationScope,
  options: { jobs?: boolean; libraryKey?: string } = {},
) {
  const db = store.db;
  const projectOf = (id: string | null | undefined): string | undefined => {
    if (!id) return undefined;
    const row = db
      .prepare("SELECT value FROM library_entities WHERE client='gpt' AND kind='thread' AND id=?")
      .get(id);
    return row ? JSON.parse(String(row.value)).projectId : undefined;
  };
  const projectId = scope.projectId ?? projectOf(scope.conversationId);
  const chatMatches = (id: string | null | undefined, project?: string) =>
    !!(
      (scope.conversationId && id === scope.conversationId) ||
      (scope.projectId && (project === scope.projectId || projectOf(id) === scope.projectId))
    );
  const projectMatches = (id: string | null | undefined) => !!id && id === projectId;
  for (const row of db
    .prepare(
      "SELECT nativeId,resultNativeId FROM gpt_native_operations WHERE state IN ('preparing','running','unknown')",
    )
    .all()) {
    if (chatMatches(row.nativeId as string) || chatMatches(row.resultNativeId as string))
      return true;
  }
  for (const row of db
    .prepare("SELECT projectId FROM gpt_project_operations WHERE state IN ('pending','unknown')")
    .all()) {
    if (projectMatches(row.projectId as string)) return true;
  }
  for (const row of db
    .prepare("SELECT key,kind,id FROM gpt_native_library WHERE state='unknown'")
    .all()) {
    if (row.key === options.libraryKey) continue;
    if (row.kind === "thread" ? chatMatches(row.id as string) : projectMatches(row.id as string))
      return true;
  }
  for (const row of db
    .prepare(
      "SELECT response FROM commands WHERE scope='gpt-native-workspace' AND state IN ('pending','unknown')",
    )
    .all()) {
    const input = JSON.parse(String(row.response)).input;
    if (
      input.kind === "schedule" ? scope.scheduleId === input.id : chatMatches(input.conversationId)
    )
      return true;
  }
  if (options.jobs) {
    for (const row of db
      .prepare(
        "SELECT j.nativeId,p.projectId FROM gpt_jobs j LEFT JOIN gpt_project_jobs p ON p.jobId=j.id WHERE j.status IN ('queued','preparing','running','unknown')",
      )
      .all()) {
      if (chatMatches(row.nativeId as string, row.projectId as string)) return true;
    }
  }
  return false;
}

/** Explicit adapter admission refusals occur before a receipt/effect. A timeout or
 * disconnection is deliberately not in this list and remains uncertain. */
export const nativeMutationNotStarted = (error: unknown) =>
  error instanceof Error &&
  [
    "NATIVE_PENDING_DISPATCH",
    "NATIVE_SCOPE_UNAVAILABLE",
    "NATIVE_BUSY",
    "NATIVE_MANUAL_RECOVERY",
    "NATIVE_QUEUE_FULL",
  ].includes(error.message);
