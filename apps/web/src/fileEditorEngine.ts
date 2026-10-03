/** Only text/view operations live here. File IO, receipts and drafts stay in FileEditor. */
export type TextChange = {
  from: number;
  to: number;
  insert: string;
  anchor?: number;
  head?: number;
};
export type EditorCommand = "undo" | "redo" | "search" | "line" | "fold" | "unfold" | "bracket";
export interface FileEditorEngine {
  kind: "codemirror" | "monaco";
  text(): string;
  selection(): { from: number; to: number };
  change(change: TextChange): void;
  command(command: EditorCommand): void;
  wrap(enabled: boolean): void;
  reload(text: string, separator: string): void;
  focus(): void;
  measure(): void;
  destroy(): void;
}
export type EngineOptions = {
  host: HTMLElement;
  path: string;
  text: string;
  separator: string;
  onChange(text: string): void;
  onPosition(line: number, column: number): void;
  onSave(): void;
};

// A filename is a language hint only; it never grants a writable file identity.
export function codeLanguage(path: string): string | undefined {
  const name = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  if (/^(dockerfile)(\..*)?$/.test(name)) return "dockerfile";
  const extension = name.split(".").at(-1) ?? "";
  const groups: Record<string, string[]> = {
    typescript: ["ts", "tsx", "mts", "cts"],
    javascript: ["js", "jsx", "mjs", "cjs"],
    python: ["py", "pyw", "pyi"],
    rust: ["rs"],
    go: ["go"],
    java: ["java"],
    c: ["c", "h"],
    cpp: ["cpp", "cc", "cxx", "hpp", "hxx"],
    csharp: ["cs"],
    dart: ["dart"],
    kotlin: ["kt", "kts"],
    swift: ["swift"],
    ruby: ["rb"],
    php: ["php"],
    lua: ["lua"],
    shell: ["sh", "bash", "zsh"],
    powershell: ["ps1", "psm1", "psd1"],
    bat: ["bat", "cmd"],
    html: ["html", "htm"],
    css: ["css"],
    scss: ["scss"],
    less: ["less"],
    sql: ["sql"],
    json: ["json", "jsonc"],
    yaml: ["yaml", "yml"],
    xml: ["xml", "svg", "xhtml", "xsl", "xsd"],
  };
  return Object.entries(groups).find(([, extensions]) => extensions.includes(extension))?.[0];
}

export function supportsMonaco(): boolean {
  // iPadOS can advertise a desktop UA. Hardware keyboards do not change its browser support.
  return (
    typeof Worker !== "undefined" &&
    !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) &&
    !matchMedia("(pointer: coarse)").matches &&
    !matchMedia("(max-width: 600px)").matches
  );
}
