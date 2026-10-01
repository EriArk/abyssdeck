import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ActivityBadge } from "../../src/ActivityBadge";
import { MessageQueue, useMessageQueue } from "../../src/MessageQueue";
import { useGptAttention } from "../../src/useGptAttention";
import "../../src/styles.css";
import "../../src/queue.css";
import "../../src/workspace.css";
import "../../src/compact.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

function Fixture() {
  const queue = useMessageQueue("thread"),
    pane = useRef<HTMLDivElement>(null);
  const [reading, setReading] = useState(false);
  const unread = useGptAttention("chat", "final", reading, pane);
  return (
    <main style={{ maxWidth: 740, margin: "auto", padding: 16 }}>
      <button type="button" className="nav-thread" onClick={() => setReading(true)}>
        <span>Чат с готовым ответом</span>
        <ActivityBadge active={0} unread={Number(unread.has("chat"))} />
      </button>
      <div ref={pane} style={{ height: 180, overflow: "auto" }}>
        {reading && (
          <article data-message="final">
            <h2>Готовый ответ</h2>
            <p>Текст ответа прочитан в открытом чате.</p>
          </article>
        )}
      </div>
      <button
        type="button"
        disabled={queue.busy}
        onClick={() => void queue.add("Второе сообщение", [])}
      >
        Отправить в очередь
      </button>
      <MessageQueue queue={queue} turnId="turn" />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
