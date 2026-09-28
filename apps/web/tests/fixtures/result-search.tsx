import { useState } from "react";
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

function Fixture() {
  const [revision, setRevision] = useState(0),
    [client, setClient] = useState("gpt"),
    [source, setSource] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <input aria-label="Draft" />
      <div style={{ display: "flex" }}>
        <button type="button" onClick={() => setRevision((v) => v + 1)}>
          Refresh
        </button>
        <button type="button" onClick={() => setClient((v) => (v === "gpt" ? "codex" : "gpt"))}>
          Client
        </button>
        <output data-testid="source">{source}</output>
      </div>
      <div className="support-pane" style={{ flex: 1, minHeight: 0 }}>
        <ResultFeed
          endpoint={client === "gpt" ? "/gpt/conversations/chat/results" : "/threads/chat/results"}
          revision={revision}
          visible
          onOverlayChange={() => {}}
          onTurn={(id, threadId) => setSource(`${threadId}:${id}`)}
        />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
