import type { History, Message } from "./types";
import type { ChatState } from "./useWorkspace";

/** A history response may arrive after newer WebSocket events on an already open client. */
export function mergeHistorySnapshot(state: ChatState, history: History): ChatState {
  const newer = state.messages.filter((message) =>
    message.sendState
      ? !history.messages.some(
          (native) =>
            !!message.turnId &&
            message.turnId === native.turnId &&
            sameSubmittedMessage(message, native),
        )
      : message.lastSeq > history.lastSeq,
  );
  const byId = new Map(newer.map((message) => [message.id, message]));
  const messages = history.messages.map((message) => byId.get(message.id) ?? message);
  const ids = new Set(messages.map((message) => message.id));
  messages.push(...newer.filter((message) => !ids.has(message.id)));
  return {
    ...state,
    ...history,
    messages,
    turnOutcomes: mergeTurnOutcomes(history.turnOutcomes, state.turnOutcomes),
    thread: state.lastSeq > history.lastSeq ? state.thread : history.thread,
    approvals: state.lastSeq > history.lastSeq ? state.approvals : history.approvals,
    lastSeq: Math.max(state.lastSeq, history.lastSeq),
    contextTurn: history.contextTurn ?? "",
    hasNewer: history.hasNewer ?? false,
    loading: false,
    error: "",
    revision: state.revision + 1,
  };
}

// Content alone cannot identify an older/repeated send. Callers also bind either
// the newly arriving user event or the exact acknowledged turn.
export function sameSubmittedMessage(local: Message, native: Message): boolean {
  return (
    native.role === "user" &&
    local.text.trim() === native.text.trim() &&
    JSON.stringify((local.attachments ?? []).map((file) => file.id)) ===
      JSON.stringify((native.attachments ?? []).map((file) => file.id))
  );
}

export function mergeTurnOutcomes(a: History["turnOutcomes"], b: History["turnOutcomes"]) {
  const result = { ...a };
  for (const [id, value] of Object.entries(b ?? {}))
    if (!result[id] || result[id].seq < value.seq) result[id] = value;
  return result;
}
