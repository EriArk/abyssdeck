export interface GptFile {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  url: string;
  image: boolean;
}
/** Build once per snapshot, rather than scan every attachment for every step. */
export function gptFileIndex(messages: Pick<GptMessage, "files">[]): Map<string, GptFile> {
  const files = new Map<string, GptFile>();
  for (const message of messages)
    for (const file of message.files ?? []) if (!files.has(file.id)) files.set(file.id, file);
  return files;
}
export function gptCitedFiles(text: string, files: ReadonlyMap<string, GptFile>): GptFile[] {
  if (!files.size || !text.includes("<FileCite")) return [];
  const cited = new Map<string, GptFile>();
  // IDs can also occur in data declarations used by a templated FileCite.
  // Token lookup preserves those sources without scanning the attachment list.
  for (const match of text.matchAll(/[A-Za-z0-9_-]+/g)) {
    const file = files.get(match[0]);
    if (file) cited.set(file.id, file);
  }
  return [...cited.values()];
}
/** Display-only native component data, scoped to the containing message. */
export interface GptRichReference {
  key: string;
  component?: "Cite" | "AsyncImage" | "Entity" | "Link";
  status: "pending" | "resolved" | "failed";
  sources?: { url: string; title?: string; label?: string; snippet?: string }[];
  images?: { src: string; sourceUrl?: string; alt?: string }[];
  url?: string;
  maxWidth?: string;
  aspectRatio?: string;
}
export interface GptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  files: GptFile[];
  richReferences?: GptRichReference[];
  phase?: "commentary" | "final";
  activity?: GptProgress["activity"];
  complete?: boolean;
  /** Native turn ended without a successful final answer; preserve available output. */
  incomplete?: boolean;
  /** Visible native content that the web renderer cannot yet display. Never raw payloads. */
  unsupported?: ("audio" | "video" | "interactive" | "other")[];
}
/** Messages counted by chat pagination and rendered in the conversation pane. */
export function isGptChatMessage(message: GptMessage): boolean {
  return (
    message.role === "user" ||
    message.incomplete === true ||
    (message.phase !== "commentary" && message.complete !== false)
  );
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
  answerMessages?: Pick<GptMessage, "id" | "text" | "richReferences">[];
  progress?: GptProgress[];
  summaryOnly?: boolean;
  assets: GptFile[];
  createdAt: number;
  updatedAt: number;
  error: string;
}

export interface GptProgress {
  files?: GptFile[];
  id: string;
  text: string;
  richReferences?: GptRichReference[];
  state: "active" | "completed";
  incomplete?: boolean;
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
