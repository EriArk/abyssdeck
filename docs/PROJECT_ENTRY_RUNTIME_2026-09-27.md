# Runtime continuity and project entry — 27 September 2026

This stage combines #229 / the runtime remainder of #132, #181/#224/#227/#228
with direct Issue creation (#172), and Project Home/setup #222/#225/#226.

## Codex runtime ownership

Protocol CODEX2 moves the native App Server lifetime into the same-user Windows
Companion. SSH remains stdio-only; no network listener is introduced. Each private
Hub database stores a random capability and a hash of user/epoch, exact machine,
launcher, allowed roots and anchor directory. Initialization binds the native
instance and account identity (subscription plan is not identity). Only one live
controller can attach. Controller RPC IDs are namespaced per native instance so
late responses cannot resolve a new connection's calls.

Detach keeps the process, active native thread/turn IDs and unanswered requests.
Pending questions are bounded (64 / 8 MiB), frames 16 MiB, outstanding calls 128,
runtimes 8. The Hub reconnects the same process, verifies identity, then enables
notifications and restores pending requests. Canonical exact-turn history rebuilds
completed public messages/Results; an old inProgress record requires matching live
Companion evidence. Recovery stops after three failed exact checks. Prompts and
ambiguous answers are never replayed. A fixed authenticated missing-runtime reply
permits only a later fresh connection; old unknown work remains unknown.

Normal idle close and explicit confirmed desktop force handoff are separate from
connection detach. Companion termination, Windows restart and power loss still
terminate its processes. Native queues and unrelated GPT/Git/transfer receipts
keep their ordinary maintenance guards. Engine maintenance may exempt only exact
live Companion-backed Codex turns; merely setting the configuration flag, reading
an old DB row or matching a PID does not grant that exemption.

Migration 29 adds private runtime bindings. Public assets require schema 29 and
must ship with the engine. CODEX1 remains compatible for older installations.

## Installed Windows helper and activation

`Install-Companion.ps1 -Persistent` installs `companion-persistent` and the limited
interactive `CodexWebCompanionPersistent` task with a distinct same-user pipe.
This allows verification beside an active legacy installation; it does not replace
or stop that installation. Existing target reinstall requires an idle stopped task,
backs up its directory/task, and retains configured native runtime/roots.

On the owner's PC the new task was actually installed and checked from Hub → SSH.
A disposable real native turn was detached while inProgress, then reattached to
the same PID/instance and read to completed with its exact answer, without resend.
Installed executable SHA-256:

- Companion: `55faedf5852bdf91e5c79c6cccf5ffbe0879cd27046f0d41a2ead5982ad4b5a5`
- Bridge: `75c3e6d44e39fb148cfe00692bef4318bee26661aa3c1abd070426f903b6980a`

Activation requires selecting that launcher and `codex.persistent: true` at the
coordinated engine restart. The old task/directory remain the rollback path.
The currently running legacy chats were not disconnected to perform this check.
This is owner-PC evidence, not installation on an offline member PC. Legacy member
connections retain their existing guarded behavior until that PC is updated.

## In-app navigation and project entry

Assistant Markdown, shared Markdown and existing human references recognize exact
GitHub Issue/PR/full-SHA commit links. A known project resolves internally through
its own authorized checkout; repository mismatch is rejected before probing the
object. Unknown source projects use the existing explicit working-copy picker.
External GitHub is secondary. Source windows retain the mounted parent and draft.

WindowScope/WindowHeading give related tools consistent title/context, compact
controls, nested Back and Close. Visible intents are Work, Discuss, Analyze task,
Create Issue and Prepare Issues. The Project Overview and Project GPT now have
separate React key namespaces: retaining both exposed an old duplicate-key bug
that otherwise accumulated modal copies and covered the current editor.

Direct Create Issue stores a personal durable draft/receipt, reuses the existing
numeric GitHub identity/repository review and requires the existing explicit
publication action. Reopening restores the exact pending package; completed
publication clears only its own local draft. It does not send a GPT request.

Home reads existing state into Now, Next and Project, retains cards during refresh,
and keeps context/settings behind a disclosure. Work opens the current Codex chat;
Discuss opens that project's private GPT. Material inspection retains Home beneath
it, while actual navigation to another chat/result closes Home.

Creation begins with a new folder, an existing folder, GitHub or an idea. GitHub
selection comes first for that intent; existing-folder flow preserves its Git and
skips redundant GitHub setup. Infrastructure/profile options remain available in
a disclosure. Existing project setup fingerprints, review, receipts and uncertain
recovery remain the authority. Brainstorm uses the existing room creation flow.

## Verification and release boundary

- 49 focused backend checks: runtime binding/recovery, exact live maintenance proof,
  canonical output without resend, references/authority, Issue receipts, project
  setup, migrations, maintenance, Team rollback/admission, turn handoff and help.
- Compiled Windows broker fixture: five independent runtimes, competing controller
  rejection, detach/same-PID reattach, offline approvals and explicit idle close.
- Installed Scheduled Task/native turn continuity check described above.
- Chromium/WebKit project creation, persisted setup recovery and project overview;
  Project GPT send/completion/nested Issues/return, drafts, themes and keyboard.
- Internal commit/manual Issue/nested navigation suite covers sixteen combinations
  of four themes and phone/keyboard/compact/wide geometry in each browser. Actual
  screenshots inspected; phone action descriptions wrap within equal-width peers.

At the live checkpoint Hub/engine `44a5d7c` is installed. This schema-29 release must
wait for ordinary maintenance: two legacy Codex work records and one unfinished
GPT job were still blockers. No forced restart, receipt erasure or resend was used.
Physical iPhone/iPad acceptance is still pending. Native GPT read-isolation service
images from #220 are a separate pending installation, not proven by this helper.
