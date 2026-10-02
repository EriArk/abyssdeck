import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MessageText } from "../../src/Chat";
import { GptImage } from "../../src/GptImage";
import "../../src/styles.css";

function Fixture() {
  const [revision, setRevision] = useState(0);
  return (
    <main>
      <button type="button" onClick={() => setRevision((r) => r + 1)}>
        Обновить историю
      </button>
      <section className="message-body">
        <MessageText
          text={`Ответ ${revision}.\n\n![Снимок](/api/native-images/stream)`}
          complete
          onArtifact={() => {}}
        />
      </section>
      <GptImage src="/api/gpt/native-assets/stream" alt="Снимок GPT" />
      <div style={{ height: 3000 }} />
      <MessageText text="![Далёкий снимок](/api/native-images/offscreen)" complete />
    </main>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<Fixture />);
