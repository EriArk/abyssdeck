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
