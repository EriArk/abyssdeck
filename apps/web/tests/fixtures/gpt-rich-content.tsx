import { GptRichCorpus } from "./gpt-rich-corpus";
import type { GptJob, GptMessage } from "@codex-web/shared";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GptMessageText } from "../../src/GptMessageText";
import { GptProgress, GptSteps } from "../../src/GptProgress";
import { gptLiveResults } from "../../src/gptLiveResults";
import { ResultFeed } from "../../src/ResultFeed";
import { layoutBodySample } from "./gpt-layout-body";
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
const eachContent = `<box border radius="lg" padding={3} gap={3}>
<title size="lg">Current Game</title>
{#each [{icon:"play",label:"Continue game"},{icon:"minimize-2",label:"Minimize game"},{icon:"users",label:"Play together"},{icon:"sliders-horizontal",label:"Game settings"},{icon:"log-out",label:"Exit game"}] as item}
<row background="surface-secondary" radius="lg" padding={3} gap={3}><icon name={item.icon}/><text weight="bold">{item.label}</text></row>
{/each}
</box>`;
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
  const [openedCitation, setOpenedCitation] = useState("");
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
      <GptRichCorpus />
      <section className="gpt-chat" data-testid="image-layout">
        <article className="message assistant">
          <div className="message-body">
            <GptMessageText
              rich
              value={`<row align="start" gap={3}>
  <AsyncImage query="handheld console front view" aspectRatio="4:3" maxWidth="155px"/>
  <box flex="1" gap={1}>
    **<Entity category="product" value="Handheld console"/>**

    Одна из портативок с этим процессором: AMOLED, 8 ГБ RAM и Android. <Cite ref="turn1search0"/>
  </box>
</row>`}
            />
          </div>
        </article>
      </section>
      <section className="gpt-chat" data-testid="body-template">
        <article className="message assistant">
          <div className="message-body">
            <GptMessageText value={layoutBodySample} rich />
          </div>
        </article>
      </section>
      <section data-testid="each">
        <GptMessageText value={eachContent} rich />
      </section>
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
      <section className="message-body" data-testid="citations">
        <GptMessageText
          rich
          value={
            'The garden road was blocked. <FileCite ref="file_missing" line_range_start={285} line_range_end={288}/> <FileCite ref="file_missing" line_range_start={354} line_range_end={362}/>\n\nThe passage in the chapter: <FileCite ref="file_chapter" line_range_start={167} line_range_end=\n{171}/>\n\nLiteral: `<FileCite ref="file_chapter"/>`'
          }
          citationFiles={[
            {
              id: "file_chapter",
              name: "Chapter.md",
              mime: "text/markdown",
              bytes: 100,
              url: "/api/gpt/native-assets/chat/user/file_chapter",
              image: false,
            },
          ]}
          onArtifact={setOpenedCitation}
        />
        <output data-testid="opened-citation">{openedCitation}</output>
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
