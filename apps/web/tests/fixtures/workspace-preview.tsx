import { createRoot } from "react-dom/client";
import GuiPreviewPanel from "../../src/GuiPreviewPanel";
import "../../src/styles.css";
import "../../src/themes.css";
import "../../src/fonts.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

createRoot(document.getElementById("root")!).render(
  <GuiPreviewPanel
    target={{ projectId: "fixture", projectName: "Личный проект с длинным названием приложения" }}
    onClose={() => {
      document.getElementById("root")!.textContent = "Вернулись к чату";
    }}
  />,
);
