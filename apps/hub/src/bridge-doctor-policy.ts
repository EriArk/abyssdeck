import type { Store } from "./store.js";

/** Only the private, explicitly associated maintenance thread gets Doctor privileges. */
export function doctorThread(store: Store, id: string, repair = false): boolean {
  const row = store.db.prepare("SELECT value FROM bridge_doctor_config WHERE id=1").get();
  if (!row) return false;
  const a = JSON.parse(String(row.value));
  const t = store.db
    .prepare("SELECT projectId,diagnostic,archived FROM threads WHERE id=?")
    .get(id);
  return (
    !!t?.diagnostic &&
    !t.archived &&
    a.threadId === id &&
    a.projectId === t.projectId &&
    (!repair || (a.enabled && a.mode === "repair" && a.state === "ready"))
  );
}

export const doctorRepairInstructions = [
  "The owner enabled automatic repair of this workspace's GPT integration. Diagnose and repair the concrete incident, including native app update compatibility; do not stop at a proposed fix or ask again for ordinary edits/tests.",
  "Inspect the installed app and checkout first. Use an isolated Git worktree for code changes so other project chats can continue. Follow the repository's verification and normal deployment/rollback workflow; preserve active work, accounts, profiles and exact operation receipts. An idle maintenance admission applies to activation, not to investigation or preparation.",
  "Do not replay uncertain sends, restart unfinished provider responses, clear user receipts, change account permissions or force a deployment. Login prompts and upstream rate limits require account recovery or cooldown, not speculative code changes. Never print credentials.",
  "Verify the actual affected operation after repair and report code, installation and live acceptance separately. A native build mismatch calls for restoring the adapter's actual module/export mapping, not removing identity or protocol validation. If another agent already repaired the incident, verify and finish without redundant changes.",
].join("\n");
