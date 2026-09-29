import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "./CopyButton";
import { SpeechButton, useSpeechScope } from "./MessageSpeech";
import { visibleFileSpeech } from "./fileSpeechPosition";

const markdownComponents: Components = { a: ({ children }) => <span>{children}</span> };

export function ReadableFilePreview({ file }: { file: File }) {
  const [loaded, setLoaded] = useState<{ file: File; text: string; readable: boolean }>(),
    [wrap, setWrap] = useState(true),
    [raw, setRaw] = useState(false);
  const markdown = /\.(md|markdown)$/i.test(file.name);
  const scope = useMemo(() => "file-preview:" + crypto.randomUUID(), [file]);
  useSpeechScope(scope, true);
  const current = loaded?.file === file ? loaded : undefined;
  const text = current?.text ?? "";
  const content = useRef<HTMLDivElement & HTMLPreElement>(null);
  const toolbar = useRef<HTMLFieldSetElement>(null);
  const rendered = markdown && !raw && text.length <= 32768;
  // Changing representation invalidates DOM ranges held by the current reading session.
  const readingScope = scope + (rendered ? ":document" : ":source");
  useSpeechScope(readingScope, true);
  useEffect(() => {
    let live = true;
    void file
      .slice(0, 65536)
      .text()
      .then((value) => {
        if (live)
          setLoaded({
            file,
            text: value.includes("\0") ? "Этот файл содержит двоичные данные." : value,
            readable: !value.includes("\0"),
          });
      })
      .catch(() => {
        if (live) setLoaded({ file, text: "Не удалось прочитать файл.", readable: false });
      });
    return () => {
      live = false;
    };
  }, [file]);
  return (
    <div className="readable-file">
      <fieldset ref={toolbar} className="file-view-tools file-text-tools" aria-label="Вид текста">
        <div className="file-text-options">
          <button
            type="button"
            className="secondary"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            Перенос строк
          </button>
          {markdown && (
            <button
              type="button"
              className="secondary"
              aria-pressed={raw}
              onClick={() => setRaw(!raw)}
            >
              Исходный текст
            </button>
          )}
        </div>
        <div className="file-text-actions">
          {current?.readable && (
            <SpeechButton
              id={readingScope + ":text"}
              text={text}
              format={markdown ? "markdown" : "text"}
              idleLabel="Озвучить текст"
              prepare={() =>
                content.current && toolbar.current
                  ? visibleFileSpeech(content.current, toolbar.current, rendered)
                  : undefined
              }
            />
          )}
          <CopyButton text={text} label="Копировать показанный текст" />
        </div>
      </fieldset>
      {rendered ? (
        <div ref={content} className="file-document">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            disallowedElements={["img"]}
            components={markdownComponents}
          >
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <pre ref={content} className="file-text" data-wrap={wrap}>
          {text}
        </pre>
      )}
      {file.size > 65536 && (
        <small>Показано начало файла · исходный файл доступен для скачивания</small>
      )}
    </div>
  );
}
