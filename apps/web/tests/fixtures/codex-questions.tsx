import { chatQuestionReplies, questionReplyDisplay, questionReplyText } from "@codex-web/shared";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AsyncQuestions } from "../../src/AsyncQuestions";
import { MessageText } from "../../src/Chat";
import { ComposerOptions, useTurnSettings } from "../../src/ComposerOptions";
import { useMessageQueue } from "../../src/MessageQueue";
import "../../src/styles.css";
import "../../src/workspace.css";
import "../../src/compact.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

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
    [remote, setRemote] = useState(false);
  const options = useTurnSettings("p", "t", saved),
    queue = useMessageQueue("t");
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
      <button type="button" onClick={() => setRemote(true)}>
        Ответ с компьютера
      </button>
      <AsyncQuestions
        key={id + remount}
        threadId="t"
        messageId={id}
        questions={questions}
        disabled={queue.busy}
        replies={remote ? (chatQuestionReplies(reply) ?? []) : []}
        onReply={(text) => queue.reply(text, "turn_test")}
      />
      {remote && <MessageText text={questionReplyDisplay(reply)} />}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
