export interface GptFile {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  url: string;
  image: boolean;
}
export interface GptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  files: GptFile[];
  phase?: "commentary" | "final";
  activity?: GptProgress["activity"];
  complete?: boolean;
  /** Visible native content that the web renderer cannot yet display. Never raw payloads. */
  unsupported?: ("audio" | "video" | "interactive" | "other")[];
}
/** Messages counted by chat pagination and rendered in the conversation pane. */
export function isGptChatMessage(message: GptMessage): boolean {
  return message.role === "user" || (message.phase !== "commentary" && message.complete !== false);
}
export interface GptConversation {
  pinned?: boolean;
  /** Exact position in the native pin list; independent of chat activity. */
  pinnedOrder?: number;
  archived?: boolean;
  deleted?: boolean;
  id: string;
  title: string;
  updatedAt: number;
  projectId?: string;
}
export interface GptProject {
  pinned?: boolean;
  /** Exact position in the native pin list; independent of chat activity. */
  pinnedOrder?: number;
  archived?: boolean;
  deleted?: boolean;
  id: string;
  name: string;
}
export interface GptModels {
  effortsByModel?: Record<string, { id: string; label: string }[]>;
  models: { id: string; label: string }[];
  efforts: { id: string; label: string }[];
  currentModel: string;
  currentEffort: string;
}
export interface GptJob {
  deliveryConfirmed?: boolean;
  /** Exact native user node of this receipt, including a node outside the current branch. */
  userMessageId?: string;
  dismissed?: boolean;
  id: string;
  nativeId: string | null;
  text: string;
  files: GptFile[];
  model: string;
  effort: string;
  status:
    | "queued"
    | "preparing"
    | "running"
    | "idle"
    | "completed"
    | "failed"
    | "unknown"
    | "cancelled";
  answer: string;
  progress?: GptProgress[];
  summaryOnly?: boolean;
  assets: GptFile[];
  createdAt: number;
  updatedAt: number;
  error: string;
}

export interface GptProgress {
  id: string;
  text: string;
  state: "active" | "completed";
  activity?: "search" | "review" | "code" | "image" | "tool";
}
export interface GptHistoryPage {
  /** Replace the suffix of the exact prior public snapshot; absent means a normal page. */
  delta?: { baseRevision: string; replaceFrom: string | null; after: string | null };
  /** A previously observed public branch, retained while the native read is unavailable. */
  stale?: boolean;
  refreshMessage?: string;
  contextMessage?: string;
  hasNewer?: boolean;
  items: GptMessage[];
  nextBefore: string | null;
  revision: string;
  prefix: string;
  notModified: boolean;
  retainOlder: boolean;
}
