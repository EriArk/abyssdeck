import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "./icons";
import { PanelDivider } from "./PanelDivider";
import { HelpButton } from "./WorkspaceHelp";
import "./settings-sections.css";

export type SettingsPage = {
  id: string;
  title: string;
  hint?: string;
  parent?: string;
  icon?: ComponentProps<typeof Icon>["name"];
  keywords?: string;
  admin?: boolean;
  render: (visible: boolean, go: (id: string) => void) => ReactNode;
};
export function SettingsLink({
  title,
  hint,
  onClick,
  icon = "chevron",
}: {
  title: string;
  hint?: string;
  onClick: () => void;
  icon?: ComponentProps<typeof Icon>["name"];
}) {
  return (
    <button type="button" className="settings-link" onClick={onClick}>
      <span>
        <strong>{title}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <Icon name={icon} />
    </button>
  );
}

/** Mount on first visit, retain forms/scroll afterwards; only the visible page may read. */
export function SettingsSections({
  open,
  onClose,
  pages,
  overview,
}: {
  open: boolean;
  onClose: () => void;
  pages: SettingsPage[];
  overview?: (visible: boolean, go: (id: string) => void) => ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [compact, setCompact] = useState(true),
    [visited, setVisited] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null),
    nav = useRef<HTMLElement>(null),
    input = useRef<HTMLInputElement>(null),
    history = useRef<(string | null)[]>([]),
    prefix = useId();
  const active = pages.find((p) => p.id === selected) ?? pages[0];
  const detail = selected !== null || search;
  const visible = open && (!compact || detail) && !search;
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth) setCompact(el.clientWidth < 640);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (visible && active && !visited.includes(active.id)) setVisited((v) => [...v, active.id]);
  }, [visible, active, visited]);
  useEffect(() => {
    if (selected && !pages.some((p) => p.id === selected)) {
      setSelected(null);
      history.current = [];
    }
  }, [selected, pages]);
  useLayoutEffect(() => {
    if (!open) return;
    if (search) input.current?.focus({ preventScroll: true });
    else if (selected) content.current?.focus({ preventScroll: true });
    else nav.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [selected, search, open]);
  const go = (id: string) => {
    if (!pages.some((p) => p.id === id)) return;
    history.current = [...history.current, selected].slice(-30);
    setSelected(id);
    setSearch(false);
  };
  const back = () => {
    if (search) {
      setSearch(false);
      return;
    }
    setSelected(history.current.length ? history.current.pop()! : (active?.parent ?? null));
  };
  const ancestry = (page: SettingsPage) => {
    const chain = [page];
    let next = page;
    while (next.parent) {
      const parent = pages.find((p) => p.id === next.parent);
      if (!parent || chain.includes(parent)) break;
      chain.unshift(parent);
      next = parent;
    }
    return chain;
  };
  const normalized = query.trim().toLocaleLowerCase("ru");
  const matches = pages.filter((p) =>
    `${p.title} ${p.hint ?? ""} ${p.keywords ?? ""}`.toLocaleLowerCase("ru").includes(normalized),
  );
  return (
    <div
      ref={root}
      className="settings-sections"
      data-help-context="home"
      data-detail={detail}
      data-compact={compact}
    >
      <div className="dialog-heading settings-heading">
        <h2>Настройки</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Найти настройку"
          aria-expanded={search}
          onClick={() => setSearch((v) => !v)}
        >
          <Icon name="search" />
        </button>
        <HelpButton />
        <button
          type="button"
          className="icon-button panel-close"
          onClick={onClose}
          aria-label="Закрыть настройки"
        >
          <Icon name="close" />
        </button>
      </div>
      {search && (
        <div className="settings-search">
          <input
            ref={input}
            type="search"
            aria-label="Поиск по настройкам"
            placeholder="Тема, пароль, лимиты…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setSearch(false);
              }
            }}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть поиск настроек"
            onClick={() => setSearch(false)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      <div className="settings-layout">
        <PanelDivider
          target=".settings-overview"
          peer=".settings-content"
          storageKey="settings"
          label="Ширина категорий настроек"
          min={180}
          max={300}
        />
        <div className="settings-overview">
          {overview?.(open && !detail, go)}
          <nav ref={nav} className="settings-categories" aria-label="Категории настроек">
            {pages
              .filter((p) => !p.parent)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-category={p.id}
                  data-admin={p.admin || undefined}
                  aria-current={
                    !search && active && ancestry(active)[0]?.id === p.id ? "page" : undefined
                  }
                  onClick={() => go(p.id)}
                >
                  <Icon name={p.icon ?? "settings"} />
                  <span>
                    <strong>{p.title}</strong>
                    {p.admin && <small>Администрирование</small>}
                  </span>
                </button>
              ))}
          </nav>
        </div>
        <div ref={content} className="settings-content" tabIndex={-1}>
          <div className="settings-path">
            <button
              type="button"
              className="icon-button"
              aria-label={
                active?.parent || search ? "Назад в настройках" : "Все категории настроек"
              }
              onClick={back}
            >
              <Icon name="back" />
            </button>
            <span>
              {search
                ? "Поиск по всем настройкам"
                : (pages.find((p) => p.id === active?.parent)?.title ?? "Настройки")}
            </span>
          </div>
          {search && (
            <section className="settings-section settings-search-results">
              <h3>Найти настройку</h3>
              {normalized ? (
                <>
                  <p className="small muted" role="status">
                    Найдено: {matches.length}
                  </p>
                  {matches.map((p) => (
                    <SettingsLink
                      key={p.id}
                      title={p.title}
                      hint={ancestry(p)
                        .map((a) => a.title)
                        .join(" → ")}
                      onClick={() => go(p.id)}
                    />
                  ))}
                </>
              ) : (
                <p className="muted">Введи название настройки или действия.</p>
              )}
            </section>
          )}
          {pages
            .filter((p) => visited.includes(p.id) || (visible && active?.id === p.id))
            .map((p) => (
              <section
                key={p.id}
                id={prefix + p.id}
                className="settings-section"
                data-page={p.id}
                hidden={search || active?.id !== p.id}
                aria-labelledby={prefix + p.id + "-title"}
              >
                <h3 id={prefix + p.id + "-title"} className="settings-section-title">
                  {p.title}
                </h3>
                {p.hint && <p className="settings-page-hint">{p.hint}</p>}
                {p.render(visible && active?.id === p.id, go)}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
