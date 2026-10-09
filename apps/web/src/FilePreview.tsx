import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { workspaceMediaUrl } from "./accountStorage.ts";
import { api } from "./api";
import { CopyButton } from "./CopyButton";
import { previewKind, technicalFormat } from "./filePreviewRegistry";
import { ReadableFilePreview } from "./ReadableFilePreview";
import VectorPreview, { ImageViewport } from "./VectorFilePreview";

export { previewKind } from "./filePreviewRegistry";

const ModelPreview = lazy(() => import("./ModelFilePreview"));
const DxfPreview = lazy(() => import("./DxfFilePreview"));
const ImageMarkup = lazy(() => import("./ImageMarkup"));
const MediaPreview = lazy(() => import("./MediaFilePreview"));

const DelimitedPreview = lazy(() => import("./DelimitedTable"));
const PdfPreview = lazy(() => import("./PdfFilePreview"));
const DocxPreview = lazy(() => import("./DocxFilePreview"));
const PackagePreview = lazy(() => import("./PackageFilePreview"));
const ReaderPreview = lazy(() => import("./ReaderFilePreview"));
function FileCard({ file }: { file: File }) {
  const type = file.name.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toUpperCase() || "Файл";
  return (
    <div className="file-type-card">
      <strong>{type}</strong>
      <span>
        {new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(file.size / 1024)} КБ
      </span>
    </div>
  );
}
class PreviewBoundary extends Component<{ children: ReactNode; file: File }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <FileCard file={this.props.file} /> : this.props.children;
  }
}
function TextOrHtml({ file, html }: { file: File; html: boolean }) {
  const [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let resource = "";
    void (async () => {
      const value = await file.slice(0, html ? 262144 : 65536).text();
      if (controller.signal.aborted) return;
      if (value.includes(String.fromCharCode(0))) throw Error("binary");
      if (!html) {
        setText(value);
        return;
      }
      const data = await api<{ url: string }>("/previews/file", {
        method: "POST",
        body: { html: value },
        timeoutMs: 15000,
      });
      if (!/^\/api\/previews\/file\/[0-9a-f-]{36}$/.test(data.url)) throw Error("invalid frame");
      resource = data.url;
      if (controller.signal.aborted) {
        void api(resource.slice(4), { method: "DELETE" }).catch(() => {});
        return;
      }
      setUrl(resource);
    })().catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      if (resource) void api(resource.slice(4), { method: "DELETE" }).catch(() => {});
    };
  }, [file, html]);
  if (failed) return <FileCard file={file} />;
  if (html)
    return url ? (
      <iframe
        className="file-html"
        title={"Предпросмотр " + file.name}
        src={workspaceMediaUrl(url)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
      />
    ) : (
      <p role="status">
        <span className="spinner" /> Загружаю предпросмотр…
      </p>
    );
  return (
    <>
      <CopyButton text={text} label="Копировать показанный текст" />
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded text pane must support keyboard scrolling. */}
      <pre className="file-text" tabIndex={0}>
        {text}
      </pre>
      {file.size > 65536 && <small>Показано начало файла</small>}
    </>
  );
}
export function FilePreview({
  file,
  objectUrl,
  source,
  full = false,
  toolbarTarget,
}: {
  file: File;
  objectUrl: string;
  source?: string;
  full?: boolean;
  toolbarTarget?: HTMLElement | null;
}) {
  const kind = previewKind(file),
    [badImage, setBadImage] = useState(false);
  return (
    <PreviewBoundary file={file}>
      <div className="file-preview" data-kind={kind}>
        {kind === "package" &&
        (/\.docx$/i.test(file.name) ||
          file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document") ? (
          <Suspense fallback={<p role="status">Открываю документ…</p>}>
            <DocxPreview file={file} />
          </Suspense>
        ) : kind === "package" ? (
          <Suspense fallback={<p role="status">Открываю файл…</p>}>
            <PackagePreview key={objectUrl} file={file} source={source} full={full} />
          </Suspense>
        ) : kind === "image" && full ? (
          <Suspense fallback={<ImageViewport url={objectUrl} name={file.name} />}>
            <ImageMarkup key={objectUrl} file={file} url={objectUrl} source={source} />
          </Suspense>
        ) : kind === "technical" ? (
          <Suspense fallback={<p role="status">Открываю просмотрщик…</p>}>
            {technicalFormat(file) === "svg" ? (
              <VectorPreview file={file} />
            ) : technicalFormat(file) === "dxf" ? (
              <DxfPreview file={file} />
            ) : (
              <ModelPreview file={file} source={source} />
            )}
          </Suspense>
        ) : kind === "audio" || kind === "video" ? (
          <Suspense fallback={<p role="status">Открываю проигрыватель…</p>}>
            <MediaPreview key={objectUrl} file={file} video={kind === "video"} />
          </Suspense>
        ) : kind === "image" ? (
          badImage ? (
            <FileCard file={file} />
          ) : (
            <img
              className="download-image"
              src={objectUrl}
              alt={file.name}
              onError={() => setBadImage(true)}
            />
          )
        ) : kind === "pdf" ? (
          <Suspense
            fallback={
              <p role="status">
                <span className="spinner" /> Загружаю предпросмотр…
              </p>
            }
          >
            <PdfPreview key={objectUrl} file={file} source={source} annotate={full} />
          </Suspense>
        ) : kind === "text" && full && /\.(csv|tsv)$/i.test(file.name) ? (
          <Suspense fallback={<p role="status">Открываю таблицу…</p>}>
            <DelimitedPreview key={objectUrl} file={file} />
          </Suspense>
        ) : kind === "book" || (kind === "text" && full) ? (
          <Suspense
            fallback={
              <p role="status">
                <span className="spinner" /> Открываю читалку…
              </p>
            }
          >
            <ReaderPreview file={file} source={source} />
          </Suspense>
        ) : kind === "text" ? (
          <ReadableFilePreview file={file} source={source} toolbarTarget={toolbarTarget} />
        ) : kind === "html" ? (
          <TextOrHtml file={file} html={kind === "html"} />
        ) : (
          <FileCard file={file} />
        )}
      </div>
    </PreviewBoundary>
  );
}
