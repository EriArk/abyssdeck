import { createContext, type ReactNode, useContext } from "react";
import { Icon } from "./icons";
import "./window-heading.css";

const Trail = createContext<string[]>([]);
export function WindowScope({ label, children }: { label: string; children: ReactNode }) {
  const parent = useContext(Trail);
  return <Trail.Provider value={[...parent, label]}>{children}</Trail.Provider>;
}
export function WindowHeading({
  title,
  context,
  onClose,
  closeLabel = "Закрыть",
  children,
}: {
  title: string;
  context?: string;
  onClose: () => void;
  closeLabel?: string;
  children?: ReactNode;
}) {
  const trail = useContext(Trail),
    parent = trail.slice(0, -1);
  return (
    <header className="panel-heading notebook-heading window-heading">
      {parent.length > 0 && (
        <button
          type="button"
          className="icon-button"
          aria-label={"Назад: " + parent.at(-1)}
          onClick={onClose}
        >
          <Icon name="back" />
        </button>
      )}
      <div className="window-heading-title">
        {!!parent.length && (
          <small className="window-trail" title={parent.join(" / ")}>
            {parent.join(" / ")}
          </small>
        )}
        <h2 title={title}>{title}</h2>
        {context && <small title={context}>{context}</small>}
      </div>
      <div className="window-heading-controls">
        {children}
        <button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
    </header>
  );
}
