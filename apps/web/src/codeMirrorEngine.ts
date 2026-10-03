import {
  indentWithTab,
  isolateHistory,
  redo,
  selectMatchingBracket,
  undo,
} from "@codemirror/commands";
import {
  foldAll,
  HighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
  unfoldAll,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { gotoLine, openSearchPanel } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import type { EngineOptions, FileEditorEngine } from "./fileEditorEngine";

export function createCodeMirror(options: EngineOptions): FileEditorEngine {
  const wrapping = new Compartment(),
    syntax = new Compartment(),
    endings = new Compartment();
  let alive = true;
  const view = new EditorView({
    parent: options.host,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        keymap.of([
          indentWithTab,
          {
            key: "Mod-s",
            run: () => {
              options.onSave();
              return true;
            },
          },
        ]),
        basicSetup,
        endings.of(EditorState.lineSeparator.of(options.separator)),
        EditorView.contentAttributes.of({
          "aria-label": "Содержимое файла",
          spellcheck: "false",
          autocapitalize: "off",
          autocorrect: "off",
        }),
        wrapping.of([]),
        syntax.of([]),
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: [tags.keyword, tags.operator], color: "var(--accent)" },
            { tag: [tags.string, tags.number, tags.bool], color: "var(--ink)", fontWeight: "600" },
            { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
            {
              tag: [tags.typeName, tags.function(tags.variableName)],
              color: "var(--accent)",
              fontWeight: "600",
            },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head,
              line = update.state.doc.lineAt(head);
            options.onPosition(line.number, head - line.from + 1);
          }
        }),
      ],
    }),
  });
  const lang = LanguageDescription.matchFilename(languages, options.path);
  if (lang)
    void lang
      .load()
      .then((extension) => {
        if (alive) view.dispatch({ effects: syntax.reconfigure(extension) });
      })
      .catch(() => {});
  return {
    kind: "codemirror",
    text: () => view.state.doc.toString(),
    selection: () => view.state.selection.main,
    change: ({ from, to, insert, anchor, head }) =>
      view.dispatch({
        changes: { from, to, insert },
        ...(anchor !== undefined ? { selection: { anchor, head } } : {}),
        annotations: isolateHistory.of("full"),
        scrollIntoView: true,
      }),
    command: (command) => {
      const commands = {
        undo,
        redo,
        search: openSearchPanel,
        line: gotoLine,
        fold: foldAll,
        unfold: unfoldAll,
        bracket: selectMatchingBracket,
      };
      commands[command](view);
      if (command === "bracket") view.focus();
    },
    wrap: (enabled) =>
      view.dispatch({ effects: wrapping.reconfigure(enabled ? EditorView.lineWrapping : []) }),
    reload: (text, separator) =>
      view.dispatch({
        effects: endings.reconfigure(EditorState.lineSeparator.of(separator)),
        changes: { from: 0, to: view.state.doc.length, insert: text },
      }),
    focus: () => view.focus(),
    measure: () => view.requestMeasure(),
    destroy: () => {
      alive = false;
      view.destroy();
    },
  };
}
