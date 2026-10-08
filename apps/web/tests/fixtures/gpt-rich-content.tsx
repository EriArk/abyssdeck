import type { GptJob, GptMessage } from "@codex-web/shared";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GptMessageText } from "../../src/GptMessageText";
import { GptProgress, GptSteps } from "../../src/GptProgress";
import { gptLiveResults } from "../../src/gptLiveResults";
import { ResultFeed } from "../../src/ResultFeed";
import "../../src/styles.css";
import "../../src/workspace.css";
import "../../src/themes.css";
import "../../src/compact.css";
import "../../src/gpt.css";
import "../../src/materials.css";
import "../../src/polymer.css";
import "../../src/accent-colors.css";

const content = `## Choose a name

<box gap={3}>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={3}><icon name="gamepad-2" size="lg"/></box>
    <box flex={1} gap={1}>
      **1. Arcade / AbyssTail Arcade**

      Games, friends and a place to support developers.
    </box>
  </row>
  <divider color="subtle"/>
  <row align="start" gap={3}>
    <box background="surface-secondary" radius="lg" padding={3}><icon name="sparkles" size="lg"/></box>
    <box flex={1} gap={1}>
      **2. Picks / AbyssTail Picks**

      A personal selection of games.
    </box>
  </row>
  <row gap={2}><icon name="star"/><text weight="medium">4.8</text><caption>Illustrative rating</caption></row>
  <text size="sm" color="secondary">Open source · Roguelike</text>
  <row gap={2} wrap="wrap"><box border radius="md" padding={2}><row gap={1}><icon name="heart"/><text>Donate</text></row></box></row>
</box>

<grid columns={2} gap={3}><grid-item><box border padding={2}><title size="lg">Library</title><text>Saved games</text></box></grid-item><grid-item><list marker="number" gap={2}><list-item>First step</list-item><list-item>Second step</list-item></list></grid-item></grid>

Play <Entity category="video_game" value="Example Game"/> with friends. <Link url="https://example.com/game" title="Game details"/>

| Feature | Available |
| --- | --- |
| Markdown | **Yes** |

Literal example: \`<box gap={3}>\`

\`\`\`html
<box><text>Keep this code</text></box>
\`\`\`

[Read more](https://example.com/docs)
`;
const job = {
  id: "job",
  nativeId: "chat",
  userMessageId: "request",
  text: "Write the next chapter",
  status: "running",
  deliveryConfirmed: true,
  createdAt: 1000,
  updatedAt: 1000,
  files: [],
  assets: [],
  answer: "",
  model: "latest",
  effort: "6",
  error: "",
} satisfies GptJob;
function Fixture() {
  const [sample, setSample] = useState(content);
  useEffect(() => {
    const update = (event: Event) => setSample((event as CustomEvent<string>).detail);
    window.addEventListener("native-sample", update);
    return () => window.removeEventListener("native-sample", update);
  }, []);
  const [jobs, setJobs] = useState<GptJob[]>([]);
  const [messages, setMessages] = useState<GptMessage[]>([]);
  const [revision, setRevision] = useState(0);
  const [live, setLive] = useState<{
    jobId: string;
    items: NonNullable<GptJob["progress"]>;
  } | null>(null);
  const [running, setRunning] = useState(true);
  return (
    <main style={{ maxWidth: 900, margin: "auto", padding: 16 }}>
      <textarea aria-label="Draft" defaultValue="Keep my draft" />
      <button type="button" onClick={() => setJobs([{ ...job, deliveryConfirmed: false }])}>
        Queue request
      </button>
      <button
        type="button"
        onClick={() => {
          setJobs([job]);
          setRevision((r) => r + 1);
        }}
      >
        Confirm request
      </button>
      <button
        type="button"
        onClick={() => {
          setMessages([
            { id: "request", role: "user", text: job.text, createdAt: 1, files: [] },
            {
              id: "answer",
              role: "assistant",
              text: "**Chapter** started",
              createdAt: 2,
              files: [],
              complete: false,
            },
          ]);
          setRevision((r) => r + 1);
        }}
      >
        Canonical history
      </button>
      <button
        type="button"
        onClick={() =>
          setLive({
            jobId: "job",
            items: [
              {
                id: "summary",
                text: "Reviewing the repository and documentation",
                state: "active",
              },
            ],
          })
        }
      >
        Public summary event
      </button>
      <button type="button" onClick={() => setRunning(false)}>
        Local stream ended
      </button>
      <section data-testid="live-chat">
        <GptProgress items={live?.items ?? []} running={running} />
      </section>
      <div className="support-pane" style={{ height: 500 }}>
        <ResultFeed
          endpoint="/gpt/conversations/chat/results"
          revision={revision}
          visible
          focusCategory="reasoning"
          focusVersion={1}
          extras={gptLiveResults("chat", messages, jobs, live)}
          onOverlayChange={() => {}}
        />
      </div>
      <section className="message-body" data-testid="rich">
        <GptMessageText value={sample} rich />
      </section>
      <section className="message-body" data-testid="user">
        <GptMessageText value={"<box><text>User code stays literal</text></box>"} />
      </section>
      <section data-testid="memory">
        <GptMessageText value="Uses memory <MemoryCite />" rich />
      </section>
      <section className="message-body" data-testid="writing">
        <GptMessageText
          rich
          value={
            'I would reply like this.\n\n<WritingBlock id="58321" variant="chat_message">Heyo! 😁 No worries!\n\n**Good news** — the book server software is nearly finished.\n\nI\'ll share an update here as soon as it\'s ready! 😁</WritingBlock>\n\nNo specific date promised.'
          }
        />
      </section>
      <section data-testid="steps">
        <GptSteps
          items={[
            {
              id: "step",
              text: "**Searching** for details\n\n- First source\n- Second source",
              state: "active",
            },
          ]}
        />
      </section>
      <section data-testid="unsafe">
        <GptMessageText
          rich
          value={
            '<box onClick="window.pwned=true" style="position:fixed"><text>Safe content</text></box>\n\n<script>window.pwned=true</script>\n\n[Bad link](javascript:alert(1))'
          }
        />
      </section>
    </main>
  );
}
document.documentElement.dataset.theme = "crt-green";
createRoot(document.getElementById("root")!).render(<Fixture />);
