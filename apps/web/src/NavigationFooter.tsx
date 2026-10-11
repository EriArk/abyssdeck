import type { NotebookScope } from "@codex-web/shared";
import { ClientPicker, type WorkspaceMode } from "./ClientPicker";
import { openDevices } from "./DeviceWorkspaceHost";
import { Icon } from "./icons";
import { QuickCaptureButton } from "./QuickCaptureHost";
export function NavigationFooter({
  client,
  onClient,
  onSettings,
  onRemote,
  captureScope,
  shared = false,
}: {
  client: WorkspaceMode;
  onClient?: (value: WorkspaceMode) => void;
  shared?: boolean;
  onSettings: () => void;
  onRemote?: () => void;
  captureScope: NotebookScope;
}) {
  return (
    <div className="navigation-system-row">
      <button
        type="button"
        className="nav-settings"
        onClick={onSettings}
        aria-label="Настройки"
        title="Настройки"
      >
        <Icon name="settings" size={19} />
        <span className="nav-settings-label">Настройки</span>
      </button>
      <div className="navigation-mode-controls">
        <QuickCaptureButton scope={captureScope} />
        <button
          type="button"
          className="icon-button"
          onClick={openDevices}
          aria-label="Открыть устройства"
          title="Устройства"
        >
          <Icon name="terminal" />
        </button>
        {onRemote && (
          <button
            type="button"
            className="icon-button nav-remote"
            onClick={onRemote}
            aria-label="Открыть Remote"
            title="Remote ПК"
          >
            <Icon name="remote" />
          </button>
        )}
        {onClient && <ClientPicker value={client} onChange={onClient} shared={shared} />}
      </div>
    </div>
  );
}
