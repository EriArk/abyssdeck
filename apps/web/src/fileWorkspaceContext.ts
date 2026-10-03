import { createContext, type RefObject } from "react";

/** An editor borrows this window's content area and close guard, never another modal. */
export const FileWorkspaceContext = createContext<{
  editorHost: HTMLDivElement | null;
  setEditing: (value: boolean) => void;
  closeGuard: RefObject<((complete: () => void) => void) | null>;
} | null>(null);

/** Only the file action rail is compact; nested dialogs retain their own controls. */
export const CompactFileActions = createContext(false);
