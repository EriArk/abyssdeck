# Native GPT read isolation — #220, 27 September

Hub transport and the private native service now use matching bounded lanes:
canonical/navigation/model/source reads (two concurrent), media reads (one,
preserving mutable stream offsets), mutations (one, FIFO), and existing live/status
reads. Each Hub lane admits at most 64 pending/active calls; duplicate safe reads
share only an in-flight promise. The service also bounds direct gateway clients.
Read-only scheduled-task/activity requests use the read lane; unknown operations
remain conservative mutations. Parallel mutation execution is not enabled.

The transport rechecks authorization when starting queued work and returning shared
reads. The service binds its own user/account identity, rejects unknown fields,
and preserves renderer account verification, bounded bodies and timeouts.
Account rate-limit cooldown still applies across lanes, with no automatic resend.
Manual recovery remains an account boundary: acquisition waits for active reads,
media, live and writes; its lease blocks new canonical reads while login may change.
Available Hub history snapshots remain independent of that native boundary.

Mutation admission/start/completion invalidates read coalescing. A delayed renderer
history response may return to its original reader, but cannot replace a newer
cache generation or repopulate a snapshot invalidated by dispatch. Such navigation
snapshots are not mutation receipts. Existing exact-conversation send guards,
three-failure recovery limit, unknown receipts and no-replay rules are retained.

## Verification

48 focused tests pass, including a real private Unix-socket service/client with
dispatch held for 20 seconds, plus 93 related native recovery, uploads, receipts
and history regressions. Chromium and WebKit exercise native-provider UI, lost
acknowledgement, one-send-only completion, reload and phone/tablet draft continuity.
This is controlled automated evidence, not physical iPhone acceptance or proof
that OpenAI itself always responds quickly.

## Installation boundary

Deployment requires both Hub client and native service/renderer changes. Preparing
an image or publishing assets alone does not install this fix. Preserve profile,
account and receipt state; apply the ordinary guarded idle upgrade and verify the
running modules. The live preflight found one unknown owner GPT job: no native
restart, receipt deletion or replay was authorized by that finding.

The P0 transport/read coupling is addressed here. The audit's P1 account-wide
admission for edit/regenerate and project/library/workspace mutations remains a
separate narrowing task; do not mark all of #220 complete or remove those guards
without exact-scope receipt checks. Windows runtime lifetime (#229) is unchanged.


Later checkpoint, 27 September: Hub and engine `44a5d7c` are running and healthy.
Owner/member native service images remain staged; the unfinished GPT receipt still
prevents their ordinary restart. The separate Windows runtime follow-up is recorded
in [Project entry/runtime verification](PROJECT_ENTRY_RUNTIME_2026-09-27.md).
