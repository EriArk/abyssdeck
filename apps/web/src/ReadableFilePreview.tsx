import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "./CopyButton";
import { SpeechButton, useSpeechScope } from "./MessageSpeech";

export function ReadableFilePreview({ file }: { file: File }) {
  const [loaded, setLoaded] = useState<{ file: File; text: string; readable: boolean }>(),
    [wrap, setWrap] = useState(true),
    [raw, setRaw] = useState(false);
  const markdown = /\.(md|markdown)$/i.test(file.name);
  const scope = useMemo(() => "file-preview:" + crypto.randomUUID(), [file]);
  useSpeechScope(scope, true);
  const current = loaded?.file === file ? loaded : undefined;
  const text = current?.text ?? "";
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
      <fieldset className="file-view-tools file-text-tools" aria-label="Вид текста">
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
              id={scope + ":text"}
              text={text}
              format={markdown ? "markdown" : "text"}
              idleLabel="Озвучить текст"
            />
          )}
          <CopyButton text={text} label="Копировать показанный текст" />
        </div>
      </fieldset>
      {markdown && !raw && text.length <= 32768 ? (
        <div className="file-document">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            disallowedElements={["img"]}
            components={{ a: ({ children }) => <span>{children}</span> }}
          >
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <pre className="file-text" data-wrap={wrap}>
          {text}
        </pre>
      )}
      {file.size > 65536 && (
        <small>Показано начало файла · исходный файл доступен для скачивания</small>
      )}
    </div>
  );
}
