// This entire module (including workers/CSS) is reached only for a desktop code editor.
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import type { EngineOptions, FileEditorEngine } from "./fileEditorEngine";

globalThis.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === "json") return new JsonWorker();
    if (["css", "scss", "less"].includes(label)) return new CssWorker();
    if (["html", "handlebars", "razor"].includes(label)) return new HtmlWorker();
    if (["typescript", "javascript"].includes(label)) return new TsWorker();
    return new EditorWorker();
  },
};
// Local language services only. Opening a document must not fetch schema URLs from its text.
monaco.json.jsonDefaults.setDiagnosticsOptions({ validate: true, enableSchemaRequest: false });
for (const defaults of [
  monaco.typescript.typescriptDefaults,
  monaco.typescript.javascriptDefaults,
]) {
  defaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    allowJs: true,
    noEmit: true,
    noResolve: true,
    jsx: monaco.typescript.JsxEmit.Preserve,
  });
}

function applyTheme(host: HTMLElement) {
  const styles = getComputedStyle(host);
  // Resolve semantic CSS colors (including color-mix) into Monaco's hex color contract.
  const canvas = document.createElement("canvas"),
    context = canvas.getContext("2d")!;
  canvas.width = canvas.height = 1;
  const color = (name: string, fallback: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = fallback;
    context.fillStyle = styles.getPropertyValue(name).trim() || fallback;
    context.fillRect(0, 0, 1, 1);
    return (
      "#" +
      Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("")
    );
  };
  const background = color("--window-screen", "#101810"),
    ink = color("--ink", "#a6e3ac"),
    accent = color("--accent", "#9dfbae"),
    muted = color("--muted", "#8aab94"),
    edge = color("--window-edge", "#476451");
  const rgb = [1, 3, 5].map((offset) => parseInt(background.slice(offset, offset + 2), 16));
  const dark = rgb[0]! * 0.299 + rgb[1]! * 0.587 + rgb[2]! * 0.114 < 128;
  monaco.editor.defineTheme("codex-workspace", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "", foreground: ink.slice(1) },
      { token: "keyword", foreground: accent.slice(1) },
      { token: "comment", foreground: muted.slice(1), fontStyle: "italic" },
      { token: "string", foreground: ink.slice(1), fontStyle: "bold" },
      { token: "number", foreground: accent.slice(1) },
      { token: "type", foreground: accent.slice(1) },
      { token: "delimiter", foreground: ink.slice(1) },
      { token: "operator", foreground: accent.slice(1) },
      { token: "tag", foreground: accent.slice(1) },
      { token: "attribute.name", foreground: ink.slice(1) },
      { token: "attribute.value", foreground: accent.slice(1) },
    ],
    colors: {
      "editor.background": background,
      "editor.foreground": ink,
      "editorLineNumber.foreground": muted,
      "editorLineNumber.activeForeground": ink,
      "editorCursor.foreground": ink,
      "editorBracketHighlight.foreground1": accent,
      "editorBracketHighlight.foreground2": ink,
      "editorBracketHighlight.foreground3": accent,
      "editorBracketHighlight.foreground4": ink,
      "editorBracketHighlight.foreground5": accent,
      "editorBracketHighlight.foreground6": ink,
      "editor.selectionBackground": accent + "50",
      "editor.inactiveSelectionBackground": accent + "25",
      "editor.lineHighlightBackground": accent + "12",
      "editorWidget.background": background,
      "editorWidget.foreground": ink,
      "editorWidget.border": edge,
      "editorSuggestWidget.background": background,
      "editorSuggestWidget.foreground": ink,
      "editorSuggestWidget.border": edge,
      "editorSuggestWidget.selectedBackground": accent + "30",
      "input.background": background,
      "input.foreground": ink,
      "input.border": edge,
      focusBorder: accent,
      "list.activeSelectionBackground": accent + "35",
      "list.activeSelectionForeground": ink,
      "list.hoverBackground": accent + "20",
    },
  });
  monaco.editor.setTheme("codex-workspace");
}

export function createMonaco(options: EngineOptions, language: string): FileEditorEngine {
  // Opaque per-open URI isolates unrelated accounts/sources, including equal display filenames.
  const name = options.path.split(/[\\/]/).at(-1) || "source";
  const uri = monaco.Uri.from({
    scheme: "inmemory",
    authority: crypto.randomUUID(),
    path: "/" + name,
  });
  const model = monaco.editor.createModel(options.text.replace(/\r\n|\r/g, "\n"), language, uri);
  let view: monaco.editor.IStandaloneCodeEditor;
  try {
    applyTheme(options.host);
    const scale = Number(getComputedStyle(options.host).getPropertyValue("--user-text-scale")) || 1;
    view = monaco.editor.create(options.host, {
      model,
      theme: "codex-workspace",
      ariaLabel: "Содержимое файла",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14 * scale,
      fontFamily: "Consolas, ui-monospace, monospace",
      lineNumbers: "on",
      folding: true,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: false,
      wordBasedSuggestions: "currentDocument",
      wordWrap: "off",
      tabSize: 2,
      padding: { top: 8, bottom: 8 },
      renderWhitespace: "selection",
      contextmenu: true,
    });
  } catch (error) {
    model.dispose();
    options.host.replaceChildren();
    throw error;
  }
  const text = () => model.getValue(monaco.editor.EndOfLinePreference.LF);
  const subscriptions = [
    model.onDidChangeContent(() => options.onChange(text())),
    view.onDidChangeCursorPosition(({ position }) =>
      options.onPosition(position.lineNumber, position.column),
    ),
    view.addAction({
      id: "workspace.save",
      label: "Сохранить файл",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      keybindingContext: "editorTextFocus",
      run: options.onSave,
    }),
  ];
  const observer = new MutationObserver(() => {
    applyTheme(options.host);
    const scale = Number(getComputedStyle(options.host).getPropertyValue("--user-text-scale")) || 1;
    view.updateOptions({ fontSize: 14 * scale });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-theme-mode", "data-theme-variant", "style", "class"],
  });
  const actionIds = {
    undo: "undo",
    redo: "redo",
    search: "actions.find",
    line: "editor.action.gotoLine",
    fold: "editor.foldAll",
    unfold: "editor.unfoldAll",
    bracket: "editor.action.jumpToBracket",
  };
  return {
    kind: "monaco",
    text,
    selection: () => {
      const selection = view.getSelection()!;
      return {
        from: model.getOffsetAt(selection.getStartPosition()),
        to: model.getOffsetAt(selection.getEndPosition()),
      };
    },
    change: ({ from, to, insert, anchor, head }) => {
      const start = model.getPositionAt(from),
        end = model.getPositionAt(to);
      view.pushUndoStop();
      view.executeEdits("workspace", [
        { range: monaco.Range.fromPositions(start, end), text: insert.replace(/\r\n|\r/g, "\n") },
      ]);
      if (anchor !== undefined)
        view.setSelection(
          monaco.Selection.fromPositions(
            model.getPositionAt(anchor),
            model.getPositionAt(head ?? anchor),
          ),
        );
      view.pushUndoStop();
    },
    command: (command) => {
      view.focus();
      view.trigger("workspace", actionIds[command], null);
    },
    wrap: (enabled) => view.updateOptions({ wordWrap: enabled ? "on" : "off" }),
    reload: (value) => model.setValue(value.replace(/\r\n|\r/g, "\n")),
    focus: () => view.focus(),
    measure: () => view.layout(),
    destroy: () => {
      observer.disconnect();
      for (const item of subscriptions) item.dispose();
      view.dispose();
      model.dispose();
    },
  };
}
