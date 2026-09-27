import type { HumanConversation, HumanGroupInvitation, TeamContact } from "@codex-web/shared";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pageWorkspace } from "./accountStorage";
import { api, messageOf } from "./api";
import { Icon } from "./icons";
import { durableKey } from "./ResultSharing";
import { TeamContactPicker } from "./TeamContactPicker";
import { useWorkspaceDialog } from "./useWorkspaceDialog";

export function GroupInvitations({
  items,
  refresh,
  select,
}: {
  items: HumanGroupInvitation[];
  refresh: () => Promise<void>;
  select: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const gate = useRef(false);
  async function answer(item: HumanGroupInvitation, accept: boolean) {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    const body = { accept },
      request = durableKey("group-invitation", { id: item.id, ...body });
    try {
      await api(`/team/conversation-invitations/${item.id}`, {
        method: "POST",
        body,
        key: request.key,
      });
      request.clear();
      await refresh();
      if (accept) select(item.conversationId);
    } catch (e) {
      setError(messageOf(e));
      await refresh();
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="group-invitations" aria-label="Приглашения в группы">
      {items.map((item) => (
        <article className="group-invitation" key={item.id}>
          <strong>{item.title}</strong>
          <small>Приглашает {item.ownerName}</small>
          <p>После вступления доступна вся переписка и материалы группы.</p>
          <div className="group-action-pair">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void answer(item, false)}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void answer(item, true)}
            >
              Вступить
            </button>
          </div>
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function ConversationMembers({
  conversation: c,
  refresh,
  onClose,
  onLeft,
}: {
  conversation: HumanConversation;
  refresh: () => Promise<void>;
  onClose: () => void;
  onLeft: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    gate = useRef(false);
  useWorkspaceDialog(ref);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [adding, setAdding] = useState(false),
    [contact, setContact] = useState<TeamContact | null>(null);
  const owner = c.kind === "group" && c.ownerId === pageWorkspace;
  const invitations = c.invitations ?? [];
  async function act(action: "invite" | "remove" | "transfer" | "revoke", userId: string) {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    const body = { action, userId, version: c.membersVersion ?? 0 },
      request = durableKey("group-members", { id: c.id, ...body });
    try {
      await api(`/team/conversations/${c.id}/members`, { method: "POST", body, key: request.key });
      request.clear();
      setContact(null);
      setAdding(false);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      await refresh();
      gate.current = false;
      setBusy(false);
    }
  }
  async function preference(leave: boolean) {
    if (gate.current) return;
    if (
      leave &&
      !window.confirm("Покинуть разговор? Доступ к сообщениям и материалам будет закрыт.")
    )
      return;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        `/team/conversations/${c.id}`,
        leave ? { method: "DELETE" } : { method: "PUT", body: { muted: !c.muted } },
      );
      await refresh();
      if (leave) onLeft();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={ref}
      className="workspace-window conversation-members-window"
      aria-label="Настройки разговора"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="notebook-heading">
        <div>
          <strong>Настройки разговора</strong>
          <small title={c.title}>{c.title}</small>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть настройки разговора"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="conversation-members-body">
        <section aria-label="Участники группы">
          <div className="group-section-heading">
            <strong>Участники · {c.members.length}</strong>
            {owner && (
              <button
                type="button"
                className="icon-button"
                aria-label="Пригласить участника"
                aria-expanded={adding}
                disabled={busy || c.members.length + invitations.length >= 8}
                onClick={() => setAdding(!adding)}
              >
                <Icon name="plus" />
              </button>
            )}
          </div>
          {adding && owner && (
            <div className="group-add-member">
              <TeamContactPicker
                value={contact}
                disabled={busy}
                exclude={[...c.members.map((m) => m.id), ...invitations.map((i) => i.userId)]}
                onChange={setContact}
              />
              <p>
                Новый участник получит доступ ко всей переписке и материалам после принятия
                приглашения.
              </p>
              <button
                type="button"
                className="primary"
                disabled={busy || !contact}
                onClick={() => contact && void act("invite", contact.id)}
              >
                Отправить приглашение
              </button>
            </div>
          )}
          <ul className="group-member-list">
            {c.members.map((m) => (
              <li key={m.id}>
                <div className="group-member-name">
                  <strong>{m.name}</strong>
                  <small>
                    {c.kind === "group" && m.id === c.ownerId
                      ? "Владелец"
                      : m.id === pageWorkspace
                        ? "Вы"
                        : "Участник"}
                  </small>
                </div>
                {owner && m.id !== pageWorkspace && (
                  <div className="group-member-controls">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Передать группу: ${m.name}`}
                      title="Передать группу"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Передать группу ${m.name}? Ты останешься участником. Ожидающие приглашения будут отозваны.`,
                          )
                        )
                          void act("transfer", m.id);
                      }}
                    >
                      <Icon name="key" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Удалить участника: ${m.name}`}
                      title="Удалить участника"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Удалить ${m.name} из группы? Доступ к переписке и материалам будет закрыт.`,
                          )
                        )
                          void act("remove", m.id);
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
        {owner && invitations.length > 0 && (
          <section aria-label="Ожидающие приглашения">
            <strong>Ожидают ответа</strong>
            <ul className="group-member-list">
              {invitations.map((i) => (
                <li key={i.id}>
                  <div className="group-member-name">
                    <strong>{i.name}</strong>
                    <small>Приглашение отправлено</small>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Отозвать приглашение: ${i.name}`}
                    title="Отозвать приглашение"
                    onClick={() => void act("revoke", i.userId)}
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="group-personal-settings" aria-label="Личные настройки">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            aria-pressed={c.muted}
            onClick={() => void preference(false)}
          >
            {c.muted ? "Включить уведомления" : "Без уведомлений"}
          </button>
          {owner && c.members.length > 1 && (
            <p>Чтобы выйти, сначала передай группу участнику кнопкой с ключом.</p>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy || (owner && c.members.length > 1)}
            onClick={() => void preference(true)}
          >
            Покинуть разговор
          </button>
        </section>
        {error && <p role="alert">{error}</p>}
      </div>
    </dialog>,
    document.body,
  );
}
