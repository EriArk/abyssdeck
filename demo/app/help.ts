import features from "./features.json";
export type HelpSection = {
  title: string;
  paragraphs: string[];
  steps?: string[];
  bullets?: string[];
};
export type HelpArticle = {
  id: string;
  category: string;
  group: string;
  title: string;
  summary: string;
  sections: HelpSection[];
  related: string[];
  keywords: string;
};
export const helpArticles: HelpArticle[] = features.map(
  ([id, category, title, , summary]) => ({
    id,
    category,
    group: category,
    title,
    summary,
    sections: [
      { title: "In AbyssDeck", paragraphs: [summary] },
      {
        title: "In this website demo",
        paragraphs: [
          "You are exploring the actual application interface with fictional, browser-local data. File edits, notes, tasks and plans reset when you reload. AI, Git and remote-computer examples are simulated. Account setup, collaboration and maintenance need an installed Hub and are not connected from this page.",
        ],
      },
    ],
    related: [],
    keywords: `${category} ${title} ${summary}`,
  }),
);
const steps: Record<string, string[]> = {
  files: [
    "Open Files from the project header.",
    "Choose README.md to read it beside the file list.",
    "Choose Unlock and edit. Edit the sample in the real Markdown editor, then Save.",
    "Close or minimize the window to return to the same conversation.",
  ],
  codex: [
    "Choose a project and a conversation in the left panel.",
    "Send a short message to see a clearly labelled scripted reply.",
    "Open Results to explore files, the image gallery and a public work summary.",
  ],
  terminal: [
    "Open Devices in the sidebar footer.",
    "Choose the Linux Hub and its Sample terminal.",
    "Try ls, pwd or whoami. The terminal is a simulation; no commands reach a host.",
  ],
  themes: [
    "Open Settings, then Appearance.",
    "Choose a theme, screen variant and casing color.",
    "Resize the embedded frame to see the actual phone or desktop layout.",
  ],
};
for (const [id, items] of Object.entries(steps)) {
  const article = helpArticles.find((a) => a.id === id);
  article?.sections.push({ title: "Try it", paragraphs: [], steps: items });
}
export const helpCategories = [...new Set(helpArticles.map((a) => a.category))];
const aliases: Record<string, string> = {
  start: "codex",
  keys: "windows",
  editor: "viewer",
  "terminal-input": "terminal",
  shared: "spaces",
  home: "codex",
};
export const helpArticle = (id: string) =>
  helpArticles.find((a) => a.id === (aliases[id] || id));
export function searchHelp(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/);
  return helpArticles.filter((a) =>
    words.every((w) =>
      `${a.title} ${a.summary} ${a.category}`.toLowerCase().includes(w),
    ),
  );
}
