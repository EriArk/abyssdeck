# Results handoffs, frozen demos and automatic GPT recovery

## Delivered behavior

- GPT status reads share one pending request. A slow response survives the next
  polling tick; visibility, pageshow and online resume reads automatically.
  A healthy response clears the connection-specific error without erasing
  mutation errors, drafts or uncertain dispatch receipts. Native model-read
  recovery clears a temporary compatibility gate after fresh validation.
- Long markdown/code wraps inside the message in both clients. The chat viewport
  does not scroll horizontally to accommodate a block.
- Results can be staged into the actor's own Work chat or Project Intake. The
  destination binds the exact project, checkout, conversation and binding revision.
  Preparing a handoff does not send a turn. Attach explicitly, keep the draft,
  and send normally. Intake creates its diagnostic thread only when attaching.
- Snapshot SHA-256 and original bytes are retained. Attachment retries reuse the
  same UUID; account/destination changes and already-sent copies are rejected.
  Read-only Intake still uses its existing execution policy and durable receipts.
- New file-based HTML preview snapshots capture explicitly referenced local CSS,
  CSS imports/assets, classic JS, literal module imports, images and fonts. An
  import map preserves shared module evaluation and cycles. JSON script data is
  left intact. Network, credentials, parent access and navigation remain blocked
  by the existing isolated preview boundary. Old snapshots remain immutable.
- Bundling has parser/preview budgets (64 assets, 2 MiB per read, 16 MiB source,
  32 MiB packaged output, 30-second work deadline). These do not limit downloading
  original files. Missing, escaping or oversized dependencies cannot persist a
  partial preview. No broad directory capture or external URL fetch is introduced.
- Nested Intake preserves its parent Results/share window and draft. Header
  controls stay in a row; parent-window CSS does not restyle a nested header.
  In-app help documents the new handoffs and automatic recovery.

## Verification

Linux TypeScript builds and production web build pass. Focused tests: 47 passing
across connection/native provider, Results staging, Intake, communication,
preview capture/path bounds and help. Chromium and WebKit verify delayed status
responses longer than the polling interval, automatic clearing after a failed
manual check, network wake, retained drafts, no sends and 24 message layouts each.
Both engines verify Work/Intake handoffs, reload, no automatic turns and 16 themed
sharing layouts each. Nested Intake visibility and header alignment are checked;
actual phone/tablet screenshots were inspected. Both engines execute frozen CSS,
classic JS, cyclic modules and dynamic imports. Existing preview-isolation checks
pass 25 attack vectors per engine with no unexpected requests.

Live read-only incident evidence: the reported conversation returned history
successfully, its recent jobs were completed, and native status/models were
healthy. A separate paused unknown dispatch was retained unchanged. No production
prompt was sent as a health test. UI recovery fix was published independently as
153da2c so it does not wait for engine maintenance. The full release is subject to
the existing idle guard; no active work is interrupted.

No Windows installed-helper contract changed: local preview dependencies use the
existing bounded SSH file-read transport. Physical iPhone/iPad acceptance remains
pending the owner's normal use; browser WebKit checks do not substitute for it.

## Continuation: destination changes and module identity

The later proposal to implement this packet again was stale: `1ed3c98` already
contains it, and `2221c43` adds copy reclamation. At this continuation's start,
engine `338ef6a` was installed and therefore included both earlier stages.
The Roadmap, sharing guide and historical audit follow-ups now distinguish that
implemented behavior from remaining native-adapter activation.

Two regressions were reproduced against the unchanged implementation:

- Starting attachment staging in Work A, navigating to Work B while its response
  is held, then receiving A's response could leave B's Attach button disabled.
  The handoff UI now owns its request/lock/error state per exact destination.
  A late response never adopts a file into another destination. The immutable
  server-side copy in A remains available on return or reload.
- Two different JS source modules with identical bytes collapsed to the same
  data URL and only one executed. Frozen modules now have opaque per-source URL
  identities, including query/fragment variants; entry scripts and imports use
  the same mapping. Repeated imports of one source still execute only once,
  while distinct equal-byte sources execute independently. Private paths stay
  out of the frozen URLs and the existing sandbox/CSP remains unchanged.

Verification: 29 focused server tests pass, including sharing, Intake, lifetime,
preview capture and help. Chromium/WebKit reproduce and then pass the delayed
cross-chat attachment case with separate drafts, reload and no model sends, plus
16 themed sharing layouts each. Both engines execute equal-byte modules, repeated
imports, URL variants, cycles and dynamic imports without asset requests. Existing
preview isolation is checked separately. Phone Intake and wide sharing screenshots
were inspected; physical-device acceptance remains pending. No Windows helper or
native GPT protocol changes are part of these two corrections.

### Follow-up release handoff

`d6933eb` is committed and pushed to `main`. The exact clean release passes
repository checks, both TypeScript checks, production web/image builds and the
isolated production-image smoke. Both engines also passed all 25 existing preview
isolation vectors with zero external/unexpected Hub requests.

The web fix is published, manifest
`3f5206b895b3b6194704cc04b1ad4ba9d821cd1171a02744b5ae10f2c9e569d1`.
At handoff, engine `338ef6a` remains installed; `d6933eb` reports `waiting` through
`codex-web-result-edge-d6933eb.service` after ordinary admission returned
`idle: false`. Thus the destination UI fix is live, while the new module packaging
requires engine activation. Existing frozen HTML snapshots intentionally retain
their original bytes. The previous native GPT adapter remains unchanged and its
already-built replacement remains a separate guarded installation task.

Private Linux lab evidence uses the `result-edge-` prefix: `tests.log`,
`handoff-chromium.log`, `handoff-webkit.log`, `preview.log`, `isolation.log`,
`release-build.log`, `image-smoke.log` and `verification.json`. The two
`*-before.log` files retain the reproduced failures. No active native task was
restarted and the owner's deferred paused send was not inspected or reconciled.
