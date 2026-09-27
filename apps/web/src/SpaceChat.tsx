import type {
  CollaborationSpace,
  SpaceChatFile,
  SpaceChatMessage,
  SpaceChatPage,
} from "@codex-web/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AutoTextarea } from "./AutoTextarea";
import { pageWorkspace, accountLocalStorage as storage, workspaceUrl } from "./accountStorage";
import { ApiError, api, messageOf } from "./api";
import { ConversationSearch } from "./ConversationSearch";
import { DownloadLink } from "./DownloadLink";
import { HumanReferenceLink, HumanReferencePicker } from "./HumanReferences";
import { Icon } from "./icons";
import { ResultShareButton, SharedResult } from "./ResultSharing";
import type { SpacesController } from "./useCollaborationSpaces";
import "./space-chat.css";

type Draft = {
  text: string;
  files: SpaceChatFile[];
  key: string;
  mentions?: { id: string; name: string }[];
};
const blank = (): Draft => ({ text: "", files: [], key: crypto.randomUUID() });
function loadDraft(name: string): Draft {
  try {
    const d = JSON.parse(storage.getItem(name) ?? "null");
    if (
      d &&
      typeof d.text === "string" &&
      d.text.length <= 16000 &&
      Array.isArray(d.files) &&
      d.files.length <= 8 &&
      typeof d.key === "string"
    )
      return d;
  } catch {}
  return blank();
}
export function SpaceChat({
  space,
  spaces,
  endpoint,
  visible = true,
  readOnly = false,
  compactComposer = false,
  onFile,
  members,
  focus,
  attention,
}: {
  space: Pick<CollaborationSpace, "id">;
  spaces: Pick<SpacesController, "open" | "refresh">;
  endpoint?: string;
  visible?: boolean;
  readOnly?: boolean;
  compactComposer?: boolean;
  onFile?: (file: SpaceChatFile) => void;
  members?: { id: string; name: string }[];
  focus?: { seq: number; token: string };
  attention?: {
    firstUnreadSeq?: number | null;
    mentionSeq?: number | null;
    unread: number;
    unreadMentions?: number;
  };
}) {
  const path = endpoint ?? `/team/spaces/${space.id}/chat`,
    draftName = `space-chat-draft:${endpoint ?? space.id}`;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [draft, setDraft] = useState(() => loadDraft(draftName)),
    draftRef = useRef(draft);
  const [messages, setMessages] = useState<SpaceChatMessage[]>([]);
  const [ready, setReady] = useState(false),
    [older, setOlder] = useState(false);
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searching, setSearching] = useState(false),
    [context, setContext] = useState(false),
    [moreLater, setMoreLater] = useState(false),
    [locating, setLocating] = useState(false),
    [selectedSeq, setSelectedSeq] = useState<number | null>(null),
    [reload, setReload] = useState(0),
    [location, setLocation] = useState(focus);
  const contextRef = useRef(!!focus),
    historyEpoch = useRef(0),
    pendingSelection = useRef<number | null>(null);
  const conversation = path.startsWith("/team/conversations/");
  const searchingRef = useRef(searching),
    searchScroll = useRef<number | null>(null);
  searchingRef.current = searching;
  useLayoutEffect(() => {
    if (focus) {
      contextRef.current = true;
      setLocation(focus);
    }
  }, [focus]);
  const list = useRef<HTMLElement>(null),
    picker = useRef<HTMLInputElement>(null);
  const live = useRef(true),
    locked = useRef(false),
    fetched = useRef(0),
    read = useRef(0),
    stick = useRef(true);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const save = useCallback(
    (value: Draft) => {
      if (!live.current) return;
      draftRef.current = value;
      try {
        if (!value.text && !value.files.length) storage.removeItem(draftName);
        else storage.setItem(draftName, JSON.stringify(value));
      } catch {
        /* In-memory draft remains usable when device storage is full. */
      }
      if (live.current) setDraft(value);
    },
    [draftName],
  );
  const accept = useCallback(
    (incoming: SpaceChatMessage[], replace = false) => {
      if (!live.current) return;
      for (const m of incoming) {
        if (m.id === draftRef.current.key && m.author.id === pageWorkspace) {
          save(blank());
          setError("");
        }
      }
      setMessages((old) =>
        Array.from(
          new Map(
            [
              ...(replace ? old.filter((m) => m.seq > (incoming.at(-1)?.seq ?? 0)) : old),
              ...incoming,
            ].map((m) => [m.seq, m]),
          ).values(),
        ).sort((a, b) => a.seq - b.seq),
      );
    },
    [save],
  );
  const markRead = useCallback(() => {
    if (
      !visibleRef.current ||
      !live.current ||
      document.hidden ||
      searchingRef.current ||
      contextRef.current ||
      !stick.current ||
      fetched.current <= read.current
    )
      return;
    const seq = fetched.current;
    read.current = seq;
    void api(path + "/read", { method: "POST", body: { seq } })
      .then(() => spaces.refresh(true))
      .catch(() => {
        if (read.current === seq) read.current = 0;
      });
  }, [path, spaces.refresh]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Returning to latest explicitly restarts the canonical read cursor.
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    let running = false,
      loaded = false;
    const update = async () => {
      if (running || document.hidden || contextRef.current || !visibleRef.current) return;
      running = true;
      const epoch = historyEpoch.current;
      try {
        let page: SpaceChatPage;
        do {
          page = await api<SpaceChatPage>(path + (loaded ? `?after=${fetched.current}` : ""), {
            signal: controller.signal,
          });
          if (!live.current || historyEpoch.current !== epoch) return;
          if (!loaded) {
            setOlder(page.more);
            setError("");
          }
          // Only canonical reads advance the cursor, never a concurrent send acknowledgement.
          fetched.current = Math.max(fetched.current, page.messages.at(-1)?.seq ?? 0);
          accept(page.messages, !loaded);
          const wasLoaded = loaded;
          loaded = true;
          setReady(true);
          if (!wasLoaded) break;
        } while (page.more && !controller.signal.aborted);
      } catch (e) {
        if (controller.signal.aborted || historyEpoch.current !== epoch || !live.current) return;
        if (e instanceof ApiError && [403, 404].includes(e.status)) {
          spaces.open(null);
          void spaces.refresh().catch(() => {});
        } else if (!loaded && !controller.signal.aborted) setError(messageOf(e));
      } finally {
        running = false;
      }
    };
    void update();
    const tick = () => {
      void update();
    };
    const timer = setInterval(tick, 2500);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      live.current = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [path, accept, spaces.open, spaces.refresh, reload]);
  useEffect(() => {
    if (!location || !conversation) return;
    const controller = new AbortController(),
      epoch = ++historyEpoch.current;
    contextRef.current = true;
    stick.current = false;
    prepend.current = null;
    setContext(true);
    setLocating(true);
    setError("");
    void api<{ messages: SpaceChatMessage[]; moreBefore: boolean; moreAfter: boolean }>(
      `${path}/locate?seq=${location.seq}`,
      { signal: controller.signal },
    )
      .then((page) => {
        if (!live.current || historyEpoch.current !== epoch) return;
        pendingSelection.current = location.seq;
        setSelectedSeq(location.seq);
        setMessages(page.messages);
        setOlder(page.moreBefore);
        setMoreLater(page.moreAfter);
        setReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted && live.current && historyEpoch.current === epoch)
          setError(messageOf(e));
      })
      .finally(() => {
        if (live.current && historyEpoch.current === epoch) setLocating(false);
      });
    return () => controller.abort();
  }, [location, conversation, path]);
  const locateMessage = (seq: number) => {
    contextRef.current = true;
    stick.current = false;
    searchScroll.current = null;
    setLocation({ seq, token: crypto.randomUUID() });
  };
  const latest = () => {
    historyEpoch.current++;
    contextRef.current = false;
    setContext(false);
    setLocation(undefined);
    pendingSelection.current = null;
    searchScroll.current = null;
    prepend.current = null;
    setSelectedSeq(null);
    setMoreLater(false);
    setLocating(false);
    stick.current = true;
    fetched.current = 0;
    setReady(false);
    setError("");
    setReload((n) => n + 1);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: Position and read cursor follow committed message DOM.
  useLayoutEffect(() => {
    const element = list.current;
    if (!element || searching) return;
    if (pendingSelection.current !== null) {
      const target = element.querySelector<HTMLElement>(
        `[data-message-seq="${pendingSelection.current}"]`,
      );
      if (target) {
        element.scrollTop +=
          target.getBoundingClientRect().top - element.getBoundingClientRect().top - 16;
        pendingSelection.current = null;
      }
    } else if (searchScroll.current !== null) {
      element.scrollTop = searchScroll.current;
      searchScroll.current = null;
    } else if (prepend.current) {
      element.scrollTop = prepend.current.top + element.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (stick.current) element.scrollTop = element.scrollHeight;
    markRead();
  }, [messages, markRead, searching]);
  const send = async () => {
    if (
      readOnly ||
      locked.current ||
      (!draftRef.current.text.trim() && !draftRef.current.files.length)
    )
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    const outgoing = draftRef.current;
    try {
      const message = await api<SpaceChatMessage>(path, {
        method: "POST",
        key: outgoing.key,
        body: {
          text: outgoing.text.trim(),
          files: outgoing.files.map((f) => f.id),
          ...(members ? { mentions: outgoing.mentions?.map((m) => m.id) ?? [] } : {}),
        },
      });
      if (draftRef.current.key === outgoing.key) save(blank());
      if (contextRef.current) latest();
      setSearching(false);
      searchScroll.current = null;
      stick.current = true;
      accept([message]);
    } catch (e) {
      if (live.current) setError(messageOf(e));
    } finally {
      locked.current = false;
      if (live.current) setBusy(false);
    }
  };
  const upload = async (files: File[]) => {
    if (readOnly || locked.current || !files.length) return;
    if (
      files.length + draftRef.current.files.length > 8 ||
      files.some((f) => f.size > 32 * 1024 * 1024)
    ) {
      setError("До 8 файлов, каждый не больше 32 МБ.");
      return;
    }
    locked.current = true;
    setUploading(true);
    setError("");
    try {
      for (const file of files) {
        if (!live.current) break;
        const uploaded = await api<SpaceChatFile>(
          path + `/files?${new URLSearchParams({ name: file.name, mime: file.type })}`,
          { method: "POST", raw: file },
        );
        const old = draftRef.current;
        save({
          ...old,
          key: crypto.randomUUID(),
          files: [...old.files.filter((f) => f.id !== uploaded.id), uploaded],
        });
      }
    } catch (e) {
      if (live.current) setError(messageOf(e));
    } finally {
      locked.current = false;
      if (live.current) setUploading(false);
    }
  };
  const loadOlder = async () => {
    if (loadingOlder || locating || !messages.length) return;
    const epoch = historyEpoch.current;
    setLoadingOlder(true);
    try {
      const page = await api<SpaceChatPage>(path + `?before=${messages[0]!.seq}`);
      if (!live.current || epoch !== historyEpoch.current) return;
      if (list.current)
        prepend.current = { height: list.current.scrollHeight, top: list.current.scrollTop };
      stick.current = false;
      accept(page.messages);
      setOlder(page.more);
    } catch (e) {
      if (live.current && epoch === historyEpoch.current) setError(messageOf(e));
    } finally {
      if (live.current) setLoadingOlder(false);
    }
  };
  const loadLater = async () => {
    if (loadingOlder || locating || !messages.length) return;
    const epoch = historyEpoch.current;
    setLoadingOlder(true);
    try {
      const page = await api<SpaceChatPage>(`${path}?after=${messages.at(-1)!.seq}`);
      if (!live.current || epoch !== historyEpoch.current) return;
      accept(page.messages);
      setMoreLater(page.more);
    } catch (e) {
      if (live.current && epoch === historyEpoch.current) setError(messageOf(e));
    } finally {
      if (live.current) setLoadingOlder(false);
    }
  };
  return (
    <>
      {conversation && !searching && (
        <div className="conversation-reading-tools">
          <button
            type="button"
            className="icon-button"
            aria-label="Поиск по переписке"
            aria-expanded={searching}
            onClick={() => {
              searchScroll.current = list.current?.scrollTop ?? 0;
              setSearching(true);
            }}
          >
            <Icon name="search" />
          </button>
          {!context && attention?.firstUnreadSeq && (
            <button
              type="button"
              className="secondary"
              onClick={() => locateMessage(attention.firstUnreadSeq!)}
            >
              Новые · {attention.unread}
            </button>
          )}
          {attention?.mentionSeq && (
            <button
              type="button"
              className="secondary"
              aria-label="Первое непрочитанное упоминание"
              onClick={() => locateMessage(attention.mentionSeq!)}
            >
              @ {attention.unreadMentions}
            </button>
          )}
          {context && (
            <button type="button" className="secondary" onClick={latest}>
              К последним
            </button>
          )}
          {locating && <small role="status">Открываем сообщение…</small>}
        </div>
      )}
      {searching && (
        <ConversationSearch
          path={path}
          onClose={() => setSearching(false)}
          onChoose={(seq) => {
            setSearching(false);
            locateMessage(seq);
          }}
        />
      )}
      <section
        className="space-chat-messages shared-scroll"
        hidden={searching}
        ref={list}
        aria-label="Сообщения пространства"
        onScroll={() => {
          const el = list.current!;
          stick.current =
            !contextRef.current && el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          markRead();
        }}
      >
        {older && (
          <button
            type="button"
            className="secondary"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
          >
            Раньше
          </button>
        )}
        {!ready && <p className="nav-empty">Загружаем сообщения…</p>}
        {ready && !messages.length && (
          <p className="nav-empty">Обсуждайте идеи и делитесь материалами.</p>
        )}
        {messages.map((m) => (
          <article
            className="space-chat-message"
            data-own={m.author.id === pageWorkspace}
            data-message-seq={m.seq}
            data-selected={selectedSeq === m.seq || undefined}
            key={m.id}
          >
            <header>
              <strong>{m.author.name}</strong>
              <time dateTime={new Date(m.createdAt).toISOString()}>
                {new Date(m.createdAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </header>
            {m.mentions?.length ? (
              <small>{m.mentions.map((v) => "@" + v.name).join(" · ")}</small>
            ) : null}
            <div className="space-chat-text">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                  a: ({ href, children }) => (
                    <HumanReferenceLink href={href}>{children}</HumanReferenceLink>
                  ),
                  img: ({ src, alt }) => (
                    <a href={src} target="_blank" rel="noopener noreferrer">
                      {alt || "Изображение по ссылке"}
                    </a>
                  ),
                }}
              >
                {m.text}
              </ReactMarkdown>
            </div>
            {m.results?.map((card) => (
              <SharedResult key={card.id} card={card} />
            ))}
            {m.files.map((f) =>
              onFile ? (
                <button
                  type="button"
                  className="space-chat-file"
                  key={f.id}
                  onClick={() => onFile(f)}
                >
                  {f.mime.startsWith("image/") ? (
                    <img
                      src={workspaceUrl(`/api${path}/files/${f.id}`)}
                      alt={f.name}
                      loading="lazy"
                      onLoad={() => {
                        if (stick.current && list.current)
                          list.current.scrollTop = list.current.scrollHeight;
                      }}
                    />
                  ) : (
                    <Icon name="file" />
                  )}
                  <span>
                    {f.name} <small>{Math.max(1, Math.ceil(f.bytes / 1024))} КБ</small>
                  </span>
                </button>
              ) : (
                <div key={f.id} className="space-chat-file-actions">
                  <DownloadLink href={`/api${path}/files/${f.id}`} name={f.name} mime={f.mime}>
                    {f.mime.startsWith("image/") && (
                      <img
                        className="human-file-thumbnail"
                        src={workspaceUrl(`/api${path}/files/${f.id}`)}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    {f.name}
                  </DownloadLink>
                  {path.startsWith("/team/conversations/") && m.author.id === pageWorkspace && (
                    <ResultShareButton
                      result={{
                        id: f.id,
                        threadId: space.id,
                        title: f.name,
                        type: "file",
                        createdAt: new Date(m.createdAt).toISOString(),
                        turnId: null,
                        payload: { url: `/api${path}/files/${f.id}`, mime: f.mime, bytes: f.bytes },
                      }}
                    />
                  )}
                </div>
              ),
            )}
          </article>
        ))}
        {context && moreLater && (
          <button
            type="button"
            className="secondary"
            disabled={loadingOlder}
            onClick={() => void loadLater()}
          >
            Позже
          </button>
        )}
      </section>
      <form
        className="space-chat-composer"
        hidden={readOnly}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {draft.files.length > 0 && (
          <div className="space-chat-draft-files">
            {draft.files.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={busy || uploading}
                onClick={() =>
                  save({
                    ...draftRef.current,
                    key: crypto.randomUUID(),
                    files: draftRef.current.files.filter((v) => v.id !== f.id),
                  })
                }
                aria-label={`Убрать ${f.name}`}
              >
                <span>{f.name}</span>
                <Icon name="close" size={15} />
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {uploading && <small role="status">Загружаем файлы…</small>}
        {members && (!compactComposer || toolsOpen) && (
          <div className="chat-mentions">
            {compactComposer && (
              <button
                type="button"
                className="secondary"
                disabled={busy || uploading}
                onClick={() => {
                  picker.current?.click();
                  setToolsOpen(false);
                }}
              >
                Файл
              </button>
            )}
            <HumanReferencePicker
              onChoose={(text) =>
                save({
                  ...draftRef.current,
                  key: crypto.randomUUID(),
                  text: draftRef.current.text + (draftRef.current.text ? "\n" : "") + text,
                })
              }
            />
            <select
              aria-label="Упомянуть участника"
              value=""
              onChange={(e) => {
                const member = members.find((m) => m.id === e.target.value);
                if (member)
                  save({
                    ...draftRef.current,
                    key: crypto.randomUUID(),
                    mentions: [
                      ...(draftRef.current.mentions ?? []).filter((m) => m.id !== member.id),
                      member,
                    ],
                  });
              }}
            >
              <option value="">@ Участник</option>
              {members
                .filter((m) => m.id !== pageWorkspace)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            {draft.mentions?.map((m) => (
              <button
                type="button"
                className="secondary"
                key={m.id}
                onClick={() =>
                  save({
                    ...draftRef.current,
                    key: crypto.randomUUID(),
                    mentions: draftRef.current.mentions?.filter((v) => v.id !== m.id),
                  })
                }
              >
                @{m.name} ×
              </button>
            ))}
          </div>
        )}
        <div className="space-chat-input-row">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={compactComposer ? "Добавить к сообщению" : "Прикрепить к общему чату"}
            aria-expanded={compactComposer ? toolsOpen : undefined}
            disabled={busy || uploading}
            onClick={() => (compactComposer ? setToolsOpen(!toolsOpen) : picker.current?.click())}
          >
            <Icon name="plus" />
          </button>
          <AutoTextarea
            aria-label="Сообщение участникам"
            placeholder={compactComposer ? "Сообщение…" : "Сообщение участникам…"}
            rows={2}
            maxLength={16000}
            value={draft.text}
            disabled={busy}
            onChange={(e) =>
              save({ ...draftRef.current, text: e.target.value, key: crypto.randomUUID() })
            }
          />
          <button
            type="submit"
            className="primary icon-button"
            aria-label="Отправить в общий чат"
            disabled={busy || uploading || (!draft.text.trim() && !draft.files.length)}
          >
            <Icon name="send" />
          </button>
        </div>
      </form>
    </>
  );
}
