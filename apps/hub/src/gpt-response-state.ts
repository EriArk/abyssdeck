/** A finished exact native stream is positive evidence; an old timestamp isn't. */
export async function nativeResponseIdle(
  client: {
    liveDispatch?: (key: string, conversationId: string | null) => Promise<{ finished?: boolean }>;
    workspace?: (action: "activity") => Promise<Record<string, unknown>>;
  },
  key: string,
  conversationId: string | null,
) {
  if (!client.liveDispatch || !client.workspace) return false;
  try {
    const live = await client.liveDispatch(key, conversationId);
    if (live.finished !== true) return false;
    const current = await client.workspace("activity");
    return current.ready === true && current.generating === false;
  } catch {
    return false;
  }
}
