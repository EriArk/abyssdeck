import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { ArtifactSelection } from "../../src/ArtifactMarkdown";
import { AttachmentList } from "../../src/AttachmentPicker";
import { MessageText } from "../../src/Chat";
import { Results } from "../../src/Results";
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
  title: n === 2 ? "Изображение" : `screen-${n}.webp`,
  type: "image",
  turnId: "turn",
  createdAt: "2026-10-02",
  payload: { url: `/api/native-images/${n}`, ...(n === 2 ? {} : { mime: "image/webp" }) },
});
function Fixture() {
  const [native, setNative] = useState(false);
  const [count, setCount] = useState(3),
    [selection, setSelection] = useState<ArtifactSelection | null>(null);
  const text =
    "Текст перед галереей.\n\n" +
    Array.from({ length: count }, (_, i) => `![Экран ${i + 1}](/api/native-images/${i + 1})`).join(
      "\n\n",
    ) +
    "\n\nПодпись между группами.\n\n![Отдельная картинка](/api/native-images/5)\n\nТекст после.";
  return (
    <main style={{ height: "100dvh", overflow: "auto", padding: 16 }}>
      <textarea aria-label="Черновик" defaultValue="Сохранить черновик" />
      <button type="button" onClick={() => setCount(4)}>
        Продолжить ответ
      </button>
      <button type="button" onClick={() => setNative(true)}>
        Встроенные картинки
      </button>
      {native && (
        <section aria-label="Встроенные картинки">
          <AttachmentList
            files={[1, 2, 3].map((n) => ({
              id: `native-${n}`,
              threadId: "gallery",
              messageId: "m",
              name: `Изображение ${n}`,
              mime: "image/png",
              bytes: 0,
              image: true,
              url: `/api/native-images/${n}`,
              previewUrl: `/api/native-images/${n}`,
              createdAt: "",
            }))}
          />
        </section>
      )}
      <article className="message-body">
        <MessageText
          text={text}
          complete
          onArtifact={(source) => {
            const item = image(Number(source.match(/(\d+)$/)?.[1]));
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
