import assert from "node:assert/strict";
import test from "node:test";
import { nativeRichContent } from "../ops/gpt-native/public-rich.mjs";
import { richReference } from "../apps/web/src/gptRichReferences.ts";
import { layoutAttributes } from "../apps/web/src/gptLayoutData.ts";
import { gptHistory } from "../apps/hub/dist/gpt-history.js";
import { gptResults } from "../apps/hub/dist/gpt-results.js";
import { GptResultIndex } from "../apps/hub/dist/gpt-result-index.js";
import { gptRichAnswers, gptRichReferences } from "../apps/hub/dist/gpt-rich.js";
import { mergeGptSteps } from "../apps/web/src/gptLiveResults.ts";

const key = JSON.stringify(["Cite", { ref: ["r1", "r2"] }]);
const imageKey = JSON.stringify([
  "AsyncImage",
  { aspectRatio: "4:3", maxWidth: "155px", query: "A device" },
]);
const metadata = {
  model_dil_v2: {
    code: "PRIVATE_CODE",
    appData: {
      opGenui: {
        componentResults: {
          [key]: {
            status: "resolved",
            state: {
              items: [
                {
                  url: "https://source.test/item",
                  source_label: "Source",
                  title: "Title",
                  snippet: "Description",
                  secret: "NOT_PUBLIC",
                },
                { url: "javascript:alert(1)" },
              ],
            },
          },
          [imageKey]: {
            status: "resolved",
            state: {
              images: [
                {
                  content_url: "https://image.test/photo.jpg",
                  url: "https://source.test/photo",
                  title: "Photo",
                },
              ],
            },
          },
          private: { componentName: "Execute", status: "resolved", state: { code: "NOT_PUBLIC" } },
        },
      },
    },
  },
};

test("public native asset contract keeps only declarative image/source data and exact keys", () => {
  const refs = nativeRichContent(metadata);
  assert.equal(refs.length, 2);
  assert.doesNotMatch(JSON.stringify(refs), /PRIVATE|javascript|secret/);
  assert.equal(refs[0].sources.length, 1);
  const attrs = layoutAttributes(' ref={["r1","r2"]}');
  assert.equal(richReference("Cite", attrs, refs)?.sources[0].url, "https://source.test/item");
  assert.equal(richReference("Cite", layoutAttributes(' ref="r1"'), refs), undefined);
  assert.equal(
    richReference(
      "AsyncImage",
      layoutAttributes(' query="A device" maxWidth="155px" aspectRatio="4:3"'),
      refs,
    )?.images[0].alt,
    "Photo",
  );
  assert.equal(richReference("AsyncImage", layoutAttributes(' query="A device"'), refs), undefined);
  assert.equal(
    richReference("Cite", attrs, []),
    undefined,
    "references cannot leak from a previous message",
  );
  const explicit = { key: "resolution-1", component: "Cite", status: "pending" };
  assert.equal(
    richReference("Cite", layoutAttributes(' __resolutionId="resolution-1" ref="r1"'), [explicit]),
    explicit,
  );
  assert.deepEqual(gptRichReferences([{ ...refs[0], sources: [{ url: "invalid" }] }]), []);
  const opaque = nativeRichContent({
    model_dil_v2: {
      appData: {
        opGenui: {
          componentResults: {
            opaque: {
              status: "resolved",
              state: { images: [{ content_url: "https://image.test/opaque" }] },
            },
          },
        },
      },
    },
  });
  assert.equal(
    richReference("AsyncImage", layoutAttributes(' __resolutionId="opaque" query="Image"'), opaque)
      ?.images[0].src,
    "https://image.test/opaque",
  );
  const legacy = nativeRichContent({
    model_dil_v2: {
      appData: {
        opGenui: { componentData: { [key]: { items: [{ url: "https://legacy.test" }] } } },
      },
    },
  });
  assert.equal(legacy[0].sources[0].url, "https://legacy.test/");
  assert.deepEqual(
    gptRichReferences([{ ...refs[0], sources: [{ url: "https://user:pass@source.test" }] }]),
    [],
  );
});

test("history, Results, receipts and metadata-only updates retain the same references", () => {
  const refs = nativeRichContent(metadata);
  const message = {
    id: "a",
    author: { role: "assistant" },
    channel: "final",
    recipient: "all",
    status: "finished_successfully",
    create_time: 2,
    content: { content_type: "text", parts: ['Example <Cite ref={["r1","r2"]}/>'] },
    metadata: { codex_rich: refs },
  };
  const graph = {
    current_node: "a",
    mapping: {
      u: {
        id: "u",
        parent: null,
        message: {
          id: "u",
          author: { role: "user" },
          create_time: 1,
          content: { content_type: "text", parts: ["Question"] },
        },
      },
      a: { id: "a", parent: "u", message },
    },
  };
  const messages = gptHistory(graph, "chat");
  assert.deepEqual(messages[1].richReferences, refs);
  const results = gptResults("chat", messages, {});
  assert.deepEqual(
    results.find((r) => r.type === "reasoning").payload.steps[0].richReferences,
    refs,
  );
  const index = new GptResultIndex("chat", {});
  index.update(messages);
  const revision = index.revision;
  const updated = structuredClone(messages);
  updated[1].richReferences = [{ key, component: "Cite", status: "pending" }];
  index.update(updated);
  assert.notEqual(index.revision, revision);
  assert.equal(
    index.items.find((r) => r.type === "reasoning").payload.steps[0].richReferences[0].status,
    "pending",
  );
  const receipt = JSON.stringify([
    {
      id: "a",
      role: "assistant",
      channel: "final",
      text: message.content.parts[0],
      richReferences: refs,
    },
  ]);
  assert.deepEqual(gptRichAnswers(receipt, message.content.parts[0])[0].richReferences, refs);
  assert.equal(gptRichAnswers(receipt, "different branch"), undefined);
  const canonical = { id: "a", state: "completed", text: "Full", richReferences: refs };
  assert.deepEqual(
    mergeGptSteps([canonical], [{ ...canonical, text: "Stale", richReferences: [] }]),
    [canonical],
  );
});
