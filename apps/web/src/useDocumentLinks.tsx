import { useEffect, useMemo, useRef, useState } from "react";
import { type DocumentFile, documentResolver, externalDocumentLink } from "./documentReferences";
import { ResultFilePreview } from "./ResultFilePreview";

/** Shared exact-source navigation for paginated readers and compact previews. */
export function useDocumentLinks(file: File, source?: string) {
  const generation = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Cache belongs to exact document bytes and source together.
  const resolve = useMemo(() => documentResolver(source), [source, file]);
  const [opened, setOpened] = useState<DocumentFile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Invalidate every pending navigation on source replacement.
  useEffect(() => {
    generation.current++;
    setBusy(false);
    setOpened(null);
    setError("");
    return () => {
      generation.current++;
    };
  }, [resolve]);
  const open = (href: string) => {
    if (externalDocumentLink(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    const ticket = generation.current;
    void resolve(href)
      .then((value) => {
        if (ticket === generation.current) setOpened(value);
      })
      .catch((e) => {
        if (ticket === generation.current) setError(e.message);
      })
      .finally(() => {
        if (ticket === generation.current) setBusy(false);
      });
  };
  const viewer = (
    <>
      {busy && (
        <p role="status">
          <span className="spinner" /> Открываю файл по ссылке…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
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
    </>
  );
  return { resolve, open, viewer };
}
