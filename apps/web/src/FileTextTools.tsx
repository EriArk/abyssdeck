import { type RefObject, useState } from "react";
import type { FileEditorEngine } from "./fileEditorEngine";
import { Icon } from "./icons";
import { formatJson, type MarkdownAction, markdownChange } from "./textFormatOperations";
import "./file-format-tools.css";

export function FileTextTools({
  editor,
  path,
  disabled,
}: {
  editor: RefObject<FileEditorEngine | null>;
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
    const { from, to } = view.selection();
    const change = markdownChange(view.text(), from, to, action);
    view.change(change);
    view.focus();
    setNotice("");
  };
  const structure = (format: boolean) => {
    const view = editor.current;
    if (!view) return;
    try {
      const text = view.text();
      let next = text;
      if (json) next = formatJson(text, /\.(jsonl|ndjson)$/i.test(path));
      else if (
        new DOMParser().parseFromString(text, "application/xml").querySelector("parsererror")
      )
        throw Error("Некорректный XML.");
      if (format && next !== text) view.change({ from: 0, to: view.text().length, insert: next });
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
          editor.current?.command("line");
        })}
        {button("Свернуть блоки", "fold", () => {
          editor.current?.command("fold");
        })}
        {button("Развернуть блоки", "unfold", () => {
          editor.current?.command("unfold");
        })}
        {!markdown &&
          button("К парной скобке", "code", () => {
            if (editor.current) {
              editor.current.command("bracket");
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
