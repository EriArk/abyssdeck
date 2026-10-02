import { useEffect, useState } from "react";
import { workspaceMediaUrl } from "./accountStorage";
import { DecodedImage } from "./DecodedImage";

/** A failed image request is independent of sending a message. Retry only private
 * Hub media, twice; never reload an already decoded image during history polling. */
export function GptImage({ src, alt }: { src: string; alt: string }) {
  return <ImageAttempt key={src} src={src} alt={alt} />;
}

function ImageAttempt({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const privateMedia = /^\/api\/gpt\/(?:native-assets|uploads|artifacts)\//.test(src);
  useEffect(() => {
    if (!failed || !privateMedia || attempt >= 2) return;
    const timer = setTimeout(
      () => {
        setFailed(false);
        setAttempt((value) => value + 1);
      },
      attempt === 0 ? 1000 : 4000,
    );
    return () => clearTimeout(timer);
  }, [failed, privateMedia, attempt]);
  const source = workspaceMediaUrl(src);
  return (
    <DecodedImage
      src={
        attempt && source
          ? `${source}${source.includes("?") ? "&" : "?"}imageAttempt=${attempt}`
          : source
      }
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      onLoad={() => setFailed(false)}
    />
  );
}
