import { useEffect } from "react";

/** Publish one coherent visual-viewport sample. iOS updates innerHeight and the
 * visual viewport at different points in the keyboard animation. Mixing them
 * with Math.min can collapse the entire workspace to a transient layout height. */
export function useViewport() {
  useEffect(() => {
    let width = window.innerWidth;
    let tallest = window.visualViewport?.height ?? window.innerHeight;
    let keyboard = false;
    let frame = 0;
    const update = () => {
      const viewport = window.visualViewport;
      const height = viewport ? viewport.height : window.innerHeight;
      // A hidden/restoring WebKit page may temporarily have no viewport.
      // Keep the last usable sample until the browser publishes a real one.
      if (!Number.isFinite(height) || height <= 0) return;
      if (Math.abs(window.innerWidth - width) > 80) {
        width = window.innerWidth;
        tallest = height;
      } else tallest = Math.max(tallest, height);
      const editing = document.activeElement?.matches(
        "textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable=true]",
      );
      keyboard =
        window.innerHeight - height > 150 || (tallest - height > 150 && (!!editing || keyboard));
      const top = viewport?.offsetTop ?? 0;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      document.documentElement.style.setProperty(
        "--app-top",
        `${Number.isFinite(top) ? Math.max(0, top) : 0}px`,
      );
      document.documentElement.dataset.keyboard = String(keyboard);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    document.addEventListener("visibilitychange", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
      document.removeEventListener("visibilitychange", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, []);
}
