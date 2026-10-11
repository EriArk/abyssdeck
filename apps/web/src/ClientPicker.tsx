import { Icon } from "./icons";
import "./clientPicker.css";
export type WorkspaceMode = "codex" | "gpt" | "spaces";
export const nextWorkspaceMode = (value: WorkspaceMode, shared: boolean): WorkspaceMode =>
  value === "codex" ? "gpt" : value === "gpt" && shared ? "spaces" : "codex";
const labels = { codex: "Codex", gpt: "GPT", spaces: "Общие проекты" };
export function ClientPicker({
  value,
  onChange,
  shared = false,
}: {
  value: WorkspaceMode;
  onChange: (value: WorkspaceMode) => void;
  shared?: boolean;
}) {
  const next = nextWorkspaceMode(value, shared);
  return (
    <button
      type="button"
      className="client-picker"
      data-client={value}
      aria-label={`Переключиться на ${labels[next]}`}
      title={`${labels[value]} → ${labels[next]}`}
      onClick={() => onChange(next)}
    >
      <Icon
        name={value === "spaces" ? "people" : value === "gpt" ? "chat" : "repository"}
        size={27}
      />
    </button>
  );
}
