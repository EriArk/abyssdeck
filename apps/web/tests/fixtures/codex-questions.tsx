import { chatQuestionReplies, questionReplyDisplay, questionReplyText } from "@codex-web/shared";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AsyncQuestions } from "../../src/AsyncQuestions";
import { ApprovalCard, MessageText } from "../../src/Chat";
import { ComposerOptions, useTurnSettings } from "../../src/ComposerOptions";
import { MessageQueue, useMessageQueue } from "../../src/MessageQueue";
import "../../src/styles.css";
import "../../src/workspace.css";
import "../../src/compact.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";
import "../../src/device-chassis.css";

const questions = [
  {
    title:
      "Калькулятор, который я сейчас открыл, виден на экране самого ПК? Экран включён и рабочий стол разблокирован?",
    options: [
      "Да, Калькулятор виден",
      "Экран выключен или ПК заблокирован",
      "Я не у ПК, проверить не могу",
    ],
  },
];
const saved = { model: "gpt-6-astra", effort: "high" as const, mode: "default" as const };
function Fixture() {
  const [id, setId] = useState("call_test"),
    [remount, setRemount] = useState(0),
    [remote, setRemote] = useState(false),
    [plan, setPlan] = useState(false),
    [planResult, setPlanResult] = useState("");
  const options = useTurnSettings("p", "t", saved),
    queue = useMessageQueue("t");
  const shownQuestions =
    id === "call_multi"
      ? [questions[0], { title: "Ещё выбор?", options: ["Один", "Два"] }]
      : id === "call_mixed"
        ? [questions[0], { title: "Что сейчас мешает?" }]
        : id === "call_long"
          ? [
              {
                title:
                  "Odin после сбоя GPU и удалённой команды перезагрузки не возвращается в сеть. Если он сейчас рядом, можешь перезапустить его долгим нажатием Power? Flip работает; доступные проверки на нём продолжаю.",
              },
            ]
          : questions;
  const reply = questionReplyText(id, questions, ["Да, Калькулятор виден"]);
  return (
    <main style={{ maxWidth: 740, margin: "auto", padding: 16 }}>
      <input aria-label="Черновик сообщения" defaultValue="Сохрани основной черновик" />
      <ComposerOptions options={options} disabled={false} />
      <button type="button" onClick={() => setRemount((v) => v + 1)}>
        Переоткрыть
      </button>
      <button
        type="button"
        onClick={() => {
          setId("call_other");
          setRemote(false);
        }}
      >
        Другой вопрос
      </button>
      <button
        type="button"
        onClick={() => {
          setId("call_click");
          setRemote(false);
        }}
      >
        Выбор одним нажатием
      </button>
      <button
        type="button"
        onClick={() => {
          setId("call_multi");
          setRemote(false);
        }}
      >
        Несколько выборов
      </button>
      <button
        type="button"
        onClick={() => {
          setId("call_mixed");
          setRemote(false);
        }}
      >
        Выбор и текст
      </button>
      <button type="button" onClick={() => setRemote(true)}>
        Ответ с компьютера
      </button>
      <button
        type="button"
        onClick={() => {
          setId("call_long");
          setRemote(false);
        }}
      >
        Длинный вопрос
      </button>
      <AsyncQuestions
        key={id + remount}
        threadId="t"
        messageId={id}
        questions={shownQuestions}
        disabled={queue.busy}
        replies={remote ? (chatQuestionReplies(reply) ?? []) : []}
        onReply={(text) => queue.reply(text, "turn_test")}
      />
      {remote && <MessageText text={questionReplyDisplay(reply)} />}
      <MessageQueue queue={queue} turnId="turn_test" />
      <button type="button" onClick={() => setPlan(true)}>
        Вопрос для плана
      </button>
      {plan && (
        <ApprovalCard
          approval={{
            id: "plan_request",
            kind: "question",
            description: "",
            questions: [
              {
                id: "choice",
                question: "Выбор для плана?",
                options: [{ label: "A" }, { label: "B" }],
              },
              { id: "free", question: "Детали плана?", options: [] },
            ],
          }}
          busy={false}
          onDecision={() => {}}
          onAnswer={(id, answers) => {
            setPlan(false);
            setPlanResult(JSON.stringify({ id, answers }));
          }}
        />
      )}
      <ApprovalCard
        approval={{
          id: "plan_choices",
          kind: "question",
          description: "",
          questions: [
            {
              id: "first",
              question: "Первый выбор плана?",
              options: [{ label: "Первый A" }, { label: "Первый B" }],
            },
            {
              id: "second",
              question: "Второй выбор плана?",
              options: [{ label: "Второй A" }, { label: "Второй B" }],
            },
          ],
        }}
        busy={!!planResult}
        onDecision={() => {}}
        onAnswer={(id, answers) => setPlanResult(JSON.stringify({ id, answers }))}
      />
      {planResult && <output aria-label="Ответ режима плана">{planResult}</output>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
