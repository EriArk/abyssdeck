import { useEffect, useState } from "react";
import { BookReader } from "./BookReader";
import { type ReadingDocument, readingDocument } from "./bookReader/document";
import { ReadableFilePreview } from "./ReadableFilePreview";

export default function ReaderFilePreview({ file }: { file: File }) {
  const [loaded, setLoaded] = useState<{
    file: File;
    document?: ReadingDocument;
    error?: string;
  }>();
  const [source, setSource] = useState(false);
  useEffect(() => {
    let live = true;
    setSource(false);
    void readingDocument(file)
      .then((document) => {
        if (live) setLoaded({ file, document });
      })
      .catch((error) => {
        if (live) setLoaded({ file, error: error.message || "Не удалось прочитать документ." });
      });
    return () => {
      live = false;
    };
  }, [file]);
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
        <BookReader document={current.document} />
      ) : (
        <p role="status">
          <span className="spinner" /> Загружаю полный текст…
        </p>
      )}
    </div>
  );
}
