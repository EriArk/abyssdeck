import { lazy, Suspense, useEffect, useState } from "react";
import { accountLocalStorage as localStorage } from "./accountStorage.ts";
import { FileActionKey } from "./FileActionKey";

const Panel = lazy(() => import("./GuiPreviewPanel"));
export type GuiPreviewTarget = { projectId: string; projectName: string; threadId?: string };
export function GuiPreviewButton({
  compact = false,
  ...target
}: GuiPreviewTarget & { compact?: boolean }) {
  return (
    <FileActionKey
      compact={compact}
      icon="image"
      label="Предпросмотр приложения"
      onClick={() => window.dispatchEvent(new CustomEvent("open-gui-preview", { detail: target }))}
    />
  );
}
export function GuiPreviewHost() {
  const [target, setTarget] = useState<GuiPreviewTarget>();
  useEffect(() => {
    const open = (e: Event) => setTarget((e as CustomEvent<GuiPreviewTarget>).detail),
      end = () => {
        setTarget(undefined);
        try {
          for (const k of Object.keys(localStorage))
            if (k.startsWith("gui-preview-pending:")) localStorage.removeItem(k);
        } catch {}
      };
    window.addEventListener("open-gui-preview", open);
    window.addEventListener("private-session-ended", end);
    return () => {
      window.removeEventListener("open-gui-preview", open);
      window.removeEventListener("private-session-ended", end);
    };
  }, []);
  return target ? (
    <Suspense
      fallback={
        <div className="device-loading" role="status">
          Открываем предпросмотр…
        </div>
      }
    >
      <Panel key={target.projectId} target={target} onClose={() => setTarget(undefined)} />
    </Suspense>
  ) : null;
}
