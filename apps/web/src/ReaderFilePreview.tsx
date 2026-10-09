import { useEffect, useMemo, useRef, useState } from "react";
import { BookReader } from "./BookReader";
import { type ReadingDocument, readingDocument } from "./bookReader/document";
import { type DocumentFile, documentResolver, externalDocumentLink } from "./documentReferences";
import { ReadableFilePreview } from "./ReadableFilePreview";
import { ResultFilePreview } from "./ResultFilePreview";

export default function ReaderFilePreview({
  file,
  source: origin,
}: {
  file: File;
  source?: string;
}) {
  const generation = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Cached linked files belong to these exact document bytes.
  const resolve = useMemo(() => documentResolver(origin), [origin, file]);
  const [opened, setOpened] = useState<DocumentFile | null>(null);
  const [linkError, setLinkError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [loaded, setLoaded] = useState<{
    file: File;
    document?: ReadingDocument;
    error?: string;
  }>();
  const [source, setSource] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing the exact source invalidates pending links even when document bytes are unchanged.
  useEffect(() => {
    let live = true;
    generation.current++;
    setLinkBusy(false);
    setSource(false);
    setOpened(null);
    setLinkError("");
    void readingDocument(file)
      .then((document) => {
        if (live) setLoaded({ file, document });
      })
      .catch((error) => {
        if (live) setLoaded({ file, error: error.message || "Не удалось прочитать документ." });
      });
    return () => {
      live = false;
      generation.current++;
    };
  }, [file, resolve]);
  const current = loaded?.file === file ? loaded : undefined;
  return (
    <div className="reader-file-preview">
      {!/\.(epub|fb2)$/i.test(file.name) && (
        <div className="reader-file-mode">
          <button
            type="button"
            className="secondary"
            aria-pressed={!source}
            onClick={() => setSource(false)}
          >
            Читать
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={source}
            onClick={() => setSource(true)}
          >
            Исходный текст
          </button>
        </div>
      )}
      {source ? (
        <ReadableFilePreview file={file} initialRaw />
      ) : current?.error ? (
        <p role="status">{current.error}</p>
      ) : current?.document ? (
        <BookReader
          document={current.document}
          resolveImage={resolve}
          onOpenLink={(href) => {
            if (externalDocumentLink(href)) {
              window.open(href, "_blank", "noopener,noreferrer");
              return;
            }
            if (linkBusy) return;
            setLinkBusy(true);
            setLinkError("");
            const ticket = generation.current;
            void resolve(href)
              .then((value) => {
                if (ticket === generation.current) setOpened(value);
              })
              .catch((e) => {
                if (ticket === generation.current) setLinkError(e.message);
              })
              .finally(() => {
                if (ticket === generation.current) setLinkBusy(false);
              });
          }}
        />
      ) : (
        <p role="status">
          <span className="spinner" /> Загружаю полный текст…
        </p>
      )}
      {linkBusy && (
        <p role="status">
          <span className="spinner" /> Открываю файл по ссылке…
        </p>
      )}
      {linkError && <p role="alert">{linkError}</p>}
      {opened && (
        <ResultFilePreview
          result={{
            id: opened.url,
            threadId: "",
            turnId: null,
            type: "artifact",
            title: opened.name,
            payload: { url: opened.url, mime: opened.mime },
            createdAt: "",
          }}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}
