# GPT reliability audit — 2026-10-07

Scope: the owner's failed preparation screenshot, followed by a request to review
the whole GPT integration. This is a code and live-operation audit, not a claim
of complete native feature acceptance. No user prompt was submitted or replayed.

## Observed installation

- Gateway and engine reported healthy, using image `00c8adc`; native owner runtime
  was `26.928.31416-f7347ec`. These are installed versions, not the current Git HEAD.
- The host was reachable with uptime of 28 days. The filesystem had about 925 GiB
  available. CPU was not saturated in the short sample. Swap was almost full;
  one sample showed swap-out activity, but this does not establish memory pressure
  as the cause of the reported send failure.
- Bound local account/activity verification completed in 37 ms, with
  `ready=true` and `generating=false`. A canonical read of the affected conversation
  completed in 3.6 seconds and returned 282 graph nodes. A blanket restart was
  therefore not warranted.
- Model reads returned `NATIVE_RATE_LIMITED` in 30 ms and, later, 11 ms. Meanwhile
  local readiness returned `healthy/canSend=true`. Fast rejection may come from
  the adapter's existing cooldown; it is not evidence of a new upstream 429 for
  each probe. No cooldown was bypassed.
- The failed job had one preparation retry and no surviving prompt/error after
  dismissal. Its exact original error cannot be reconstructed from that row.
  The current rate limit is confirmed; attributing that specific attempt solely
  to a rate limit would overstate the evidence.
- A separate job created on October 3 remained `idle`, with its receipt checked
  every 30 seconds on October 7. Polling updated its timestamp despite no new work.

In a bounded 30-minute engine log window there were 696 job GET records, 326 native
operation GET records, 324 project operation GET records, 74 history GET records,
and 36 records each for catalog and projects. Gateway forwarding duplicates some
entries. These are **Hub HTTP records, not upstream GPT request counts**. Catalog
and projects each had 24 HTTP 500 records. Operation/job reads mostly read local
state; their number alone does not prove upstream overload.

## Current structure

```text
GptWorkspace / useGptHistory / navigation / result and operation panels
    -> authenticated Hub routes
    -> GptService (outbox, history/cache, background watching, provider selection)
    -> NativeGptProvider + NativeGptJobs (readiness, exact send receipts)
    -> NativeGptReadClient (per-account lanes, coalescing, metadata cache)
    -> private Unix socket / NativeReadService (read/media/write admission)
    -> NativeRendererReader (private pipe, native-owned operation completion)
    -> pinned ChatGPT modules (account, HTTP, actions, native response stream)
```

The durable outbox/receipts and single native writer are useful and must remain.
Problems arise where the layers disagree about time, activity, and availability.

## Findings and changes

| Finding | Evidence / effect | Disposition |
| --- | --- | --- |
| Idle receipts never expire | `canPoll` only checked failure pause / next check. `readReceipt` scheduled every idle result for another 30-second check. The live old job confirms this path. | Fixed in source: durable five-minute idle watch, renewed only by actual changed output or explicitly opening that conversation. Restart and unchanged reads cannot renew it. Real running jobs keep their monitor. |
| Receipt checks manufactured history activity | `pumpNative` treated any non-unknown result as refreshed; `invalidateNativeJob` renewed the history watch and warmed its cache even for unchanged idle output. | Fixed in source: reconciliation reports whether state/content changed. Unchanged receipts no longer invalidate or warm history. |
| Outer deadlines interrupt valid inner reads | Preparation comprised navigation, models and history; Hub allowed 25 seconds, renderer dispatch allowed 20, ordinary history/models allowed 60. Receipt history had only 15 seconds. The HTTP disconnect did not itself cancel renderer evaluation. | Repaired after owner clarification: remove duplicate Hub/renderer/history/startup deadlines. Native network code reports completion/error; transport loss and explicit cancellation still settle calls. No mutation retry was added. |
| Read-only receipt checks flushed navigation caches | Every serial-lane operation invalidated metadata before/after, including `prepareDispatch` and `reconcileDispatch`. | Fixed in source: preserve serial admission but retain account metadata for those two non-mutating operations. Actual dispatch/mutations and instance/manual changes still invalidate it. |
| Cooldown is not propagated as a scheduling deadline | Native gate knows Retry-After, but private service returns only an error code. Hub preparation retries after a fixed minute, once. An account cooldown can last longer. | Repaired: typed errors carry the actual retry deadline through renderer, socket, Hub and accepted outbox. Honor explicit Retry-After without an added minimum. Preflight can remain queued through repeated cooldown/busy responses; no upload or send is replayed. |
| Local readiness is presented as full send availability | Local health deliberately avoids upstream probes; a ready shell can coexist with a model/history cooldown. | Repaired queue/error presentation: keep local readiness and show the actual observed operation error. No extra upstream probes were added. Local readiness still does not promise upstream success. |
| Read failures have inconsistent API treatment | History maps native rate/busy errors into 429/503 with cache retention. Catalog/projects can let the same native errors reach the generic HTTP 500 handler. Live 500s are consistent with this, though individual original codes were not retained. | Repaired temporary/HTTP read-error mapping for all native read endpoints. Preserve native HTTP status/public error; authentication and missing-chat errors cannot use the stale-history fallback. |
| Independent refresh loops still exist | Browser jobs, native/project operations, attention, history, navigation; Hub receipt and incomplete-history watches; native history/cooldown cache. Several coalesce locally, but there is no end-to-end priority/deadline contract. | Open: consolidate account read scheduling incrementally; visible chat/explicit action first, passive metadata later. Measure actual upstream calls before choosing rates. |
| Native integration is version-sensitive | Compatibility mappings target private modules of two pinned builds. Route selection, account checks, stream startup, canonical graph reads and artifacts must agree. | Preserve explicit compatibility checks. A healthy process is not proof that all operations work. Do not replace this with generic GUI clicking or version-check bypasses. |

