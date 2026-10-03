import { type ReactNode, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileLaunch } from "./FileLaunch";
import { CompactFileActions, FileWorkspaceContext } from "./fileWorkspaceContext";
import { Icon } from "./icons";
import { PanelDivider } from "./PanelDivider";
import { useWorkspaceDialog } from "./useWorkspaceDialog";
import { ViewerEditButton } from "./ViewerEditButton";
import { HelpButton } from "./WorkspaceHelp";
import { useWindowDismiss } from "./windowMotion";
import "./file-viewer.css";
import "./workspace-window.css";

/** Shared file workspace. Format tools occupy the content rail; future conversions are file actions. */
export function FileViewerDialog({
  name,
  file,
  source,
  onClose,
  children,
  actions,
  draft = false,
  editProvided = false,
  navigation,
  editLabel,
  description,
}: {
  name: string;
  file?: File | null;
  source?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  draft?: boolean;
  editProvided?: boolean;
  navigation?: ReactNode;
  editLabel?: string;
  description?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [properties, setProperties] = useState(false),
    [expanded, setExpanded] = useState(false),
    [editing, setEditing] = useState(false),
    [contentStatus, setContentStatus] = useState(""),
    [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const closeGuard = useRef<((complete: () => void) => void) | null>(null);
  const workspace = useMemo(
    () => ({ editorHost, setEditing, setContentStatus, closeGuard }),
    [editorHost],
  );
  useWorkspaceDialog(dialog, true, "file-viewer");
  const dismiss = useWindowDismiss(dialog);
  const close = () =>
    closeGuard.current ? closeGuard.current(() => dismiss(onClose)) : dismiss(onClose);
  const format = (file?.name || name).split(".").at(-1)?.toUpperCase();
  return createPortal(
    <FileWorkspaceContext.Provider value={workspace}>
      <CompactFileActions.Provider value={false}>
        <dialog
          ref={dialog}
          className="file-viewer-dialog"
          data-help-context="files"
          data-expanded={expanded}
          aria-label="Просмотр файла"
          tabIndex={-1}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
        >
          <header className="file-viewer-heading">
            <span className="file-viewer-mark">
              <Icon name="file" />
            </span>
            <div>
              <strong title={name}>{name}</strong>
              <small>
                {description ?? (draft ? "Предпросмотр черновика" : "Просмотр файла")}
                {format && format.length < 10 ? " · " + format : ""}
              </small>
            </div>
            <div className="file-viewer-window-controls">
              <HelpButton topic="files" />
              <button
                type="button"
                className="icon-button"
                aria-label="Свойства файла"
                title="Свойства файла"
                aria-pressed={properties}
                onClick={() => setProperties(!properties)}
              >
                <Icon name="panel-right" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={expanded ? "Восстановить окно" : "Развернуть окно"}
                title={expanded ? "Восстановить окно" : "Развернуть окно"}
                onClick={() => setExpanded(!expanded)}
              >
                <Icon name="expand" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Закрыть просмотр"
                onClick={close}
              >
                <Icon name="close" />
              </button>
            </div>
          </header>
          <div className="file-workspace-rail">
            {navigation}
            <div className="file-viewer-actions">
              <CompactFileActions.Provider value={true}>
                {!draft && !editProvided && (
                  <ViewerEditButton name={name} source={source} file={file} label={editLabel} />
                )}
                {!draft && <FileLaunch name={name} source={source} />}
                {actions}
              </CompactFileActions.Provider>
            </div>
          </div>
          <div className="file-viewer-body" data-properties={properties}>
            {properties && (
              <PanelDivider
                target=".file-viewer-properties"
                peer=".file-viewer-content"
                storageKey="viewer-properties"
                label="Ширина свойств файла"
                min={180}
                max={420}
                trailing
              />
            )}
            <section className="file-viewer-content" aria-label="Содержимое файла">
              <div className="file-viewer-original" hidden={editing}>
                {children}
              </div>
              <div className="file-viewer-editor" ref={setEditorHost} hidden={!editing} />
            </section>
            {properties && (
              <aside className="file-viewer-properties" aria-label="Свойства">
                <strong>Свойства</strong>
                <dl>
                  <dt>Имя</dt>
                  <dd>{name}</dd>
                  <dt>Формат</dt>
                  <dd>{format || "Файл"}</dd>
                  {file && (
                    <>
                      <dt>Размер</dt>
                      <dd>
                        {new Intl.NumberFormat("ru", { maximumFractionDigits: 2 }).format(
                          file.size / 1024,
                        )}{" "}
                        КБ
                      </dd>
                    </>
                  )}
                  {source && (
                    <>
                      <dt>Источник</dt>
                      <dd>
                        {source.includes("version=index")
                          ? "Индекс Git"
                          : source.includes("/files/content?")
                            ? "Рабочая копия"
                            : "Сохранённый файл"}
                      </dd>
                    </>
                  )}
                </dl>
              </aside>
            )}
          </div>
          <footer className="file-viewer-footer">
            <span>
              {contentStatus ||
                (description ? "" : draft ? "Без сохранения в проект" : "Исходный файл")}
            </span>
            <span>{format && format.length < 10 ? format : ""}</span>
          </footer>
        </dialog>
      </CompactFileActions.Provider>
    </FileWorkspaceContext.Provider>,
    document.body,
  );
}
