import { type RefObject, useCallback, useEffect, useRef } from "react";

export function animateWindowExit(dialog: HTMLDialogElement) {
  if (!dialog.open || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  return dialog.animate(
    [
      { opacity: 1, clipPath: "inset(0px round 12px)" },
      { opacity: 0, clipPath: "inset(6px 0px round 12px)" },
    ],
    { duration: 130, easing: "ease-in", fill: "forwards" },
  );
}

/** Visual exit only. The caller still owns dirty checks, terminal release and actual dismissal. */
export function useWindowDismiss(ref: RefObject<HTMLDialogElement | null>) {
  const active = useRef<Animation | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    const cancel = () => {
      active.current?.cancel();
      active.current = null;
    };
    dialog?.addEventListener("close", cancel);
    return () => {
      cancel();
      dialog?.removeEventListener("close", cancel);
    };
  }, [ref]);
  return useCallback(
    (done: () => void) => {
      const dialog = ref.current;
      if (active.current) return;
      const animation = dialog && animateWindowExit(dialog);
      if (!dialog || !animation) {
        done();
        return;
      }
      active.current = animation;
      void animation.finished
        .then(() => {
          active.current = null;
          if (dialog.isConnected && dialog.open) done();
          animation.cancel();
        })
        .catch(() => {
          active.current = null;
        });
    },
    [ref],
  );
}