## Areas reviewed without a new demonstrated defect

- **Bridge Doctor:** background health uses local status and observed ordinary
  operation errors; it does not generate upstream test prompts. Slow reads are
  treated as busy/recoverable. This audit does not support blaming Doctor for all
  upstream traffic.
- **Submission safety:** Hub persists intent before dispatch; native ledger keeps
  the exact operation identity; ambiguous acknowledgements are reconciled by
  reading. Partial public output and source identity survive failed completion.
- **Files/results:** attached files have upload fingerprints and receipts; result
  extraction uses public message identity and the shared history pipeline. This
  was source review, not a fresh live upload/download test of every format.
- **Cache separation:** browser presentation cache, Hub memory/disk history,
  native public projection and native canonical cache have different roles.
  None should be substituted for fresh mutation/account admission. Multiple
  caches are not inherently a fault, but invalidation and telemetry need one
  documented contract.

## Verification and activation

Source changes have focused regression coverage for idle expiry, reopen/restart,
unchanged output, preserved dispatch count, slow preparation/receipt reads and
metadata retention. Linux checks use isolated temporary fixtures and the compiled
candidate modules, not the running engine's files or the owner's native profile.
The seven-file Linux regression run passed 120/120 tests. The metadata-retention
test passed separately on Linux; the inner slow-history receipt test passed on
Windows. TypeScript build passed. Focused Biome checks reported no errors (existing
warnings/informational diagnostics remain). The initial Windows run encountered
the existing Linux-only `process.getuid` fixtures; those checks were rerun on Linux.

The production Hub and native adapter have **not** been replaced by this audit.
Both need coordinated ordinary activation for the timeout changes. Active work,
native account state and all uncertain receipts must survive that activation.
Successful fixture tests do not establish that upstream rate limiting has cleared.

Next bounded stage: expose cooldown timing and operation-stage diagnostics without
message contents, then make the accepted outbox wait appropriately before any
upload/send begins. Follow with shared read-error handling and measured scheduling.

## Owner-authorized repair following the audit

The subsequent owner instruction makes native operation outcomes authoritative.
It supersedes the first pass's longer outer timers: there is now no duplicate
elapsed-time failure around native history, renderer calls or stream startup.
The installed pinned native network implementation was inspected read-only and
has its own request/stream error handling. Local heartbeats, IPC cancellation,
resource bounds and exact account/branch admission remain separate concerns.

- Native stream `onError` exposes only a bounded public message, HTTP status,
  provider code and retry deadline. Diagnostics, stacks, headers and native
  objects do not cross the private protocol. Both receipt ledgers retain errors,
  partial public output and uncertain delivery; completion supersedes old errors.
- Repeated temporary read failures no longer pause a chat permanently or cancel
  its queued text. Genuine compatibility/identity/receipt failures retain review.
- Waiting for acknowledgement no longer becomes a warning just because two
  minutes elapsed. This changes presentation, not dispatch permission.
- In-flight canonical history stays shared even beyond ordinary cache expiry.
  Actual native cooldown is shared across Hub upstream reads. Idle-watch expiry
  from the first pass remains: old inactive work must not poll forever.

The final Linux repair run passed 310 tests, including native dispatch, uploads,
read isolation, history, polling and Team checkpoint/rollback cases; nine native
adapter upgrade tests also passed. Linux build and both TypeScript checks passed. Chromium and WebKit
passed shared GPT UI, lost-acknowledgement, native-error, preserved-text and
phone/tablet draft checks. One first WebKit run reported its intermittent aborted
same-origin request error during reload; the same unmodified test passed on rerun.
Final source checks and activation are recorded in CURRENT_STATUS. No real user
prompt was submitted or replayed for these checks. No claim is made that an
upstream rate limit has disappeared or that previously discarded errors can be
reconstructed.
