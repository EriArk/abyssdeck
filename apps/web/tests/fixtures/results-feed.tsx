import { createRoot } from "react-dom/client";
import { ResultFeed } from "../../src/ResultFeed";
import "../../src/styles.css";
import "../../src/workspace.css";
import "../../src/themes.css";
import "../../src/compact.css";
import "../../src/gpt.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";
import "../../src/device-chassis.css";

createRoot(document.getElementById("root")!).render(
  <div
    className="workspace"
    style={{ height: "100dvh", maxWidth: 736, margin: "auto", display: "block" }}
  >
    <div className="support-pane" style={{ height: "100%" }}>
      <ResultFeed
        endpoint={
          location.search.includes("gpt")
            ? "/gpt/conversations/chat/results"
            : "/threads/chat/results"
        }
        revision={1}
        visible
        onOverlayChange={() => {}}
        onTurn={(id, thread) => {
          document.body.dataset.source = JSON.stringify([id, thread]);
        }}
      />
    </div>
  </div>,
);
