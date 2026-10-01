import { useEffect, useState } from "react";
import { api, messageOf } from "./api";
import PdfFilePreview from "./PdfFilePreview";

export default function DocxFilePreview({ file }: { file: File }) {
  const [result, setResult] = useState<{ source: File; pdf: File } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setResult(null);
    const stop = () => {
      controller.abort();
      setResult(null);
    };
    window.addEventListener("private-session-ended", stop);
    void api<{ pdf: string }>("/previews/docx", {
      method: "POST",
      raw: file,
      signal: controller.signal,
      timeoutMs: 85000,
    })
      .then(({ pdf }) => {
        if (controller.signal.aborted) return;
        if (typeof pdf !== "string" || pdf.length > 45 * 1024 * 1024)
          throw Error("Не удалось прочитать страницы документа.");
        const bytes = Uint8Array.from(atob(pdf), (char) => char.charCodeAt(0));
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
          throw Error("Не удалось прочитать страницы документа.");
        setResult({
          source: file,
          pdf: new File([bytes], file.name + ".pdf", { type: "application/pdf" }),
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(messageOf(error));
      });
    return () => {
      stop();
      window.removeEventListener("private-session-ended", stop);
    };
  }, [file]);
  if (error)
    return (
      <p className="file-preview-fallback" role="status">
        {error}
      </p>
    );
  if (!result || result.source !== file)
    return (
      <p role="status">
        <span className="spinner" /> Подготавливаю страницы DOCX…
      </p>
    );
  return <PdfFilePreview key={file.name + file.lastModified} file={result.pdf} />;
}
