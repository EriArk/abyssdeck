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
    chosen: boolean[];
    submitted: boolean;
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
          chosen: saved.chosen ?? questions.map(() => false),
          submitted: saved.submitted === true,
        };
    } catch {
      /* The form also works without browser storage. */
    }
    return {
      choices: questions.map((q) => q.options?.[0] ?? ""),
      custom: questions.map(() => ""),
      chosen: questions.map(() => false),
      submitted: false,
    };
  });
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
    const next = {
      choices,
      custom: choices.map(() => ""),
      chosen: choices.map(() => true),
      submitted: true,
    };
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
  const submit = async (next: typeof draft) => {
    const selected = questions.map(
      (_, i) => answered[i]?.answer ?? (next.choices[i] || next.custom[i] || ""),
    );
    if (lock.current || disabled || completed || selected.some((v) => !v.trim())) return;
    lock.current = true;
    setSending(true);
    setError("");
    try {
      if (
        await onReply(
          questionReplyText(
            messageId,
            questions,
            selected.map((value, index) => (answered[index] ? null : value)),
          ),
        )
      )
        save({
          choices: selected,
          custom: selected.map(() => ""),
          chosen: selected.map(() => true),
          submitted: true,
        });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      lock.current = false;
      setSending(false);
    }
  };
  const needsText = questions.some((_, i) => !answered[i] && !draft.choices[i]);
  return (
    <form
      className="async-questions"
      aria-label="Вопросы Codex"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(draft);
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
                    readOnly
                    onClick={() => {
                      if (lock.current || disabled || completed) return;
                      const next = {
                        ...draft,
                        choices: draft.choices.map((v, i) => (i === index ? option : v)),
                        chosen: draft.chosen.map((v, i) => i === index || v),
                      };
                      save(next);
                      if (
                        questions.every(
                          (_, i) => answered[i] || (next.chosen[i] && next.choices[i]),
                        )
                      )
                        void submit(next);
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
      ) : needsText || error ? (
        <button
          className="primary"
          type="submit"
          disabled={disabled || sending || values.some((v) => !v.trim())}
        >
          {sending ? "Отправляю…" : "Ответить"}
        </button>
      ) : sending ? (
        <span role="status">Применяю…</span>
      ) : null}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
