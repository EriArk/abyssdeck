import { Icon } from "./icons";

export function ActivityBadge({
  active = 0,
  unread = 0,
  waiting = 0,
  failed = false,
  aggregate = false,
  counts = false,
}: {
  active?: number;
  unread?: number;
  waiting?: number;
  failed?: boolean;
  aggregate?: boolean;
  counts?: boolean;
}) {
  // One active chat cannot simultaneously advertise its previous completion.
  // Project/section totals may represent different visible chats.
  if (active > 0 && !aggregate) unread = 0;
  const unreadLabel = failed ? "Требует проверки" : "Завершено, не просмотрено";
  return (
    <span className="activity-badges">
      {(active > 0 || counts) && (
        <span
          className={`activity-badge ${active ? "is-active" : "is-empty"}`}
          role="img"
          aria-label={`Активно: ${active}${waiting ? `, ждут ответа: ${waiting}` : ""}`}
          title={`Активно: ${active}${waiting ? ` · ждут ответа: ${waiting}` : ""}`}
        >
          {active > waiting ? (
            <span className="spinner" />
          ) : waiting ? (
            <Icon name="help" size={15} />
          ) : (
            <Icon name="activity" size={14} />
          )}
          {counts && <b>{active}</b>}
        </span>
      )}
      {(unread > 0 || counts) && (
        <span
          className={`activity-badge ${unread ? "is-unread" : "is-empty"} ${failed ? "needs-attention" : ""}`}
          role="img"
          aria-label={`${unreadLabel}: ${unread}`}
          title={`${unreadLabel}: ${unread}`}
        >
          <Icon name={failed ? "help" : "check"} size={16} />
          {counts && <b>{unread}</b>}
        </span>
      )}
    </span>
  );
}
