/** Public asynchronous Codex questions; these are messages, not approval requests. */
export interface ChatQuestion {
  title: string;
  options?: string[];
}
export interface ChatQuestionReply {
  questionItemId: string;
  question: string;
  answer: string;
}
export function chatQuestions(value: unknown): ChatQuestion[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 20) return;
  const result: ChatQuestion[] = [];
  for (const v of value) {
    if (!v || typeof v.title !== "string" || !v.title.trim() || v.title.length > 12000) return;
    if (
      v.options != null &&
      (!Array.isArray(v.options) ||
        v.options.length > 30 ||
        v.options.some(
          (option: unknown) => typeof option !== "string" || !option.trim() || option.length > 8000,
        ))
    )
      return;
    result.push({
      title: v.title,
      ...(v.options?.length ? { options: [...new Set<string>(v.options)] } : {}),
    });
  }
  return result;
}
export const questionItemId = (messageId: string, index: number) =>
  JSON.stringify(["request_user_input_async", messageId, index]);

/** Decode only a complete native reply envelope. Other user text stays byte-for-byte intact. */
export function chatQuestionReplies(text: string): ChatQuestionReply[] | undefined {
  if (text.length > 200000) return;
  const match =
    /^\s*<send_user_message_question_reply>\s*([\s\S]+?)\s*<\/send_user_message_question_reply>\s*$/.exec(
      text,
    );
  if (!match?.[1]) return;
  try {
    const values = JSON.parse(match[1]);
    if (!Array.isArray(values) || !values.length || values.length > 20) return;
    const seen = new Set<string>();
    for (const v of values) {
      if (
        !v ||
        typeof v.questionItemId !== "string" ||
        typeof v.question !== "string" ||
        typeof v.answer !== "string" ||
        !v.answer.trim() ||
        v.answer.length > 8000 ||
        !v.question.trim() ||
        v.question.length > 12000 ||
        seen.has(v.questionItemId)
      )
        return;
      const id = JSON.parse(v.questionItemId);
      if (
        !Array.isArray(id) ||
        id.length !== 3 ||
        id[0] !== "request_user_input_async" ||
        typeof id[1] !== "string" ||
        !id[1] ||
        id[1].length > 200 ||
        !Number.isInteger(id[2]) ||
        id[2] < 0 ||
        id[2] >= 20
      )
        return;
      seen.add(v.questionItemId);
    }
    return values.map(({ questionItemId, question, answer }) => ({
      questionItemId,
      question,
      answer,
    }));
  } catch {
    return;
  }
}
export function questionReplyText(
  messageId: string,
  questions: ChatQuestion[],
  answers: (string | null)[],
): string {
  if (
    !messageId ||
    messageId.length > 200 ||
    !chatQuestions(questions) ||
    answers.length !== questions.length ||
    !answers.some((v) => v !== null) ||
    answers.some((v) => v !== null && (typeof v !== "string" || !v.trim() || v.length > 8000))
  )
    throw new Error("QUESTION_ANSWERS_INVALID");
  return `<send_user_message_question_reply>\n${JSON.stringify(
    questions.flatMap((q, index) =>
      answers[index] === null
        ? []
        : [
            {
              questionItemId: questionItemId(messageId, index),
              question: q.title,
              answer: answers[index],
            },
          ],
    ),
  )}\n</send_user_message_question_reply>`;
}
export function questionReplyDisplay(text: string): string {
  return (
    chatQuestionReplies(text)
      ?.map((v) => `${v.question}\n\n${v.answer}`)
      .join("\n\n") ?? text
  );
}
