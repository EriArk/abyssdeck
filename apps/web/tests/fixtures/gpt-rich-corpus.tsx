import type { GptRichReference } from "@codex-web/shared";
import { useState } from "react";
import { GptMessageText } from "../../src/GptMessageText";
import { GptSteps } from "../../src/GptProgress";
const content = `## Mixed public content

<box gap={3}>
<svg viewBox="0 0 340 165" width="100%" aria-label="Vocal game">
<defs><linearGradient id="paint"><stop offset="0%" stopColor="#5c87f4"/><stop offset="100%" stopColor="#b285f5"/></linearGradient></defs>
{#each [24,48,72,96,120,144] as y}<line x1="8" y1={y} x2="332" y2={y} stroke="#525866" strokeDasharray="3 4"/>{/each}
<rect x="22" y="99" width="72" height="14" rx="4" fill="url(#paint)"/>
<path d="M12 107 L34 107 L50 105 L68 106 L90 106 L105 84 L124 82" stroke="#fff" fill="none"/>
{#if 3>2}<text x="12" y="18" fill="#fff">Score {100*4}</text>{:else}<text>Hidden</text>{/if}
</svg>
<unknown-widget>Keep unsupported content</unknown-widget>
<text>Supported sibling after unknown widget</text>
<row gap={3} align="start"><AsyncImage query="Photo" maxWidth="155px" aspectRatio="4:3"/><box flex={1}><text>Resolved original image and source</text><Cite ref={["r1","r2"]}/></box></row>
</box>

<WritingBlock variant="chat_message">**Hello** — preserve this body.</WritingBlock>

<FileCite ref="file-corpus" line_range_start={2} line_range_end={5}/>
`;
const refs: GptRichReference[] = [
  {
    key: JSON.stringify(["AsyncImage", { query: "Photo", maxWidth: "155px", aspectRatio: "4:3" }]),
    component: "AsyncImage",
    status: "pending",
  },
  { key: JSON.stringify(["Cite", { ref: ["r1", "r2"] }]), component: "Cite", status: "pending" },
];
const files = [
  {
    id: "file-corpus",
    name: "Context.txt",
    mime: "text/plain",
    bytes: 10,
    url: "/api/gpt/files/corpus",
    image: false,
  },
];
export function GptRichCorpus() {
  const [references, setReferences] = useState(refs),
    [open, setOpen] = useState(true),
    [clicked, setClicked] = useState("");
  return (
    <section data-testid="corpus" className="gpt-chat">
      <button
        onClick={() =>
          setReferences(
            refs.map((r) => ({
              ...r,
              status: "resolved",
              ...(r.component === "Cite"
                ? { sources: [{ url: "https://source.test/article", title: "Original source" }] }
                : { images: [{ src: "https://rich.test/rendered.svg", alt: "Original photo" }] }),
            })),
          )
        }
      >
        Resolve metadata
      </button>
      <button onClick={() => setOpen((value) => !value)}>Toggle corpus</button>
      <output>{clicked}</output>
      {open && (
        <>
          <article className="message assistant" data-testid="corpus-chat">
            <div className="message-body">
              <GptMessageText
                value={content}
                rich
                richReferences={references}
                citationFiles={files}
                onArtifact={setClicked}
              />
            </div>
          </article>
          <section data-testid="corpus-steps">
            <GptSteps
              items={[
                {
                  id: "corpus",
                  text: content,
                  state: "completed",
                  richReferences: references,
                  files,
                },
              ]}
              onFile={(file) => setClicked(file.url)}
            />
          </section>
        </>
      )}
    </section>
  );
}
