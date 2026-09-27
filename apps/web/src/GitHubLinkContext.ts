import { createContext } from "react";
/** Exact local checkout supplied by the mounted source, never a global last selection. */
export const GitHubLinkContext = createContext<string | undefined>(undefined);
