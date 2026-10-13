/** Extend only canonically attributed public messages from this exact receipt.
 * Live output cannot establish delivery, branch membership or completion. */
export function extendPublicOutput<
  T extends { id: string; text: string; role?: string; complete?: boolean },
>(messages: T[], items: { id: string; text: string; activity?: string }[]): T[] {
  const unique = new Map<string, { id: string; text: string; activity?: string }>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (unique.has(item.id)) duplicates.add(item.id);
    unique.set(item.id, item);
  }
  return messages.map((message) => {
    const item = unique.get(message.id);
    if (
      message.role !== "assistant" ||
      message.complete === true ||
      !item ||
      duplicates.has(message.id) ||
      item.activity ||
      !message.text ||
      item.text.length <= message.text.length ||
      !item.text.startsWith(message.text)
    )
      return message;
    return { ...message, text: item.text };
  });
}
