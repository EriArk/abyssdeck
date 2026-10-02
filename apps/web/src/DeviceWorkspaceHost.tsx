import { lazy, Suspense, useEffect, useState } from "react";
import { restoreWorkspaceWindow } from "./workspaceWindowRegistry";

const Workspace = lazy(() => import("./DeviceWorkspace"));
export const openDevices = () => window.dispatchEvent(new Event("open-device-workspace"));
export const terminalDevice = (href: string) =>
  /^codexweb:\/\/terminal\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,79})$/.exec(href)?.[1];
export const openTerminal = (device: string) =>
  window.dispatchEvent(new CustomEvent("open-device-terminal", { detail: device }));
export function DeviceWorkspaceHost() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  useEffect(() => {
    const show = () => {
        if (restoreWorkspaceWindow("devices")) return;
        setTarget("");
        setOpen(true);
      },
      hide = () => setOpen(false);
    const terminal = (event: Event) => {
      const id = (event as CustomEvent).detail;
      if (typeof id !== "string" || !terminalDevice("codexweb://terminal/" + id)) return;
      restoreWorkspaceWindow("devices");
      setTarget(id);
      setOpen(true);
    };
    window.addEventListener("open-device-workspace", show);
    window.addEventListener("open-device-terminal", terminal);
    window.addEventListener("private-session-ended", hide);
    return () => {
      window.removeEventListener("open-device-workspace", show);
      window.removeEventListener("open-device-terminal", terminal);
      window.removeEventListener("private-session-ended", hide);
    };
  }, []);
  return open ? (
    <Suspense
      fallback={
        <div className="device-loading" role="status">
          Открываем устройства…
        </div>
      }
    >
      <Workspace terminalDeviceId={target} onClose={() => setOpen(false)} />
    </Suspense>
  ) : null;
}
