# GPT chat content support

Reviewed October 9, 2026 against the current source, the owner's reported
screenshots and seven locally retained public answers from the affected chat.
Private chat samples and screenshots stay outside Git. This is a coverage
inventory, not a claim of full ChatGPT interface parity.

## Current display path

The native adapter reads the canonical conversation; `gpt-history.ts` projects
public messages and supported asset references. `gpt-links.ts` resolves known
native references. `GptMessageText` renders answers with the shared artifact,
table, image and code handlers. `GptSteps` uses the same `GptMessageText` renderer for public progress.

The Results index and the history viewer load independently. Previously this
made the request card wait for a separate history/results round trip. The web
now derives the same `reasoning-<native user message ID>` from the durable
confirmed delivery receipt or already loaded canonical message. Canonical
Results replace it without creating a second card. Queued, unconfirmed,
dismissed, other-chat and superseded-branch receipts cannot become new cards.
There is no new timer, native read or message replay. No reasoning is fabricated.

Follow-up: request creation alone did not deliver live content. The stream
observer previously discarded public `thoughts.summary` / `reasoning_recap`
records even though canonical history supported them, and Results ignored the
existing live response. Both use the same public-content projection now. Results
merges exact step identities rather than letting an older full card replace
fresh live steps. Canonical final/incomplete output remains authoritative.
The latest turn's received steps remain accessible in the chat when local
activity ends. This does not declare a remote response finished or running from
elapsed time. Private thought bodies remain excluded. `MemoryCite` becomes a
memory-use marker, with no invented reference destination.

## Coverage

| Content / operation | Current support and limits |
| --- | --- |
| Ordinary Markdown | Headings, emphasis, links, quotes, lists, task lists, tables, inline/fenced code. Original message text remains available for copying. |
| Code and long blocks | Existing copy controls, syntax/editor/artifact workflow retained. Layout parsing retains original source offsets for fenced blocks. |
| Writing blocks | Paired `WritingBlock` renders a themed document card with Markdown and a copy-body button. Title/subject and chat-message/email variants are displayed; original body bytes and surrounding prose are preserved. Literal code stays literal. This does not recreate native editing or send-email actions. |
| File citations | `FileCite` renders a compact file/line-range marker. Exact IDs matching an attachment in loaded conversation history open that file through the existing viewer, retaining its source message. Missing sources remain labeled markers with the native reference in their tooltip; no URL or line-jump capability is invented. Literal code is preserved. |
| Public progress | Request visible on confirmed delivery, public steps appear as received, including Markdown/layout. Private reasoning/tool input is excluded. |
| Native layout in text | `box`, `row`, `col`/`column`, `grid`/`grid-item`, `list`/`list-item`, `text`, `caption`, `heading`/`title`, `badge`, `icon`, `divider`, `spacer`, `markdown`. Numeric spacing, flex/alignment, wrap, columns and common themed sizes/surfaces. This is the observed markup dialect, not a JSX runtime or every ChatKit property. |
| Layout data lists | `{#each [...] as item}` inside a layout repeats its children; optional index and nested local lists are supported. Literal objects/arrays, strings, numbers and booleans supply text and attributes such as `{item.label}` and `name={item.icon}`. No JavaScript execution or action callbacks. Incomplete/unsupported templates remain readable, code examples and original copy/export text remain literal. |
| Layout declarations and conditions | `{@body const name=...}` declares data for following siblings and their children inside the same layout. Strict equality/inequality, Boolean AND/OR, parentheses and ternary choices are interpreted as data expressions. Quoted/bare attributes, numeric or explicit-unit spacing, `{x,y}` padding/margin, numeric RGBA/hex backgrounds, minimum height, text alignment and small text sizes are supported. Explicit grid columns are retained on phones. Function calls, arbitrary JavaScript and unresolved data remain unsupported; original source is preserved. |
| Native inline references (legacy fallback) | `Entity` retains its visible label/disambiguation; `Link` renders its supplied HTTP(S) destination. Unresolved `Cite`/`AsyncImage` show an unavailable-content label. Search IDs and image queries are not URLs and are never guessed. |
| Source citations | Existing `content_references` URL/webpage/grouped-webpage markers resolve to links. The public component adapter also transports resolved `Cite` URLs with exact message/component identity. |
| Images / files / HTML demos | Existing public images, native image assets, attachments, sandbox file links, Results and common preview/download flows retained. An `AsyncImage` search query without returned asset metadata cannot display the original image. |
| Partial / failed answers | Existing public text and files survive incomplete output. Layout fragments stay readable as ordinary Markdown until a complete structural block is received. |
| Chat operations | Existing send, edit, regenerate, branches, library operations, models/effort, project context and schedules are unchanged by this display release. |
| Canvas / interactive tools | Existing explicit native workspace/canvas operations remain separate. Arbitrary widget forms, tool callbacks and embedded app state are not reconstructed from text. |
| Math and diagrams | Dedicated TeX/MathML and Mermaid rendering are not yet present in the GPT message pipeline. Literal source is retained. |
| Native audio/video | Existing dictation and message speech are distinct from rendering arbitrary native audio/video answer payloads. Unsupported payloads retain the existing notice/native-client handoff. |

## Official references and remaining work

