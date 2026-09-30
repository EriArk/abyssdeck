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
  const [draft, setDraft] = useState<{ choices: string[]; custom: string[]; submitted: boolean }>(
    () => {
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
            submitted: saved.submitted === true,
          };
      } catch {
        /* The form also works without browser storage. */
      }
      return {
        choices: questions.map((q) => q.options?.[0] ?? ""),
        custom: questions.map(() => ""),
        submitted: false,
      };
    },
  );
  const [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const save = (next: typeof draft) => {
    setDraft(next);
    try {
      storage.setItem(key, JSON.stringify({ signature, ...next }));
    } catch {
      /* Optional local draft. */
    }
  };
  const answered = questions.map((q, index) =>
    replies.findLast(
      (r) => r.questionItemId === questionItemId(messageId, index) && r.question === q.title,
    ),
  );
  const completed = draft.submitted || answered.every(Boolean);
  const acknowledged = answered.every(Boolean)
    ? JSON.stringify(answered.map((r) => r?.answer))
    : "";
  useEffect(() => {
    if (!acknowledged) return;
    const choices: string[] = JSON.parse(acknowledged);
    const next = { choices, custom: choices.map(() => ""), submitted: true };
    setDraft(next);
    try {
      storage.setItem(key, JSON.stringify({ signature, ...next }));
    } catch {
      /* Optional local state. */
    }
  }, [acknowledged, key, signature]);
  const values = questions.map(
    (_, i) => answered[i]?.answer ?? (draft.choices[i] || draft.custom[i] || ""),
  );
  return (
    <form
      className="async-questions"
      aria-label="Вопросы Codex"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current || disabled || completed || values.some((v) => !v.trim())) return;
        lock.current = true;
        setSending(true);
        setError("");
        try {
          if (
            await onReply(
              questionReplyText(
                messageId,
                questions,
                values.map((value, index) => (answered[index] ? null : value)),
              ),
            )
          )
            save({ choices: values, custom: values.map(() => ""), submitted: true });
        } catch (e) {
          setError(messageOf(e));
        } finally {
          lock.current = false;
          setSending(false);
        }
      }}
    >
      {questions.map((q, index) => (
        <fieldset
          key={questionItemId(messageId, index)}
          disabled={disabled || sending || completed || !!answered[index]}
        >
          <legend>{q.title}</legend>
          {completed || answered[index] ? (
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
                    onChange={() =>
                      save({
                        ...draft,
                        choices: draft.choices.map((v, i) => (i === index ? option : v)),
                      })
                    }
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
              )}
            </>
          )}
        </fieldset>
      ))}
      {completed ? (
        <span className="small muted" role="status">
          Ответ передан
        </span>
      ) : (
        <button
          className="primary"
          type="submit"
          disabled={disabled || sending || values.some((v) => !v.trim())}
        >
          {sending ? "Отправляю…" : "Ответить"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
