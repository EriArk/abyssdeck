import { Icon } from "./icons";

export function ActivityBadge({
  active = 0,
  unread = 0,
  waiting = 0,
  failed,
  counts = false,
}: {
  active?: number;
  unread?: number;
  waiting?: number;
  failed?: boolean;
  counts?: boolean;
}) {
  // Aggregated/untyped unread counts do not establish a successful outcome.
  const unreadLabel =
    failed === true
      ? "Требует проверки"
      : failed === false
        ? "Завершено, не просмотрено"
        : "Непросмотренные итоги";
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
          <Icon name={failed === true ? "help" : failed === false ? "check" : "inbox"} size={16} />
          {counts && <b>{unread}</b>}
        </span>
      )}
    </span>
  );
}
