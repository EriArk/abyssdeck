/** Native text selection belongs to the reader; background updates must not move it. */
export function hasChatSelection(root: HTMLElement | null): boolean {
  const selection = root?.ownerDocument.getSelection();
  if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return false;
  for (let index = 0; index < selection.rangeCount; index++)
    if (selection.getRangeAt(index).intersectsNode(root)) return true;
  return false;
}