OpenAI's [ChatKit widget reference](https://developers.openai.com/api/docs/guides/chatkit-widgets)
describes a structured component schema. Its
[action contract](https://developers.openai.com/api/docs/guides/chatkit-actions)
requires application handling of action payloads; visual text alone is not enough
to recreate an action. The observed lowercase native markup and capitalized
reference tags are not established as that published JSON contract.

The [Responses streaming reference](https://developers.openai.com/api/reference/resources/responses/streaming-events)
separates response lifecycle from output items and public reasoning-summary
events. AbyssDeck's native integration uses its own confirmed receipts and public
history; it does not switch to API billing or fabricate Responses events.

Remaining format work includes dedicated TeX/Mermaid rendering, additional native media and interactive component contracts. Preserve unsupported visible content and exact source identity
until each adapter is implemented. Do not treat public API documentation as proof
that every native-client feature has an available integration contract.

## Systemic correction — October 9

The audit found failures at three separate boundaries, not independent defects
in individual screenshots:

1. A lowercase unknown child invalidated its entire structural parent. The
   parser now contains an unsupported child's exact source in its own disclosure
   while rendering supported siblings. SVG geometry, text, groups, gradients,
   masks and local references use a declarative attribute projection. Paint IDs
   are scoped per mounted drawing. Scripts, event handlers, external SVG
   resources and foreignObject are not executed; their source stays available.
2. Native public component results were discarded before reaching history.
   public-rich.mjs projects only image URLs/labels/dimensions and source
   URLs/labels/snippets from public messages. Canonical graph deltas, receipt
   reads, live events, Hub normalization, saved history and Results all retain
   richReferences. Metadata-only changes update revisions without waiting for
   new text or adding polls. Matching uses the exact component props key or
   explicit resolution ID inside the containing message. No query search,
   cross-message matching, executable DIL or arbitrary appData is exported.
3. Answer steps had a separate renderer and saved receipt commentary was reduced
   to six 500-character snippets. Steps now use the common message renderer;
   receipt commentary keeps full public text. The history normalizer also no
   longer silently cuts a public message at 500,000 characters. Receipt answers
   retain their separate message identities so identical component keys in
   adjacent messages cannot borrow one another's assets. Canonical completed or
   incomplete output wins over stale live snapshots. File citations in Results
   and answer steps open known files through the shared viewer.

The data interpreter now handles arithmetic, numeric comparisons and scoped
{#if}/{:else}, alongside declarations, nested lists and ternary expressions.
Repeated template bodies reuse parsed Markdown rather than reparsing it for
every iteration. Combinatorial expansion beyond the body-evaluation or generated-text budget
falls back to the complete source disclosure for that block; this is a reader
allocation bound, not a message, file transfer or storage limit. Original
copy/export bytes remain unchanged. Partial blocks stay readable until closed.

Image loading, failure and unavailable metadata have distinct labels. The
original resolved image is displayed; a new image is never searched for as a
replacement. Network failure preserves its dimensions and surrounding content.
Malformed optional reference data is discarded without breaking chat history.

The shared regression corpus exercises layouts, SVG/list/condition scopes,
WritingBlock, FileCite, Markdown, literal code, unknown children, delayed image
and citation metadata, duplicate SVG IDs, reopening and both chat/step surfaces.
Native tests check public-only projection, hidden-content exclusion, metadata
updates without text changes, exact receipts, and no extra dispatch.

This coverage does not claim support for every undocumented native component,
TeX/Mermaid, arbitrary Canvas applications, action callbacks or native audio/video
payloads. Unsupported content is preserved rather than silently deleted.

## Verification

### October 9 image/citation follow-up

The native G2 example includes `AsyncImage` with `maxWidth="155px"` and
`aspectRatio="4:3"`. Its unavailable placeholder now honors these dimensions
without taking the text column's intrinsic width. Browser verification checks
the placeholder geometry and remaining text width in actual chat containers.
This fixes fallback layout only, not asset or citation availability.

Read-only inspection of the installed 26.928.31416 package found a separate
public component contract that the native adapter currently drops:

- `metadata.model_dil_v2.appData.opGenui.componentResults`: envelopes with
  `status` and resolved `state`; old data may use `componentData` instead.
- Component keys are `JSON.stringify([componentName, normalizedProps])`, with
  recursively sorted object keys and `__resolutionId`, `__state`, `children`,
  `fallback` excluded. An explicit resolution ID takes precedence over this key.
- `AsyncImage` reads `state.images` plus frame dimensions. `Cite` reads
  `state.items`. A query/search ID alone does not identify the returned asset.
- The implemented projection exports only public, validated display fields, bound
  to the exact message/component; never copy executable DIL code or arbitrary
  appData. Preserve original message text and literal code. Verify against an
  isolated native fixture before production activation; do not use a live
  supervisor inspector probe, which caused an unexpected native restart here.

The October 9 visual comparison fixture includes the actual `layers`/Markdown
header within GPT message containers. Rows stay on one line unless `wrap` is
supplied; wrapped title text remains beside its icon. Neutral surfaces remain
distinct from explicit accent backgrounds in CRT Green, Organizer, Classic Dark
and Hi-Tech 2000. Layout paragraph margins do not inherit ordinary chat spacing.

Focused parser/projection tests cover nested layouts, source offsets, literal
code inside/outside layouts, malformed markup, receipt confirmation, canonical
deduplication and conversation/branch scope. Browser checks exercise the actual
message and Results components with a deliberately pending Results response,
retained draft, Markdown progress, no extra polling, and script/URL rejection.
Chromium and WebKit cover phone (390), tablet (820) and desktop (1366) widths.
The optional private sample input adds the affected chat's actual public output
to the same test without embedding private content in fixtures.

Installation status is recorded separately in [CURRENT_STATUS](CURRENT_STATUS.md).
