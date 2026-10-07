import { createRoot } from "react-dom/client";
import App from "./App";
import { applyLayoutPreference } from "./AppearanceSettings";
import { BrowserDownloadPage } from "./BrowserDownloadPage";
import { DeviceWorkspaceHost } from "./DeviceWorkspaceHost";
import { GuiPreviewHost } from "./GuiPreviewHost";
import { applyCachedPersonalScale } from "./PersonalScale";
import { ProjectDeliveryHost } from "./ProjectDeliveryHost";
import { QuickCaptureHost } from "./QuickCaptureHost";
import { TeamProjectsHost } from "./TeamProjectsHost";
import { applyTheme, cachedTheme } from "./theme";
import { WindowDock } from "./WindowDock";
import "./fonts.css";
import "./styles.css";
import "./workspace.css";
import "./themes.css";
import "./compact.css";
import "./queue.css";
import "./messageImages.css";
import "./motion.css";
import "./materials.css";
import "./tablet.css";
import "./polymer.css";
import "./accent-colors.css";
import "./viewport-controls.css";
import "./workspace-window.css";
import "./theme-variants.css";
import "./device-chassis.css";
import "./workspace-panels.css";

applyTheme(cachedTheme());
applyLayoutPreference();
applyCachedPersonalScale();
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
  location.pathname === "/download" ? (
    <BrowserDownloadPage />
  ) : (
    <>
      <App />
      <DeviceWorkspaceHost />
      <QuickCaptureHost />
      <ProjectDeliveryHost />
      <GuiPreviewHost />
      <TeamProjectsHost />
      <WindowDock />
    </>
  ),
);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  });
