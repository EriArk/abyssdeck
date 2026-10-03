import { isolateHistory, selectMatchingBracket } from "@codemirror/commands";
import { foldAll, unfoldAll } from "@codemirror/language";
import { gotoLine } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { type RefObject, useState } from "react";
import { Icon } from "./icons";
import { formatJson, type MarkdownAction, markdownChange } from "./textFormatOperations";
import "./file-format-tools.css";

export function FileTextTools({
  editor,
  path,
  disabled,
}: {
  editor: RefObject<EditorView | null>;
  path: string;
  disabled: boolean;
}) {
  const [notice, setNotice] = useState("");
  const markdown = /\.(md|markdown)$/i.test(path),
    json = /\.(json|jsonl|ndjson)$/i.test(path),
    xml = /\.(xml|svg|xhtml)$/i.test(path);
  const tools: [MarkdownAction, string, string][] = [
    ["heading", "Заголовок", "heading"],
    ["bold", "Жирный", "bold"],
    ["italic", "Курсив", "italic"],
    ["list", "Список", "plan"],
    ["task", "Список задач", "select"],
    ["quote", "Цитата", "quote"],
    ["link", "Ссылка", "link"],
    ["image", "Изображение", "image"],
    ["code", "Блок кода", "code"],
    ["table", "Таблица", "grid"],
  ];
  const apply = (action: MarkdownAction) => {
    const view = editor.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const change = markdownChange(view.state.doc.toString(), from, to, action);
    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      selection: { anchor: change.anchor, head: change.head },
      annotations: isolateHistory.of("full"),
      scrollIntoView: true,
    });
    view.focus();
    setNotice("");
  };
  const structure = (format: boolean) => {
    const view = editor.current;
    if (!view) return;
    try {
      const text = view.state.doc.toString();
      let next = text;
      if (json) next = formatJson(text, /\.(jsonl|ndjson)$/i.test(path));
      else if (
        new DOMParser().parseFromString(text, "application/xml").querySelector("parsererror")
      )
        throw Error("Некорректный XML.");
      if (format && next !== text)
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next },
          annotations: isolateHistory.of("full"),
        });
      setNotice(format ? "Форматирование применено. Можно отменить." : "Синтаксис корректен.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось проверить синтаксис.");
    }
  };
  const button = (label: string, icon: string, action: () => void) => (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={action}
    >
      <Icon name={icon} />
    </button>
  );
  return (
    <div className="file-format-tools">
      <div
        role="toolbar"
        className="format-tool-row"
        aria-label={markdown ? "Инструменты Markdown" : "Инструменты текста"}
      >
        {markdown &&
          tools.map(([action, label, icon]) => (
            <span key={action}>{button(label, icon, () => apply(action))}</span>
          ))}
        {button("Перейти к строке", "line", () => {
          if (editor.current) gotoLine(editor.current);
        })}
        {button("Свернуть блоки", "fold", () => {
          if (editor.current) foldAll(editor.current);
        })}
        {button("Развернуть блоки", "unfold", () => {
          if (editor.current) unfoldAll(editor.current);
        })}
        {!markdown &&
          button("К парной скобке", "code", () => {
            if (editor.current) {
              selectMatchingBracket(editor.current);
              editor.current.focus();
            }
          })}
        {(json || xml) && button("Проверить синтаксис", "check", () => structure(false))}
        {json && button("Форматировать JSON", "wrap", () => structure(true))}
      </div>
      {notice && <output className="format-tool-status">{notice}</output>}
    </div>
  );
}
