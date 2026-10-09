# GPT chat content support

Reviewed October 8, 2026 against the current source, the owner's reported
screenshots and seven locally retained public answers from the affected chat.
Private chat samples and screenshots stay outside Git. This is a coverage
inventory, not a claim of full ChatGPT interface parity.

## Current display path

The native adapter reads the canonical conversation; `gpt-history.ts` projects
public messages and supported asset references. `gpt-links.ts` resolves known
native references. `GptMessageText` renders answers with the shared artifact,
table, image and code handlers. `GptSteps` renders public progress with Markdown.

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
| Native inline references | `Entity` retains its visible label/disambiguation; `Link` renders its supplied HTTP(S) destination. Unresolved `Cite`/`AsyncImage` show an unavailable-content label. Search IDs and image queries are not URLs and are never guessed. |
| Source citations | Existing `content_references` URL/webpage/grouped-webpage markers resolve to links. Bare JSX-like `Cite` IDs without a resolved URL still need a native metadata adapter. |
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

Remaining format work should start with exact public native metadata for
citations/images and rich widgets, then dedicated math/diagram rendering and
native media. Preserve unsupported visible content and exact source identity
until each adapter is implemented. Do not treat public API documentation as proof
that every native-client feature has an available integration contract.

## Verification

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
