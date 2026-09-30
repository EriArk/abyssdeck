import assert from "node:assert/strict";
import test from "node:test";
import { Store } from "../apps/hub/dist/store.js";
import {
  chatQuestionReplies,
  chatQuestions,
  questionItemId,
  questionReplyDisplay,
  questionReplyText,
} from "../packages/shared/dist/index.js";

const questions = [
  { title: "Калькулятор виден?", options: ["Да", "Нет"] },
  { title: "Какой экран?" },
];
test("native asynchronous replies preserve exact call/index and readable answers", () => {
  const value = questionReplyText("call_example", questions, ["Да", "Основной\nэкран"]);
  const replies = chatQuestionReplies(value);
  assert.equal(replies[1].questionItemId, '["request_user_input_async","call_example",1]');
  assert.equal(replies[0].question, questions[0].title);
  assert.equal(replies[1].answer, "Основной\nэкран");
  assert.equal(
    questionReplyDisplay(value),
    "Калькулятор виден?\n\nДа\n\nКакой экран?\n\nОсновной\nэкран",
  );
  const partial = chatQuestionReplies(
    questionReplyText("call_example", questions, [null, "Экран"]),
  );
  assert.equal(partial.length, 1);
  assert.equal(partial[0].questionItemId, questionItemId("call_example", 1));
});
test("malformed envelopes and quoted examples remain ordinary user text", () => {
  const valid = questionReplyText("call_example", questions, ["Да", "Экран"]);
  for (const value of [
    "Example: " + valid,
    "```\n" + valid + "\n```",
    valid.replace("request_user_input_async", "wrong_tool"),
    valid.replace('"answer":"Да"', '"answer":42'),
    valid.replace("call_example", ""),
    valid + "\nExtra text",
    "<send_user_message_question_reply>{bad}</send_user_message_question_reply>",
  ]) {
    assert.equal(chatQuestionReplies(value), undefined);
    assert.equal(questionReplyDisplay(value), value);
  }
  assert.equal(chatQuestions([{ title: "Question", options: [{}] }]), undefined);
  assert.equal(chatQuestions([{ title: "" }]), undefined);
});
test("live question metadata survives snapshots, source context, and remains thread-local", () => {
  const s = new Store(":memory:");
  try {
    const t = s.createThread("p", "native", "chat"),
      other = s.createThread("p", "other", "other");
    s.append(
      t.id,
      "assistant.completed",
      { id: "call_example", text: "Question", questions },
      "turn",
    );
    s.append(other.id, "assistant.completed", { id: "call_example", text: "Normal" }, "turn");
    assert.deepEqual(s.history(t.id).messages[0].questions, questions);
    assert.deepEqual(s.context(t.id, "turn").messages[0].questions, questions);
    assert.equal(s.history(other.id).messages[0].questions, undefined);
    const raw = questionReplyText("call_example", questions, ["Да", "Основной"]);
    s.append(t.id, "user.message", { id: "reply", text: raw }, "turn");
    assert.equal(s.history(t.id).messages.at(-1).text, raw);
  } finally {
    s.close();
  }
});
