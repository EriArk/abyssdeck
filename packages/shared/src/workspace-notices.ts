import type { NotebookLink } from "./notebook.js";
export type WorkspaceNotice = {
  id: string;
  title: string;
  detail: string;
  at: number;
  target: NotebookLink;
};
export type WorkspaceNotices = { items: WorkspaceNotice[] };
