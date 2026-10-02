import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./icons";

/** Compact file command with an accessible name and a touch-sized hit target. */
export function FileActionKey({
  label,
  icon,
  count,
  compact = true,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: string;
  count?: number;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      title={label}
      aria-label={label}
      className={`${compact ? "icon-button file-command-key" : "secondary"} ${className}`}
    >
      <Icon name={icon} size={19} />
      <span className={compact ? "file-action-label" : undefined}>{label}</span>
      {!!count && (
        <small className={compact ? "file-command-count" : undefined} aria-hidden="true">
          {compact ? count : ` · ${count}`}
        </small>
      )}
    </button>
  );
}
