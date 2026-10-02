import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MessageText } from "../../src/Chat";
import { Results } from "../../src/Results";
import type { ArtifactSelection } from "../../src/ArtifactMarkdown";
import type { Result } from "../../src/types";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/theme-variants.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";
const image = (n: number): Result => ({
  id: String(n),
  title: `screen-${n}.webp`,
  type: "image",
  turnId: "turn",
  createdAt: "2026-10-02",
  payload: { url: `/api/assets/${n}.webp`, mime: "image/webp" },
});
function Fixture() {
  const [count, setCount] = useState(3),
    [selection, setSelection] = useState<ArtifactSelection | null>(null);
  const text =
    "Текст перед галереей.\n\n" +
    Array.from({ length: count }, (_, i) => `![Экран ${i + 1}](/api/assets/${i + 1}.webp)`).join(
      "\n\n",
    ) +
    "\n\nПодпись между группами.\n\n![Отдельная картинка](/api/assets/5.webp)\n\nТекст после.";
  return (
    <main style={{ height: "100dvh", overflow: "auto", padding: 16 }}>
      <textarea aria-label="Черновик" defaultValue="Сохранить черновик" />
      <button type="button" onClick={() => setCount(4)}>
        Продолжить ответ
      </button>
      <article className="message-body">
        <MessageText
          text={text}
          complete
          onArtifact={(source) => {
            const item = image(Number(source.match(/(\d+)\.webp/)?.[1]));
            setSelection({ request: { scope: "chat", result: item }, item });
          }}
        />
      </article>
      <Results
        galleryEndpoint="/threads/gallery/results"
        results={[
          {
            id: "doc",
            title: "document.txt",
            type: "file",
            turnId: null,
            createdAt: "2026-10-02",
            payload: { url: "/api/assets/doc.txt", mime: "text/plain" },
          },
        ]}
        visible
        category="files"
        focusId=""
        busy={false}
        hasMore={false}
        onOlder={() => {}}
        onOverlayChange={() => {}}
        selection={selection}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
