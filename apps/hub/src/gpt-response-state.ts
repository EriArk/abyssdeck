/** The exact stream ending is evidence of local idle, not successful completion.
 * The selected window's Stop button may belong to a different conversation. */
export async function nativeResponseIdle(
  client: {
    liveDispatch?: (key: string, conversationId: string | null) => Promise<{ finished?: boolean }>;
    workspace?: (action: "activity") => Promise<Record<string, unknown>>;
  },
  key: string,
  conversationId: string | null,
) {
  if (!client.liveDispatch) return false;
  try {
    const live = await client.liveDispatch(key, conversationId);
    return live.finished === true;
  } catch {
    return false;
  }
}
