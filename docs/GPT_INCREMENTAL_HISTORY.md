# GPT incremental history and Results — 2026-09-23

This stage reduces repeated work between the Hub and browser. It does not replace the native canonical conversation read with an undocumented upstream delta API.

## Behavior

- Public messages have per-message fingerprints and cumulative prefix versions. Unchanged messages retain object identity. An unchanged poll reuses the history array and avoids rewriting the full private disk snapshot; freshness is persisted at least hourly during continuing reads.
- A bounded journal of 16 versions allows the browser to request a changed suffix of at most 20 messages. The delta binds the exact base revision and replacement/predecessor identity. Older loaded messages, scroll state and draft remain intact. Unknown versions, large missed bursts and unmatched anchors fall back to a canonical page. Native branch changes never concatenate unrelated tails.
- Each retained conversation owns a Results projection. Only changed messages repeat Markdown/artifact/demo extraction. Public reasoning groups, duplicate link precedence, file identities and category counts match the canonical projection. Projection memory is charged to the existing shared history budget; no separate unbounded cache or binary prefetch is added.
- Results first-page refresh negotiates a revision, unchanged response or bounded upsert/removal delta. Loaded older pages and unchanged cards remain mounted. Missed additions extending beyond the current first page, edits in older turns, expired journals and unknown versions return a replacement page to avoid gaps. Several individually small missed updates are checked together.
- Exact result navigation and cached metadata still require current authorization and library visibility. Authorizations are rechecked after asynchronous reads. Account-local browser caches retain their existing bounds and logout invalidation.

## Verification

Linux typechecks, production web build and changed-file Biome pass. The focused suite has 38 passing checks across incremental history, continuity, cache/session retention, public progress, links and text/result artifacts.

`tests/gpt-incremental.test.mjs` exercises a 1,000-message history, same-length edits, deletion, branch replacement, invalid/expired revisions, snapshot restart, hourly disk refresh, full/indexed Results parity, missed bursts and actual Hub routes with separate account stores and revoked access. Adding two messages sends two messages instead of twenty. A 50-demo fixture is extracted 50 times initially, zero additional times for an unchanged snapshot, and once for one changed message.

`tests/gpt-incremental.browser.mjs` runs the actual hook and ResultFeed in Chromium and WebKit against real cache/index contracts. It verifies loaded older pages, unchanged DOM nodes, scroll and draft continuity, image DOM/request stability, branch replacement and read-only refresh. Existing history recovery and Results links/demo browser suites pass in both engines; the latter covers four themes. Physical iPhone/iPad acceptance remains deferred to owner use.

## Delivery and remaining scope

Hub/web/shared contracts change together. Windows helpers and the native connector contract do not change in this stage; there is no helper replacement or native process restart. Release installation uses the ordinary idle guard and is tracked separately from source completion.

Native graph fetching and public normalization still examine the canonical graph. The projection/delta journal is memory-resident; existing private disk snapshots restore history after restart, while a missing projection is rebuilt once. A durable incremental native ingestion/projection store and complete closure of #188 are not claimed here.

Next owner-selected stage: Brainstorm, after explicit continuation; recommended reasoning **Очень высокое (`xhigh`)** for room lifecycle, shared materials, permissions and transition into a project. Additional access downgrade/removal work remains deferred.

## 2026-09-27: durable display and native IPC revisions (#188)

The existing normalized public history is now retained by a private 64-chat /
64 MiB disk LRU, without the seven-day expiry. Reading a snapshot updates its
retention recency, not its canonical checkedAt. Initial display uses the existing
cached-first route and refreshes in the background; receipts/mutations never use
stale display fallback. Snapshots and suffix journals remain under Results/gpt,
inside the existing account backup/checkpoint tree. No new database or second
durable history store is introduced. Confirmed removal still clears both files.

A capability-negotiated `readHistoryUpdate` operation reduces adapter-to-Hub IPC.
A full public topology establishes a SHA-256 revision; subsequent replies are
unchanged or exact changed-node/removal deltas against that revision. Older edits,
branch truncation and attachment changes participate in the revision. Unknown
adapter bases return full topology; the Hub validates ancestry and uses at most
one full read for an incompatible delta. A restarted adapter clears the Hub's
protocol baselines. Old installed adapters keep the canonical compatibility path.

The protocol baseline is memory-only, per client/account, bounded to eight graphs
and 16 MiB; renderer projection bytes count against its existing 64 MiB transport
budget. Immutable unchanged graphs skip public normalization, and unchanged node
objects skip repeated content fingerprinting. Canonical conversation/action,
receipt and media readers still use their original operation. No sends or
recovery actions are triggered by display synchronization.

**Upstream boundary:** inspection of the pinned 26.915.31945 native bundle found
its conversation query using the full GET, including stream polling. No supported
delta/tail or revision endpoint was established. This change does not invent one
or use timestamps to assume older content is unchanged. After transport expiry a
full upstream GET/projection is still required. Therefore #188 remains partial:
IPC/normalization and durable display improve; incremental upstream ingestion is
not claimed. First background sync after Hub restart establishes a new baseline,
while the stored normalized page is already available to the browser.

The 300-message fixture measures 582,322 bytes for full IPC, 154 for unchanged and
2,342 for one appended message. These are synthetic IPC bytes, not upstream
network bytes or physical-device latency. Focused tests cover old edits, branch
replacement, late files, duplicate content with different IDs, wrong bases,
ancestry/cycles, coalescing, account isolation, compatibility, restart, disk LRU,
canonical parity and unchanged send/media boundaries.

### Related owner-reported navigation corrections

GPT pinned rows preserve native list order instead of sorting by recent work.
Project-bound pins are reachable in the main pinned list too. A live read found
all eight upstream pins, but only seven displayed: the missing entry has an
existing local confirmed deletion queued, never attempted. That tombstone was
not undone and native deletion was not forced by this investigation.

Message arrows now start selection at the visible end in the chosen direction,
then step by exactly one ID. Partial clipping never moves the viewport. Pointer
focus prevention is mouse-only: cancelling touch pointerdown suppressed the
click in the WebKit touch fixture. Draft, pagination and completion-follow state
remain intact. The in-app guide and AGENTS record these rules.

The focused Linux suite passes 90 checks; TypeScript and the production web build pass. Chromium and WebKit exercise both clients, touch selection, older-page boundaries, drafts, all themes and pinned ordering/expansion. Actual compact screenshots were inspected. Physical iPhone acceptance remains pending owner use.

Delivery is recorded in the stage handoff. A built native adapter image is not an
installed runtime; ordinary idle/recovery guards continue to apply, and the old
paused send is intentionally not inspected, reconciled or replayed.
