import type { GptRichReference } from "@codex-web/shared";
import { useState } from "react";
import { Icon } from "./icons";
import { richUrl } from "./gptRichReferences";

export function GptRichImage({
  attrs: a,
  reference,
}: {
  attrs: Record<string, string>;
  reference?: GptRichReference;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const rawWidth = a.maxWidth || reference?.maxWidth;
  const width = /^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(rawWidth ?? "") ? rawWidth : "155px";
  const ratio = /^(\d+(?:\.\d+)?)[/:](\d+(?:\.\d+)?)$/.exec(
    a.aspectRatio || reference?.aspectRatio || "",
  );
  const aspectRatio =
    ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0 ? `${ratio[1]} / ${ratio[2]}` : undefined;
  const images =
    reference?.status === "resolved"
      ? reference.images?.filter((i) => richUrl(i.src) && !failed.includes(i.src))
      : undefined;
  if (images?.length)
    return (
      <span className="gpt-rich-images" style={{ width, maxWidth: "100%" }}>
        {images.map((image) => (
          <img
            key={image.src}
            src={image.src}
            alt={image.alt || a.alt || "Иллюстрация"}
            referrerPolicy="no-referrer"
            style={{ width: "100%", aspectRatio, objectFit: "contain" }}
            onError={() => setFailed((previous) => [...previous, image.src])}
          />
        ))}
      </span>
    );
  return (
    <span
      className="gpt-rich-image-unavailable muted"
      style={{ width, maxWidth: "100%", aspectRatio }}
      title={a.query ? `Запрос: ${a.query}` : undefined}
    >
      <Icon name="image" size={18} />
      <span>
        {reference?.status === "pending" ? "Загрузка иллюстрации…" : "Иллюстрация недоступна"}
      </span>
    </span>
  );
}
