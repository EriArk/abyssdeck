import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";

/** Reveal complete decoded pixels, never the partially received rows of a PNG.
 * The same img owns the request and layout; decoding does not fetch another copy. */
export function DecodedImage(props: ComponentProps<"img">) {
  return <ImageAttempt key={props.src} {...props} />;
}

function ImageAttempt({ onLoad, onError, style, ...props }: ComponentProps<"img">) {
  const image = useRef<HTMLImageElement>(null);
  const alive = useRef(true);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const reveal = useCallback(async (element: HTMLImageElement) => {
    if (!element.complete || !element.naturalWidth) return;
    try {
      await element.decode();
    } catch {
      /* A completed load can still be painted on older decoders. */
    }
    if (alive.current && image.current === element && element.complete && element.naturalWidth)
      setState("ready");
  }, []);
  useEffect(() => {
    alive.current = true;
    if (image.current) void reveal(image.current);
    return () => {
      alive.current = false;
    };
  }, [reveal]);
  return (
    <img
      {...props}
      alt={props.alt ?? ""}
      ref={image}
      decoding="async"
      data-image-state={state}
      aria-busy={state === "loading"}
      style={{ ...style, visibility: state === "loading" ? "hidden" : style?.visibility }}
      onLoad={(event) => {
        void reveal(event.currentTarget);
        onLoad?.(event);
      }}
      onError={(event) => {
        setState("failed");
        onError?.(event);
      }}
    />
  );
}
