# Result copy lifetime — 27 September 2026

The completed Results forwarding/HTML packet left immutable forwarding copies
without a collection policy. This stage adds bounded reclamation of unreferenced
copy bytes, retaining source identity, metadata, hashes, grants and operation
receipts. It does not delete original Results, human attachments, Work/GPT upload
copies, native jobs or pending dispatch receipts.

## Policy

- An unreferenced preparation is eligible after seven days without use. Reads and
  explicit preparation renew it. First revoke/cancellation starts a fresh grace
  period; repeated cancellation does not perpetually renew it.
- Any active publication or non-dismissed handoff protects the snapshot, including
  copied attachments that could belong to a draft or an uncertain send. We do not
  infer abandonment from age, missing machine connectivity or changed membership.
- Removing the original source does not remove a published immutable copy.
  Downloads/previews still revalidate current destination membership and revocation.
  Copies already downloaded by another person cannot be remotely revoked.
- Collection runs hourly and before a new capture, with 50 candidates per pass.
  Indexed reference checks and durable tombstones prevent publication from using
  a collected copy. Failed unlink remains charged to quota and is retried. Paths
  stay inside the exact shared-result directory; nonregular/symlink targets are
  retained for inspection. Existing installations get a full initial grace week.
- Receipts and tombstones remain. Repeating an expired capture key reports expiry,
  without silently recapturing or publishing. An explicit Retry prepares again
  from a still-authorized source with a new capture key. Only this confirmed
  preparation expiry clears its browser key; uncertain send keys remain intact.
- Exact immutable bytes can reuse the old snapshot identity after an explicit
  recapture. Revoked grants/dismissed handoffs stay revoked/dismissed. A crash
  between writing restored bytes and updating metadata is reconciled by hashing
  those bytes, never by overwriting an unexpected file.
- Cancellation during asynchronous Work/Intake/GPT attachment preparation is
  checked again before returning/adopting the result; late work cannot reactivate
  the handoff. Already staged destination bytes are conservatively retained.

The additive team table `result_snapshot_lifetime` is included in SQLite backup.
Backup/restore omits logically collected binary copies, keeps metadata and
receipts, and supports earlier snapshots without this table. Personal schema
stays 29. Windows helper protocols and installed files are unchanged.

## Interface

Progress panels in both clients have the same 36px visible height as the message
arrows, with aligned edges. Transparent vertical hit extensions keep progress and
stop controls accessible over 44px. Help documents forwarding-copy retention.

## Verification

Linux TypeScript/production build and focused lifetime, sharing, Work/Intake,
maintenance and help tests. Coverage includes expired capture and exact retry,
explicit recapture, restart/backup/restore, source deletion, membership revocation,
protected pending/copied handoffs, grace renewal, immutable destination bytes,
unlink failure and bounded processing, Work/GPT cancellation during staging.
Chromium/WebKit cover confirmed-expiry preparation retry, Work/Intake forwarding,
reload/drafts, zero automatic sends, 16 sharing layouts per engine, and progress
height/alignment across four themes and phone/keyboard/tablet/wide layouts.
Actual screenshots inspected. Physical iPhone/iPad acceptance remains pending.

## Delivery boundary

The compatible UI can publish without restarting chats. Backend reclamation and
cancellation fixes require the packaged engine through ordinary idle maintenance.
No forced activation and no investigation/reconciliation of the old paused GPT
send are part of this stage. Retention only starts after this engine is installed.
