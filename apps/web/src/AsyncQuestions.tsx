import {
  type ChatQuestion,
  type ChatQuestionReply,
  questionItemId,
  questionReplyText,
} from "@codex-web/shared";
import { useEffect, useRef, useState } from "react";
import { AutoTextarea } from "./AutoTextarea";
import { accountSessionStorage as storage } from "./accountStorage";
import { messageOf } from "./api";
import "./asyncQuestions.css";

export function AsyncQuestions({
  threadId,
  messageId,
  questions,
  replies,
  disabled,
  onReply,
}: {
  threadId: string;
  messageId: string;
  questions: ChatQuestion[];
  replies: ChatQuestionReply[];
  disabled: boolean;
  onReply: (text: string) => Promise<boolean>;
}) {
  const key = `codex-question:${threadId}:${messageId}`;
  const signature = JSON.stringify(questions);
  const [draft, setDraft] = useState<{
    choices: string[];
    custom: string[];
    accepted: (string | null)[];
  }>(() => {
    try {
      const saved = JSON.parse(storage.getItem(key) ?? "null");
      if (
        saved?.signature === signature &&
        Array.isArray(saved.choices) &&
        Array.isArray(saved.custom)
      )
        return {
          choices: saved.choices,
          custom: saved.custom,
          accepted: questions.map((_, i) =>
            typeof saved.accepted?.[i] === "string"
              ? saved.accepted[i]
              : saved.submitted === true
                ? saved.choices[i] || saved.custom[i] || null
                : null,
          ),
        };
    } catch {
      /* The form also works without browser storage. */
    }
    return {
      choices: questions.map((q) => q.options?.[0] ?? ""),
      custom: questions.map(() => ""),
      accepted: questions.map(() => null),
    };
  });
  const [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const save = (update: typeof draft | ((current: typeof draft) => typeof draft)) => {
    setDraft((current) => {
      const next = typeof update === "function" ? update(current) : update;
      try {
        storage.setItem(key, JSON.stringify({ signature, ...next }));
      } catch {
        /* Optional local draft. */
      }
      return next;
    });
  };
  const answered = questions.map((q, index) =>
    replies.findLast(
      (r) => r.questionItemId === questionItemId(messageId, index) && r.question === q.title,
    ),
  );
  const values = questions.map((_, i) => answered[i]?.answer ?? draft.accepted[i] ?? null);
  const completed = values.every((value) => value !== null);
  const acknowledged = JSON.stringify(answered.map((r) => r?.answer ?? null));
  useEffect(() => {
    const remote: (string | null)[] = JSON.parse(acknowledged);
    setDraft((current) => {
      const accepted = current.accepted.map((value, i) => remote[i] ?? value);
      if (accepted.every((value, i) => value === current.accepted[i])) return current;
      const next = { ...current, accepted };
      try {
        storage.setItem(key, JSON.stringify({ signature, ...next }));
      } catch {
        /* Optional local state. */
      }
      return next;
    });
  }, [acknowledged, key, signature]);
  const submit = async (index: number, next: typeof draft) => {
    const value = next.choices[index] || next.custom[index] || "";
    if (lock.current || disabled || values[index] !== null || !value.trim()) return;
    lock.current = true;
    setSending(true);
    setError("");
    try {
      if (
        await onReply(
          questionReplyText(
            messageId,
            questions,
            questions.map((_, i) => (i === index ? value : null)),
          ),
        )
      ) {
        save((current) => ({
          ...current,
          accepted: current.accepted.map((answer, i) =>
            i === index ? value : (values[i] ?? answer),
          ),
        }));
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      lock.current = false;
      setSending(false);
    }
  };
  return (
    <form
      className="async-questions"
      aria-label="Вопросы Codex"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      {questions.map((q, index) => (
        <fieldset
          key={questionItemId(messageId, index)}
          disabled={disabled || sending || values[index] !== null}
        >
          <legend>{q.title}</legend>
          {values[index] !== null ? (
            <p className="question-answer">{values[index]}</p>
          ) : (
            <>
              {q.options?.map((option) => (
                <label className="question-option" key={option}>
                  <input
                    type="radio"
                    name={`${key}:${index}`}
                    value={option}
                    checked={draft.choices[index] === option}
                    readOnly
                    onClick={() => {
                      if (lock.current || disabled || completed) return;
                      const next = {
                        ...draft,
                        choices: draft.choices.map((v, i) => (i === index ? option : v)),
                      };
                      save(next);
                      void submit(index, next);
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
              {q.options?.length ? (
                <label className="question-option">
                  <input
                    type="radio"
                    name={`${key}:${index}`}
                    checked={!draft.choices[index]}
                    onChange={() =>
                      save({
                        ...draft,
                        choices: draft.choices.map((v, i) => (i === index ? "" : v)),
                      })
                    }
                  />
                  <span>Свой ответ</span>
                </label>
              ) : null}
              {!draft.choices[index] && (
                <>
                  <AutoTextarea
                    aria-label={`Свой ответ: ${q.title}`}
                    value={draft.custom[index] ?? ""}
                    maxLength={8000}
                    onChange={(e) =>
                      save({
                        ...draft,
                        custom: draft.custom.map((v, i) => (i === index ? e.target.value : v)),
                      })
                    }
                  />
                  <button
                    className="primary"
                    type="button"
                    disabled={!draft.custom[index]?.trim()}
                    onClick={() => void submit(index, draft)}
                  >
                    Ответить
                  </button>
                </>
              )}
            </>
          )}
        </fieldset>
      ))}
      {completed ? (
        <span className="small muted" role="status">
          Ответ передан
        </span>
      ) : sending ? (
        <span role="status">Применяю…</span>
      ) : null}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
