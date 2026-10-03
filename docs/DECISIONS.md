# Architecture and Product Decisions

This file records decisions and their owner-approved replacements. Dated entries
are not cumulative prohibitions: use the specific later decision for the same
workflow. `AGENTS.md` takes precedence; [CURRENT_STATUS](CURRENT_STATUS.md) records
source, installation and acceptance separately. An old release's limited scope
does not disable a later approved module.

## Current rule map (2026-10-02)

This reconciles existing approvals; it adds no permission gate or new capability.

| Workflow | Current owner decision | Earlier scope it replaces |
| --- | --- | --- |
| Personal server environment and Companion | [October 3 personal Linux decision](PERSONAL_LINUX.md): independent Linux for invited friends/employees, SSH/SFTP through Tailscale, packages/services; Companion maintains the device and its separate capabilities | Codex-centred read-only runtime as the complete product, coupling environment use to chats, and the old blanket ban on user SSH; host/Windows management stays private |
| Files from Git | [October 3 correction](../AGENTS.md#owner-corrected-git-file-entry-2026-10-03): separate window using the existing shared file manager and exact repository/source context | Earlier blanket exclusion from Git/GitHub; Results remain a feed, no second Git-only manager |
| Ordinary app login and authorization | [Computer Use](COMPUTER_USE.md#use): requested login/password input, explicitly supplied or designated account credentials, including test fixtures; scoped authorization persists | Blanket authentication/password-input ban; manual-only login wording |
| Windows GUI access | [Independent Computer Use](COMPUTER_USE.md) through the actor's interactive session and private Companion route, without per-app allowlists | D17's original fixed-App-Server-only release; not the no-public-listener boundary |
| Explicit assistant files and HTML demos | [Location-independent exports](../AGENTS.md#owner-requested-location-independent-chat-downloads-2026-09-26) and [HTML source rules](CODEX_INTEGRATION.md#interactive-html-result-contract), with exact public assistant source identity | Project-root-only capture applies to automatic discovery, not explicit assistant exports |
| Bridge Doctor | [Repair mode](BRIDGE_DOCTOR_REPAIR_2026-10-01.md): account-authorized investigation, edits, tests and ordinary deployment; diagnosis-only remains separate | September 10's universal read-only policy and waiting for every project chat before investigation |
| New manual GPT messages | [Fresh-send admission](../AGENTS.md#owner-requested-gpt-continuation-without-stale-locks-2026-10-01) verifies the canonical branch and preserves old uncertain receipts | Blanket same-chat lock after an older uncertain operation; it does not authorize replaying that operation |
| Manual file work during Codex tasks | [File editor](FILE_EDITOR.md): explicit unlock, exact checkout and conflict handling; native task activity does not disable manual writes | The original read-only inspector and reuse of native/Git idle guards for manual editing |
| Usage display | Native credit balance/unlimited/unavailable state alongside limits and resets (`apps/web/src/UsageLimits.tsx`) | D32's exclusion of credit balances; billing credentials remain private |
| Companion platform sequence | [Universal Windows-first application](COMPANION_APP.md), with account-derived features and Linux direction retained | September 28 Linux-first sequencing for this application |

Current implementation checks for this reconciliation: `previews.ts` distinguishes
captured assistant exports from project discoveries; `bridge-doctor-policy.ts` and
`bridge-doctor.ts` separate repair/diagnosis; `ComputerUse.cs` permits requested
ordinary authentication; `UsageLimits.tsx` renders available credits. This is a
documentation reconciliation, not new installed-runtime acceptance.

## 2026-09-30 — Universal tray Companion, Windows first for the current transition

The owner chose one application with features derived from Hub account rights,
not separate owner/admin/member builds. Windows has immediate priority while the
owner and friend remain on it; preserve future Linux portability. This changes
the sequencing of the earlier Linux-first decision for this application.

The application includes tray access, setup/readiness, bounded automatic recovery
and auto-updates. Preserve the owner's current preconfigured LAN machine and
native work; adopting the UI must not replace active execution workers. Hub user
management/invitations remain in the web, explicitly confirmed by the owner.
Before each next stage recommend a model and effort, then wait for continuation.
See [design and stages](COMPANION_APP.md) and [observed installation/migration](COMPANION_APP_MIGRATION.md).

## 2026-09-30 — Independent Computer Use in the Windows Companion

The owner explicitly approved ordinary app access through an independent GUI
adapter, superseding the earlier fixed-API-only Companion limitation for this
module. Native Computer Use depends on a desktop-owned pipe that disappears at
web handoff; the updated native capture also times out on an unlocked desktop.
Do not weaken its sandbox or remove the native single-writer handoff guard.

`CodexWebComputerUse` is a separate limited interactive Scheduled Task, using
public Win32 capture/input APIs and a same-user local-only named pipe. Its MCP
stdio client runs through the existing App Server/SSH route. There is no extra
Windows listener or browser-supplied arbitrary command endpoint. The owner's
own ordinary applications need no per-app allowlist. Secure desktop and other
users' sessions remain outside the boundary. Observations expire and are consumed
before input; input invalidates other clients' observations as well.

The MCP entry point is a stable local launcher. Immutable source-versioned binaries
remain available to already-running clients; a checked atomic pointer selects the
new release. Desktop package updates cannot relocate or remove these files.
See [operation and acceptance](COMPUTER_USE.md).

## 2026-09-28 — Linux becomes the primary direction

The owner plans to move users to Linux. Managed Server Workspaces and later personal
Linux machines are the primary development direction. Preserve the existing Windows
baseline (projects, files, terminals and Codex); do not remove or migrate its accounts
implicitly. The host remains private and member Linux access ends at their isolated
workspace. Companion sequencing is superseded by the September 30 Windows-first
application decision above. This entry's installer follow-up is historical; use
CURRENT_STATUS for the active queue.

## 2026-09-24 — Brainstorm before a repository

The owner's continuation approves the next Brainstorm stage after GPT incremental history. Rooms are visible to authenticated installation users; following is not an ACL. A common board/chat and per-user private room GPT precede any Project or GitHub choice. Conversion uses an immutable selected snapshot and the ordinary project/invitation workflows. Private summaries are excluded from the common export and other users' GPT context. The room remains available. The bounded voice baseline uses the existing authenticated Hub, no extra PC/public port and no recording. See [implemented scope and remaining acceptance](BRAINSTORM.md).

## 2026-09-23 — Full Shared access includes GitHub Write

The owner explicitly selected **Write**, not Admin. New `direct` grants automatically issue or upgrade repository access using the owning participant's machine account and the recipient's self-verified numeric GitHub identity. Preserve stronger roles; accept required invitations inside the web app through the recipient's account. Durable intents and machine receipts prevent duplicate writes after lost responses. Existing grants synchronize on an explicit owner action. Local removal does not silently revoke independent GitHub rights. See [implementation and verification](SPACE_GITHUB_WRITE.md).

## 2026-09-23 — Activity-based collaboration and confirmed session boundaries

The owner approved the sequence in [Roadmap](ROADMAP.md#current-owner-approved-sequence-2026-09-23): review existing unfinished work, deliver a useful Activity slice, add exact evidence handoff to Project GPT, then reactions/replies/attention and Intake/Issue Drawer. Before each substantial session recommend the exact reasoning selector level and wait for the owner's confirmation that it is set.

Owner clarification: **«Продолжаем» also confirms the recommended reasoning level is set**. Do not ask for an additional confirmation when that instruction arrives.

The 22 September issue updates replace automatic prose Work Reports (#199, closed) with [Activity Timeline #218](https://github.com/EriArk/codex-web-interface/issues/218). Git/GitHub/Result/Review objects remain authoritative; the Timeline indexes exact source events. Notifications represent attention-worthy replies/requests rather than mirroring every event. Ordinary user-created Reports are unaffected. Project GPT stays personal; no new Space GPT is introduced.

The owner has confirmed actual friend admission, Collaboration Spaces and usable personal checkouts in #215/#195/#198. Do not rebuild that base or retain first-friend admission as an unfinished feature. Extend current services for concrete remaining gaps. This owner-reported evidence does not assert every edge-case or physical-device acceptance item has passed.

## 2026-09-21 — Collaboration Spaces take priority

The owner selected [#215](https://github.com/EriArk/codex-web-interface/issues/215) as the authoritative next collaboration UX. A Space organizes existing Projects, people and repositories; it is not a second synthetic code project. Per-project Collaborative/Direct policy, individual checkouts, preserved native threads, personal Project GPT and a simple human chat replace the earlier user-facing Links/Bridges workflow. GitHub owns Issues/PR; optional Codex instructions use local CODEXWEB.md, never managed rewrites of user AGENTS.md. Keep the current lower-level implementation where useful. See the issue for the full creation/acceptance/settings and real two-user acceptance requirements.

## 2026-09-19 — Native Linux ChatGPT evaluation first

The owner approved #193 as the immediate priority and completed sign-in to the official combined Linux ChatGPT/Codex application. That combined UI is acceptable if ordinary consumer GPT works. Evaluate a private Hub-local native runtime, preferring local IPC and considering a native renderer adapter where necessary. Keep the old connector/profile and all Codex recovery available during evaluation. A supported package and successful login do not alone prove a viable replacement; authenticated reads, exact-once disposable sends, media and lifecycle evidence are required. Findings and remaining gates: [GPT_NATIVE_LINUX.md](GPT_NATIVE_LINUX.md).

The protected native connection page uses relative phone trackpad input shared with PC Remote. Browser-based native OAuth opens inside the same private desktop. The owner performs sign-in and any upstream verification; the integration does not bypass anti-bot checks.

## 2026-09-13 — Owner-approved team milestone and stable production

The owner approved [Team Workspace](TEAM_WORKSPACE.md) after an explicit planning discussion. This supersedes the single-user-only product constraint and deferrals of #6/#37. The current Hub gains separate full personal workspaces, initially for the owner and a friend using their own Windows PC, Codex, consumer GPT and GitHub accounts. A complete separate-Hub installer remains deferred.

The first usable result is the friend's independent workspace through an invitation/Windows master with chosen project roots and admin-verified pairing. Both shared logical projects with personal checkouts and narrow links between private projects follow in the same pass. The friend can participate in real PC/mobile acceptance.

Admin manages infrastructure/access metadata and has no implicit in-app private-content or device access. Each private runtime and background receipt has an explicit owner. Migrate existing identities/password/history/files to the original owner without cross-user fallback. Implement revocation and backup ownership with the identity foundation.

Sharing a formerly private project requires selecting existing materials. New Notes/Tasks/Plans/Reports inside an already shared project are visibly shared by default. Personal chats, drafts, accounts, terminals and unpublished evidence remain private. Per-user Current/Previous Chats and Git work remain independent.

Mutual link permission may authorize bounded automatic read-only consultations; implementation remains an explicit target action. A Bridge has a chosen owning project and uses that project's owner's authorized Codex account/machine for coordination. Other projects respond using their own accounts. GitHub memberships and native identities remain separate.

The owner explicitly confirmed the installed `379fa17` is stable and requires staying on it while team changes are prepared. Production UI, engine and database remain untouched by intermediate team development. Candidate code/state/profile namespaces are isolated; use copied snapshots without connecting copied owner native writers. A protected pre-team snapshot, restored separately and verified, is the baseline. Cutover waits for normal release/maintenance checks and protection of newer writes.

The agreed pass includes #149–160, #6/#37 and confirmed bugs. Full Canvas, global GPT-chat search, extra native integrations, full conversation voice, separate-Hub distribution and GitHub Actions are excluded. Documentation plus existing GitHub issues are the authoritative plan/task records. See the current gates in [Roadmap](ROADMAP.md).

## 2026-09-10: Tablet materials and optional previous layout

The owner approved stronger shared theme materials and modest tablet geometry changes,
with a device-local “Прежняя компоновка” option in both clients. Theme and layout
preferences are independent; restoring geometry does not revert functional fixes.
The latest clarification explicitly removes CRT monitor housing: its identity comes
from crisp phosphor text, restrained glow and background raster without wasted space.
See `TABLET_AUDIT_2026-09-10.md` for findings and verification limits.

## D01 — Linux Hub is the only Internet-facing machine

**Decision:** The public website/API lives on the Linux server. Execution machines are not exposed directly to the Internet.

**Consequence:** Public traffic terminates at the Hub. The Hub reaches execution machines over LAN or Tailnet.

---

## D02 — Primary v1 execution machine is native Windows

**Decision:** The first remote target is the user's Windows PC on the same local network as the Linux server.

**Consequence:** Windows behavior is not an afterthought. Command quoting, executable resolution, path handling, SSH behavior and GUI-session limitations must be tested on real Windows early.

---

## D03 — Remote Codex uses SSH + stdio

**Decision:** For v1, the Hub starts Codex on Windows through OpenSSH and talks to `codex app-server` over stdio.

**Why:** This avoids exposing a Codex network service on the PC and lets the existing Windows Codex environment/toolchain stay where it is.

**Consequence:** The Hub needs a robust Windows command launcher and Codex protocol adapter.

---

## D04 — Browser never talks directly to raw Codex App Server

**Decision:** Browser <-> Hub uses our own stable API/event contract.

**Why:** Codex App Server evolves independently. Keeping a compatibility boundary prevents protocol changes from leaking throughout the frontend.

---

## D05 — Local Linux Codex is a first-class backend

**Decision:** The Hub can also spawn Codex locally for projects that live on the server.

**Consequence:** UI behavior must not depend on whether a project is local or remote.

---

## D06 — Project is the primary object

**Decision:** Navigation is project-first. A project maps to a machine and absolute working directory.

**Consequence:** The user opens `Case Maker`, not `Windows-PC -> C:\...`.

---

## D07 — iPad 13 landscape is the reference wide UI

**Decision:** Primary wide-workspace client is a 13-inch iPad in landscape, preferably installed as a standalone PWA.

**Consequence:** Touch-first behavior, independent pane scrolling, software keyboard handling and safe areas are core requirements, not polish.

---

## D08 — Three-zone layout for wide workspace

**Decision:** Main landscape layout is:

```text
Navigation | Codex Chat | Results / Files / Activity / Remote
```

Chat remains clean. Results are a separate chronological feed.

This layout is for sufficiently wide workspaces. It must not be blindly compressed onto iPhone.

---

## D09 — Remote Desktop is embedded and secondary

**Decision:** Remote appears as a mode of the right pane on wide layouts and can expand fullscreen.

On mobile, Remote becomes the primary full-width workspace view while active rather than being placed beside Chat.

Preferred transport is Windows RDP through Apache Guacamole when the Windows edition supports RDP hosting. The provider remains abstract so VNC or another Guacamole-supported transport can be substituted.

---

## D10 — Do not assume SSH shares the interactive Windows desktop

**Decision:** Processes launched through Windows OpenSSH are treated as non-interactive relative to the user's visible desktop.

**Consequence:** v1 must not promise that GUI apps launched by SSH-hosted Codex appear in Remote Desktop or can be automatically screenshotted from the SSH process.

---

## D11 — No custom Windows network agent in v1

**Decision:** v1 does not require a custom daemon/listener on the Windows PC.

**Timing superseded:** D17 brought forward the local-only App Server Companion;
the September 30 [Computer Use decision](COMPUTER_USE.md) approved interactive
app access. Same-user local IPC and no public Windows listener remain current.

---

## D12 — Hub storage uses SQLite + filesystem

**Decision:** Single-user Hub metadata lives in SQLite. Binary results/artifacts live on the Hub filesystem with metadata in SQLite.

**Consequence:** Do not introduce PostgreSQL/Redis/object storage without a demonstrated need.

---

## D13 — Single-user authentication

**Decision:** There is no public registration or multi-user permissions model in v1.

**Still required:** strong password hashing, session security, rate limiting and normal web protections.

---

## D14 — One UI implementation, multiple themes

**Decision:** Organizer, CRT and Hi-Tech themes are skins of the same component tree and semantic tokens.

**Consequence:** Do not fork page implementations by theme. Theme decoration may be reduced on narrow mobile screens to protect usable area.

---

## D15 — Platform features are incremental

**Decision:** Notes, Plan, Machines, Files, Git and similar modules are desirable, but the first milestone is the remote Codex workflow.

**Consequence:** Architecture should leave extension points without forcing all modules into the initial implementation.

---

## D16 — iPhone is a first-class mobile client

**Decision:** iPhone support is required. It is not a generic responsive fallback or a later desktop-shrinking exercise.

The phone uses the same Hub/backend, projects, threads, results and authentication, but a dedicated mobile information architecture:

```text
Project/thread sheet
        +
Chat | Results | Remote
(one primary view at a time)
```

**Consequences:**

- portrait iPhone must support the full core Codex workflow;
- projects/threads use a sheet/drawer instead of a permanent left column;
- Chat is the default mobile workspace;
- Results is a separate full-width feed;
- Remote uses the full available workspace while active;
- Files/Activity may be secondary/overflow screens on narrow widths;
- Safari and standalone PWA modes must both work;
- iOS keyboard, safe areas, rotation, suspend/reconnect and touch behavior must be tested on real hardware;
- responsive behavior should use available layout width, not user-agent/device-name sniffing.

See `docs/MOBILE.md`.

---

## Deployment choices intentionally left configurable

These are not architecture blockers and should be configuration, not hard-coded assumptions:

- public hostname/domain;
- Windows LAN IP/hostname;
- Windows username;
- Windows edition and therefore preferred Remote provider;
- exact project paths;
- SSH key path/host alias;
- local Linux project paths;
- idle timeout values;
- whether Tailnet transport is enabled later.

## D17 — Early local-only Companion for Windows Session 0

The owner approved bringing forward the local-only Companion after a real read-only command failed under the SSH-hosted Codex sandbox (runner pipe timeout / Windows application initialization failure). The same sandboxed command succeeds in the interactive session.

The main flow remains system SSH and stdio. A fixed bridge forwards it to a local named pipe; a limited user-session task starts the configured Codex App Server with an allowlisted working directory. Remote pipe clients are rejected by the Windows pipe API. No Codex TCP listener, generic command endpoint or copied authentication is introduced. This overrode D11's timing. **Later scope:** GUI automation is now provided by the separately approved [independent Computer Use module](COMPUTER_USE.md); D17's original release scope is not a current GUI prohibition. The no-public-Windows-listener boundary remains.

## D18 — Password-only enrollment and bounded history

The first password is chosen by the owner, not set by deployment scripts. A private one-use link prevents public first-visitor account takeover. Later login asks only for the password. Hub storage uses Argon2id and opaque server-side sessions.

Initial history contains 20 latest messages. The explicit older-history button fetches another 20 and preserves the reading position. Reconnect uses an event cursor and falls back to a bounded snapshot when the backlog is large. Result-to-turn navigation fetches a bounded context page.

## D19 — Per-thread Codex controls and uploads

Model choices, reasoning effort and Work/Plan mode are required in the initial release. Discover supported values from the configured Codex backend and validate them at the Hub. Use the native collaborationMode protocol, including its built-in mode instructions, rather than simulating planning with a user prompt. Save choices per thread.

Files/images are attached to a draft, can be removed before sending, and remain private behind the same auth boundary. Originals live on the Hub, with generated JPEG previews for supported raster images. Transfer files through system SSH to a generated private directory on Windows; use localImage for vision and absolute file references for other formats. The browser never supplies an arbitrary destination path.

## D20 — Native project discovery and continuity

The owner requested automatic access to real desktop projects and conversations plus project creation from the website. This brings native catalog discovery forward from the original roadmap. Use App Server project APIs and metadata-only thread discovery, with stable Hub mappings and bounded native history. Keep one App Server per machine, launched through the existing configured seed directory. No broader Companion API is introduced. See [sync behavior](SYNC_AND_REMOTE.md), including the separate desktop saved-folder list and lack of coordination for concurrent clients editing one thread.

## D21 — Phone trackpad and reference-based themes

The owner requested phone trackpad input, tablet touch/stylus, unobstructed landscape Remote and faithful treatment of the drawn references. Use one Pointer Events controller and floating controls; connected compact Remote removes navigation and decorative frames. Theme identity comes from paper/binding, CRT housing and light silver/cyan hardware, using the same feature markup. Physical iOS checks remain an explicit validation requirement.

## D22 — Native writer conflicts are explicit

A real Codex 0.153.4 Windows probe established that the desktop App Server can retain a paginated conversation writer while idle. The separately launched Hub App Server cannot resume that thread until the writer is released. Unix daemon proxy transport is unavailable on this installation, and the configured Companion remains limited to App Server stdio.

Return HTTP 409 with a readable message, preserve the draft, and offer an optional explicit fork of completed native context. Use a new native thread ID, retain pending attachments on the original, copy them privately to the fork, and require the user to press Send for the new draft. Never auto-fork, auto-retry an uncertain send, stop the desktop or modify private desktop state to fake same-thread continuity. See SYNC_AND_REMOTE.md for the concrete limitation.

## D23 — Project trees, useful results and compact typography

The owner requested expandable project/thread trees and a separate list of projectless conversations. Use virtual per-machine Hub buckets for unmatched native conversations, preserving their actual cwd; never create native projects just for navigation.

Show turn progress and pending choices next to the composer. Keep code and commands behind disclosures; show loaded image results first. Use locally bundled Roboto Condensed in organizer/hi-tech, sharp monospace in CRT, shared mobile spacing and 44px touch targets. Small visible parameter captions overlay full-size native selects so the selector text can be compact while keeping native picker/accessibility behavior.

## D24 — Web as the primary client

The owner clarified that the completed website will be the only primary client. Windows runs Codex through the independently scheduled local-only Companion; keeping desktop ChatGPT/Codex open is not a dependency. This supersedes D22's copy-first UI fallback: preserve native IDs and drafts, explain the one-time desktop exit needed to release an existing writer, and expose a same-thread access retry. Do not forcibly quit an active desktop task. The Hub retains loaded writers between turns, with existing idle teardown and restart recovery.

A version manifest tied to the built JavaScript and stylesheet assets lets a long-lived mobile page offer an explicit update. Never auto-reload an in-progress draft or upload. The HTML, service worker and manifest use no-store headers; private API responses remain outside service-worker caches.

## D25 — Read-only activity across App Server processes

Windows Codex 0.153.4 returns runtime `notLoaded` and maps an externally running persisted turn to `interrupted` in `thread/turns/list`. A native read probe compared this with the desktop's active state and the raw persisted `inProgress` value. Consequently Hub turn notifications alone cannot describe desktop activity.

An optional administrator-configured `machines[].codex.activityNode` enables one fixed metadata query via the existing system SSH transport (or a local process on Linux). Node must support node:sqlite. The home comes from App Server initialize, IDs from the Hub catalog, queries open state_5.sqlite and thread_history_1.sqlite read-only/query-only, and output contains only latest turn IDs/status/timestamps. No private desktop state is mutated, no prompts/items/auth data are copied, and no Companion API or network listener is added. This is a narrow read-only compatibility adapter, verified against 0.153.4; unsupported schemas report unavailable observation.

The shared poll runs every four seconds while navigation clients are connected, with one in-flight request per Hub and at most 3000 known threads per machine. Native catalog refresh has its own cache. Hub-owned loaded writers retain structured event priority. Ten-minute-stale unfinished metadata becomes unknown; failure never fabricates completion. First observed historical completions start read. Subsequent terminal changes create the same durable unread receipts as web turns. Cached observations survive browser/Hub restarts. Native completed context is read/resumed before web work; known external activity is rejected before turn/start.

## D26 — Native message queue and explicit Steer

Use App Server thread/queue APIs for the durable queue, including cross-client list/add/update/delete and automatic continuation. Hub does not duplicate normal queue execution. Queued messages inherit the native thread's current model/mode settings. The web composer accepts text and attachments during a turn; queue entries expose edit/delete/Steer and survive page closure.

Steer requires a Hub-owned loaded writer and the exact expected turn ID. Native turn/steer does not consume its queued entry. Before transferring, keep a durable Hub recovery record, delete the native queued item only if deletion is confirmed, then steer. A completion/dequeue race never steers the next turn. Unknown outcomes retain the text for inspection/manual recovery, with no automatic resend. While another App Server owns the turn, native queue operations remain available; steering and interrupting that process are not supported. Native queued user messages are normalized into the live chat, including attachment identity.

Core protocol failures, unsupported methods, offline transport and expired native login stay distinct. Optional Plan/config reads degrade only on explicit method-not-supported; no silent Work substitution for a selected Plan request. Runtime identity/version is included in capabilities; unverified versions display a compatibility note.


## D27 — Render structured native image attachments

The owner requested images in place of desktop attachment paths. Register only structured native localImage references or bounded inline raster image data from the paged history, returning opaque authenticated Hub image URLs. The browser cannot submit arbitrary filesystem paths or remote URLs. A fixed system-SSH read copies a raster source of at most 8 MiB; decoding/resizing runs on Linux, one image at a time. Cached normalized PNGs use the existing ResultStore artifact files and backup contract. Never rewrite native messages.

The displayed text removes only the known desktop file wrapper corresponding to its structured image references. Other text and unrelated file references are preserved. Both native and web-uploaded images display useful-sized previews in the message and open in a touch-accessible viewer. Missing sources have a retry action. Image fetching is lazy and does not load older chat pages.

Unconfirmed native queue additions also retain a Hub recovery record and bound attachment metadata. Observing the matching native queued item/user message reconciles that record; it does not resend the message.


## D28 — Explicit desktop restart from Settings

The owner requested a Codex restart button. Optional machines[].codex.desktopControl points to the installed fixed PowerShell control script. Hub exposes authenticated status and confirmed restart endpoints, never process IDs, executable paths or caller-supplied commands. System SSH invokes only Status/Restart with a UUID. A demand-only Scheduled Task launches its fixed action using the owner's Interactive logon, Highest run level (needed for administrator-launched Codex), and IgnoreNew. Its private user/SYSTEM/Administrators directory contains fixed scripts/config and one latest operation record. No network listener or Companion change is added.

The task resolves the installed OpenAI.Codex package for the pinned family and current owner. It closes only that package's UI and captured direct native App Server children, checking creation identity before forced exit. Companion-owned native processes remain separate. Relaunch occurs in the same nonzero interactive session. State is queued/restarting/completed/failed/unknown; completion requires observing the new desktop process. Stale requests never execute after a later login; uncertain outcomes are read back, never replayed automatically.

Hub checks its own active turns. Windows independently queries all non-archived native latest-turn metadata read-only (bounded to 10000 threads), applying D25's ten-minute freshness rule. Active or unreadable state blocks restart. The task repeats this check immediately before close and before forced exit. A desktop task beginning during the narrow close window cannot be coordinated atomically through the current protocol; use this explicit maintenance action between tasks. No automatic restart on errors or writer conflicts is introduced.


## D29 — Per-conversation access

Normal access uses workspace-write/on-request; explicit full access uses the native :danger-full-access profile and never approval policy. Hub checks permissionProfile/list and configRequirements/read before accepting full access. Missing/denied capabilities fail closed. The choice is stored with thread settings, applied on native start/resume/turn start and changed for future turns through thread/settings/update when the Hub owns the loaded thread. A native settings notification reconciles accepted changes if the request acknowledgement is lost. An active external writer cannot have its defaults changed. Forks start with normal access. Global configuration and already-pending approvals are never rewritten or automatically accepted.

The composer exposes only “Обычный доступ / Полный доступ”, with a distinct full-access state. This is the owner's requested opt-in native policy control, not an application authentication bypass.

## D30 — Explicit desktop handoff and hard recovery

The owner extended D28 with a separate hard restart and manual client handoff. A persisted per-machine desktop/web selection belongs to Hub preferences, writable only through the authenticated dedicated client endpoint. Desktop handoff refuses active/unknown Hub tasks and in-flight writes, closes the selected machine's loaded App Server connection and blocks create/resume/send/settings/queue mutations until explicit return. Read-only discovery may reconnect without loading a writer. No desktop state files are edited and native thread IDs remain unchanged.

The hard restart endpoint requires confirmStopTasks=true, CSRF/Origin, a UUID and bounded request rate. It first puts the machine in desktop mode and disconnects its Hub App Server; the existing Companion job object tears down that process tree when the pipe closes. The fixed Windows Scheduled Task accepts ForceRestart in addition to ordinary Restart. Only this explicit hard action skips activity checks and the graceful-close wait; process/package/owner/session identity checks, expiration, cooldown and duplicate protection still apply. It closes only the configured desktop package and its captured direct App Server children. Companion and unrelated Codex processes remain intact. The user explicitly returns control to the website afterwards. No generic PID/command API is exposed.

## D31 — Resilient attachments, visible Steer and compact progress

Windows attachment staging now uses a newline-framed base64 payload with an exact expected length. Windows OpenSSH can keep standard input open after client EOF, so ReadToEnd is not a valid completion signal. A staging failure occurs before user input reaches Codex; it preserves unbound attachments and releases the idempotency key for an explicit retry. Unknown outcomes after native submission remain protected from replay.

A confirmed Steer retains a “Принято” card in the queue until the matching native user message is observed. It cannot be edited/deleted/resubmitted as a queued item after acceptance. Matching native events reconcile the receipt, including the event-before-ack race. Lost acknowledgements retain the existing explicit recovery behavior.

The status row toggles a small scrollable recent-work panel. The Hub contract returns at most eight recent steps from bounded event queries, scoped to the selected turn. Commands start collapsed. Only item/reasoning/summaryTextDelta and completed reasoning.summary enter this view; raw reasoning text/content is ignored. Summary snapshots are bounded and throttled, and the panel polls only while open and visible. The newer-message navigation button stays inside the chat viewport so it does not cover queue controls.


## D32 — Native usage and task boundaries

Owner-approved extension (#129, 2026-09-11): earned rate-limit reset credits may be shown and explicitly redeemed below the limits through a durable, account-bound native operation. See [earned resets](USAGE_RESETS.md). **Later owner update:** Settings also shows the available native credit balance. Reset availability and account credit balance are distinct values; the original balance exclusion is superseded.

Settings reads account/rateLimits/read through the existing machine transport. The Hub response contains group labels, bounded window durations, remaining percentages, reset timestamps and available native credit information. Weekly means 10080 minutes and can occur in either window slot. Prefer the main codex bucket and retain additional named buckets in collapsed sections. Show balance, unlimited or unavailable as actually returned; do not infer a balance from reset credits or expose billing credentials. Read-only usage checks remain possible after desktop handoff and do not acquire a thread writer.

Conversation separators mark the end of a finished turn, including interrupted/failed boundaries without describing them as successful. Do not split multiple messages or accepted Steer input within the same active turn. Native thread/turn IDs and pagination remain unchanged.

## D33 — Confirmed active handoff and verified return

The owner approved stopping an active turn before transferring the same native conversation. This extends D30: the ordinary idle handoff still refuses active work; an explicit confirmInterrupt=true requests native turn/interrupt for each known Hub-owned active thread. New writes are gated before interruption. Hub waits for native completion events before closing its App Server connection. Unknown ownership or in-flight input refuses handoff; a stop timeout retains the writer and reports pending rather than forcing teardown. Queue entries are preserved.

Retry corresponds to thread/resume, which loads the existing conversation but does not start a new turn. Explicit user input continues from saved context. Installed Windows Codex 0.153.4 has no supported live writer transfer. Ordinary mobile ChatGPT chats do not participate in this native writer connection; official Remote does.

Returning to web while the desktop is running requires releaseDesktop=true and confirmStopTasks=true. The fixed Scheduled Task accepts ForceRelease: attempt graceful desktop close, then stop only captured package/session/owner-matching processes and their direct native children if needed, without relaunch. Companion-owned processes are excluded. No generic command or PID endpoint is introduced.

Hub persists the operation ID before dispatch, blocks writes while returning, and enables web mode only after a matching completed DESKTOP_RELEASED result and running=false. Bounded background status polling completes an accepted return even if the browser disconnects or Hub restarts; uncertain requests are never replayed. Failed or expired operations leave desktop mode in place. Hard restart invalidates an old pending return. The website still acquires a conversation writer only on an explicit write/resume operation.

## D34 — Reference materials and classic dark

The owner requested stronger CRT character and a fourth classic dark theme. crt-green uses unmodified IBM Plex Mono Regular/SemiBold 2.5.0 WOFF2 fonts from the official IBM package (complete font files with Cyrillic support, SIL OFL shipped with provenance). Only the two font assets are bundled, with no package runtime/scripts; they total 99,848 bytes and load from the Hub on demand. Existing organizer/hi-tech and classic-dark use Roboto Condensed.

Static raster/glass backgrounds sit behind pane contents; bounded text/edge shadows provide phosphor glow without filtering or transforming glyphs, images or the desktop canvas. Inputs and expanded code remain unglowed. Increased-contrast/forced-colors preferences disable raster and text glow. Compact Remote keeps its entire viewport.

classic-dark uses graphite surfaces and quiet blue-gray accents without hardware bezels or texture. Frontend theme metadata drives the same picker and browser chrome color. Hub preferences allowlist includes the fourth ID; validated local cache applies before React renders login/loading, and authenticated preference loading remains authoritative. Existing native workflow, authentication and storage schema are unchanged.

The owner subsequently requested another review of the other references, especially Hi-Tech 2000s. Hi-tech now uses neutral silver chassis surfaces, dark seams, inset display edging, chrome bevels and concentrated cyan highlights on selected controls rather than a blue wash across every surface. Wide-only screw/vent details stay outside the working content. Organizer keeps its existing warm paper/binding/tab structure with lighter pages, oval rings and restrained message fills. Compact layouts reduce chassis decoration; all four themes retain the shared functional markup.

## D35 — Binary attachment staging over system SFTP

A real 1 MiB attachment reproduced UPLOAD_TRANSFER_TIMEOUT in the previous PowerShell console-stdin transfer, although tiny image fixtures passed. Use the installed OpenSSH SFTP subsystem for file bytes over the same private SSH connection. Codex remains stdio through SSH/Companion; no listener, credentials or public port is added. PowerShell only creates the generated destination and verifies/finalizes the file.

The SFTP batch contains quoted absolute local/Windows paths, with control characters rejected. Upload into a generated temporary file, verify native byte length and SHA-256, then move to the generated final name. Validate the acknowledgement before adding a native localImage or file reference. The whole attachment preparation shares a 40-second deadline; failed partial transfers get bounded cleanup. Preparation failures return a specific 503 JSON response before the former 60-second gateway timeout, release protected files/idempotency state and leave text/files available for an explicit retry. No prompt is automatically replayed.

Remove the duplicate chat-pane heading/status and keep the top connection label about connectivity. The existing composer progress control remains expandable and shows attachment transfer while sending files.

## 2026-09-06 — Optional real-account ChatGPT browser backend

The owner requested a complete GPT mode with existing chats, files, image generation and actual model selection, and approved a ready browser integration. Consumer ChatGPT does not provide the Codex App Server transport used by the Windows execution backend. GPT therefore uses an isolated, persistent Linux Chromium profile with owner-performed login. The Codex/Companion path remains independent.

The optional connector runs the MIT-licensed chatgpt-bridge extension/runtime pinned at 96802cc0d2ea0b7449cf465f8adb3c228decd297. This revision precedes an unavailable optional ZIP dependency. Only the browser bridge, file store and HTTP adapter are loaded. Compatibility patches require successful attachment preparation and support the current native model/power menu. Canonical readback confirms completed image-only turns and supplies protected image bytes.

The browser profile and connector secrets stay on the Linux host. Public clients use the authenticated Hub API and a protected Guacamole connection page. Jobs are durable and serialized; browser disconnects do not cancel them. Uncertain native submissions require explicit review and are never automatically replayed. Public output is whitelisted; hidden reasoning and adapter diagnostics are discarded.

The shared web shell provides native chat history, send/progress, file/image input, model/power selection and image results. The protected original ChatGPT interface remains available for account controls and other native workflows. Consumer UI changes can require adapter updates; exact UI parity is not assumed.

## Interactive self-contained HTML Results (2026-09-06)

The owner requested the interactive design studies used in TrainerOs. Support them as authenticated, bounded HTML artifacts with an opaque-origin sandbox, sourced from structured HTML resources/file changes or explicit assistant HTML blocks/local file links. **Updated source scope:** automatic file-change discovery stays within the selected project; explicit public assistant exports may be outside it, including hidden scratch folders, under the [September 26 rule](../AGENTS.md#owner-requested-location-independent-chat-downloads-2026-09-26). Keep exact source/account/machine identity and immutable captured bytes. This is an artifact viewer, not a general reverse proxy to development servers. Native chat order is authoritative; the live Hub supplement inserts only unpersisted messages at matching sequence anchors and must not promote older-page records to the tail.

## GPT continuity and public progress (2026-09-07)

Retain the visited GPT pages, native job state and reader position across chat/client switches. A bounded same-tab session cache restores the view after a brief navigation or reload; it is used only after Hub authentication, expires after 30 minutes and is cleared on logout or a rejected session. In-flight responses cannot repopulate a cleared cache or overwrite a newer request. No account tokens, signed asset URLs or private native records enter this cache.

The Hub coalesces canonical history reads and keeps only normalized public messages in a bounded memory cache. Latest-page requests carry a revision and a prefix fingerprint. Unchanged history returns no messages; ordinary completion retains explicitly loaded older pages, while a native branch edit invalidates an incompatible prefix. First reads and older-page fetches remain 20 messages. Background revalidation updates native changes without clearing the pane.

Persist up to 24 short public progress labels per Hub GPT job in schema 6. Accept only structured DOM-observation items from the pinned adapter's visible cot/shimmer/transition controls. The expandable composer panel retains prior stages; completed stages remain collapsible near the answer. Raw thinking snapshots, native analysis/thought content, tool internals and diagnostics remain excluded. Some native models expose only a generic Thinking label; do not fabricate a more detailed reasoning trace.

## Release notices use the booted build identity (2026-09-07)

The build writes one deterministic fingerprint of all bundled JavaScript/CSS filenames to both HTML and version.json. Compare this identity rather than the styles currently mounted in the DOM: lazy GPT CSS is absent in an ordinary Codex view and previously caused a permanent false update notice. Explicit update navigation preserves URL state and drafts, adds a temporary cache-busting release marker, and confirms the target identity after boot. A stale/offline document retains a retry notice; an actual updated document briefly confirms success and removes the notice. Do not unregister the service worker or clear the owner's application data.

## Desktop preparation on handoff (2026-09-07)

The owner extended the explicit Settings handoff with desktop launch, maximization and selection of the current native conversation. Hub resolves an optional authenticated Hub thread ID against the selected machine before releasing writers, then sends only the native UUID through the existing SSH control to the demand-only interactive Scheduled Task. The installed OpenAI.Codex 26.901.5280.0 package registers the codex protocol and handles codex://threads/<UUID> as a local conversation route; this compatibility path was verified in the installed package, not inferred from an API endpoint. No desktop state files are edited.

Open never closes a process or checks active work as a reason to stop it. A second launch forwards the validated link to the existing app. Window activation is restricted to the configured package, owner and interactive session. Completion requires a visible maximized window; foreground denial is reported separately. No thread-navigation acknowledgement is available from the native URL handler, so the result confirms window preparation and link delivery, not an in-memory turn transfer.

Handoff remains in desktop mode if opening fails. Read-only status recovers the result after browser loss; an explicit Open retry is available. Pending or uncertain Open blocks return to web so a delayed scheduled launch cannot grab a newly acquired writer. The existing expiry, single-task lock and idempotency guards remain. No network listener or generic launch endpoint is added.


## 2026-09-07 — Native navigation actions and shared menus

Chats and projects expose Pin, Rename, Archive and Delete in that order. Delete requires a named confirmation and uses a red action. A shared dialog/menu supplies touch and keyboard behavior in both modes.

Codex chat names, archive state and deletion use App Server methods; project names/deletion use its project catalog. Deleting a project detaches chats and never calls a filesystem deletion method. The installed 0.153.4 schema has no isPinned field in thread/metadata/update, even though newer public docs describe it, so pins live in Hub SQLite. Whole-project archiving is a reversible Hub view preference for both clients. Archived native Codex threads are read in pages of 20; their queues cannot be read until unarchived.

An empty Codex thread may have no native rollout yet. Its archive is a Hub preference until it contains a message. After a connection restart, only a provably empty, web-created placeholder with no messages or queue transfers may receive a new native placeholder ID. Existing conversation history never takes this path and prompts are never replayed.

ChatGPT chat archive, rename and deletion and chat/project pins use the current consumer client's native contracts. Project rename preserves instructions, emoji and theme while changing its name. Project deletion uses the native API and deletes its chats/files. The native ten-item pin limit is retained, without evicting existing pins.

Schema 7 adds library_entities, private Hub metadata for pins, project archives, names and deletion tombstones. Tombstones prevent stale browser/catalog snapshots from recreating deleted entries. All mutations use authenticated Hub routes, strict allowlists and idempotency keys. Active/queued/uncertain work blocks destructive changes; queue writes are serialized with catalog changes. Source files, authentication credentials and execution topology remain unchanged.

Validation includes disposable native Codex project/chat lifecycles, empty-chat reconnect, a disposable ChatGPT project/chat lifecycle, native pin-limit rejection and unpin, mock race/guard tests and Chromium/WebKit phone/tablet visual checks.


## 2026-09-07 — Owner password lifecycle without additional account services

Both client modes share password change and global sign-out in Settings. Normal login remains one password. Password change revokes old sessions and issues a fresh session/CSRF pair to the initiating browser, preserving its chat and drafts. It does not interrupt native work or change writer ownership.

Schema 8 adds a credential revision and a single expiring recovery-token hash. The local maintenance CLI writes a private, one-use, 15-minute URL; only token redemption is available through the authenticated-origin website. No email/phone service, default password or network token-issuance endpoint is added. The optional GPT login gateway watches Hub session revocation and must be restarted after the matching Hub is deployed; its persistent browser remains running. Offline snapshot restoration invalidates sessions and recovery links.


## 2026-09-08 — Desktop workspace dependency compatibility and explicit recovery

Native resumed conversations may retain the desktop's dynamic tools. Hub handles the
specific codex_app/load_workspace_dependencies call using the current machine's existing
bundled runtime manifest and executable/plugin paths. This is read-only discovery over
system SSH for Windows (or local filesystem on Linux); it is not an installer or an
arbitrary command/path API. The native workspace_dependencies feature must be enabled.
Other dynamic tools receive a normal failed tool response and a bounded Results entry;
they do not poison transport status or suggest that reconnecting adds a missing tool.
Only public tool results are normalized, never hidden reasoning or supplied raw arguments.
The request/response contract follows the installed 0.153.4 schema and
https://learn.chatgpt.com/docs/app-server (dynamicTools and item/tool/call).

Restore conversation rechecks native turn status, including already-loaded unknown
threads and excluded/empty resume turn arrays. It never replays user input. Pending,
failure/retry, still-running and stopped/idle outcomes appear beside the composer.
Notification navigation keeps its URL until the selected Codex conversation is durably
saved; selection writes are serialized. GPT persists its existing local selection before
consuming the URL. Both modes survive an immediate reload without taking a writer.


## 2026-09-08 — Immutable project exports and cross-thread Results

Schema 11 adds artifact_files (name, SHA-256, source/turn metadata) and artifact_captures
(recoverable capture state). Only live completed public assistant file links and structured
output-file changes create capture requests; no repository scan or automatic historical
backfill is performed. Explicit links may publish unknown formats as download-only files;
ambiguous source/config changes alone are not export intent. Secret-like paths and hidden
directories are excluded. Existing native image and isolated HTML demo workflows remain.

System SSH reads Windows bytes with project containment and rejection of reparse points.
Linux uses canonical containment, no-follow file opening and a modification check. Each
file is limited to 32 MiB, with one bounded transfer queue, a 16-request concurrency cap,
5000 capture records and the existing aggregate artifact quota. Captured bytes are private
immutable Hub copies; original machine paths stay in private metadata. Failed/interrupted
copies remain visible and retry reads the current file version, dated at actual capture.
No prompt is replayed. No software is installed and no public Windows listener is added.

The existing artifact pool, storage reporting, orphan maintenance and backup/restore cover
both legacy PNGs and new binary copies; maintenance waits while captures are pending.
The project Results scope reads categorized pages of 20 across that project's chats and
returns to the originating conversation/turn without acquiring a native writer. Thread
Results remain the default. Public live Codex commentary uses a modestly stronger text
contrast in the same theme tokens, as requested by the owner.


## Project Files/Git inspection (2026-09-08)

- The owner requested the remaining small workspace modules. #36 adds read-only Files/Git through authenticated project contracts. Global #6 root policy remains deferred; these new reads are scoped to the selected configured project.
- Directory and Git inspection run as fixed trusted code over existing system SSH into the configured private Windows Node runtime, or locally on Linux. They do not acquire a Codex writer or start Remote. The browser cannot supply a machine, executable, command or absolute root.
- Directory pages contain up to 100 entries with a 5000-entry scan bound and an explicit search/path control. Parent traversal, symlink/reparse paths and known credential locations are refused; useful `.github` content remains browsable. File reads are limited to 32 MiB and reuse the PWA's closable file/share preview. SSH binary transfer avoids base64 expansion in Hub memory.
- Git uses the configured environment's system executable outside the project, disables optional locks, fsmonitor, external diffs, text conversion, signatures and pagers. It does not fetch. Status, staged/working/new counts, summary, current branch, cached ahead/behind, 12 commits and a per-file diff are read-only. Diff output is bounded to 256 KiB and visibly marked if truncated. Invalid repository configuration is an error, not a clean/non-repository result.
- Files is a wide support-pane tab and a secondary Settings screen on compact clients, with direct links from structured Results changes. The existing three mobile bottom tabs stay intact; drafts and running work remain mounted. Captured immutable artifacts stay available separately from the current source file.


## Focused machine diagnostics (2026-09-08)

- #35 adds a shared Computers panel in Codex/GPT Settings, with links back to configured Codex projects, Remote and existing confirmed desktop maintenance. It does not add arbitrary shell/process/service controls.
- The overview reads only Hub metadata and cached diagnostic results; it polls every 30 seconds only while open and visible. An explicit check is deduplicated per machine, limited to two concurrent machines and throttled to one fresh probe per 15 seconds. Saved last-seen/diagnostic state is Hub-owned preferences data and therefore included in normal SQLite backups. Results older than one minute are visibly stale.
- Checks distinguish system SSH, installed CLI, private Companion/App Server startup, native account and model availability, the configured Remote port and the local Guacamole gateway. Fresh diagnostic App Servers run only initialize/account-read/model-list and are always closed; no thread is loaded/resumed, no prompt is sent and desktop control is untouched.
- Cheap OS memory/project-drive/boot-time metrics are optional. Windows reads fixed CIM fields through existing SSH; Linux uses OS/statfs. Private paths, SSH/Remote credentials, native account details and raw errors do not enter the public report.
- Opening diagnostics preserves chat/draft state and suppresses visible-chat acknowledgement while the dialog covers it. No deployment interrupts active owner work.

## Hub-owned project context (2026-09-08)

Notes use schema 12 SQLite records with explicit saves, optimistic revisions and full-content idempotent retries. Global/project scopes work in both client modes. Browser drafts are bounded to 20 and remain separate from chat drafts; storage failure is visible and never silently evicts text. Server conflicts preserve the draft and require a choice.

Generic workspace pins store references to notes, Codex/GPT chats and Results. They do not replace native ChatGPT chat pins. Missing targets stay visible as unavailable references; note text is never cascaded away. Notebook reads/mutations do not contact the GPT connector or load a Codex writer. GPT reference availability is unknown until the owner explicitly opens native history.

## Lightweight project Plan (2026-09-08)

Schema 13 stores owner-authored tasks separately from notes. Both modules share the editor, local draft recovery, explicit save/conflict flow and generic reference model. Tasks add todo/doing/blocked/done, priority 0–2 and an optional validated calendar date. “Today” includes overdue open tasks using the client’s local calendar date; completed items retain their completion timestamp until reopened. Quick status updates are revision-checked and do not replace task text.

Task rows survive project/thread deletion and are part of normal snapshots. There is no automatic retention of completed owner text, native prompt submission, scheduler or full-calendar engine. Additional task context reaches Codex only when the owner explicitly writes a prompt; merely opening Plan never acquires a writer.

## Project overview composed from real modules (2026-09-08)

Home is a bounded read over existing module storage, not another dashboard database. It returns up to four conversations, four tasks, four Results, three notes and three saved references. It does not read conversation bodies, mark work seen, contact a native writer or run diagnostics. Only already captured Hub images can become thumbnails; native/signed image sources remain explicit Result links.

Git summaries are cached after the existing explicit Files/Git action and bound to the configured project directory. Health/Git states include check timestamps and become stale after one minute. GPT Home consumes the native catalog already loaded by its client plus Hub-owned project context; unavailable native modules are omitted instead of triggering additional consumer-browser reads.


## 2026-09-08 — Local message read-aloud (#76)

This entry describes the original system-voice path, not a ban on server speech:
the later device-local System voice / Background audio decision below adds the
optional Linux speech worker. In system-voice mode, Codex and GPT assistant messages
use SpeechSynthesis inside a user tap, select a locally supplied voice (`localService`)
and send no text to a TTS endpoint. Empty voice lists wait for `voiceschanged`.
Public Markdown becomes prose excluding code blocks, HTML, images and URL destinations;
long prose uses bounded paragraph/sentence utterances. Complete file reading follows
the later [reader contract](FILE_VIEWERS.md).

Pause/resume keeps the current native utterance. Cancellation generations reject late terminal callbacks, another message replaces the current queue, and leaving a conversation/view or closing the page cancels its speech. Changes in backend execution or connectivity do not own playback state. The spoken text is a snapshot of the visible public answer at the tap; subsequent streaming never auto-replays it. No hidden reasoning or Activity payload enters the controller. Voice/rate preferences and sentence highlighting remain follow-ups.

## 2026-09-08: Owner-requested background read-aloud and Remote shortcut

The owner requested read-aloud during iPhone screen lock. This extends the earlier device-only read-aloud decision: an optional network-isolated Linux Piper worker may generate private, ephemeral audio over a Unix socket. Use a single authenticated media track and Media Session controls; retain local system-voice fallback. Do not claim hardware background acceptance from browser tests. See `ops/speech/README.md` for limits and voice attribution.

Remote is a manual sidebar icon beside the Codex/GPT selector in both modes, without a label or a workspace tab. An explicit click connects and opens the full available screen; Codex uses its selected project's desktop and GPT uses the protected native ChatGPT connection. Keep an accessible return control and floating controls. No automatic remote session is created by ordinary page load.


## 2026-09-10: Explicit read-aloud modes (#90)

A single device-local choice in Codex/GPT Settings selects System voice or Background audio. System speech is the default when the API exists and never contacts `/api/speech`; background capability is checked only when that mode is selected (or the device has no system speech API). Voice discovery still waits for local installed voices, including delayed `voiceschanged`. Choosing another mode stops both prior playback paths before later playback, while preserving chat drafts and native work. The optional Linux Piper worker and media controls remain available through the background choice.

## 2026-09-10 — Global human Tasks (#83)

The existing `workspace_tasks` store remains the source of truth, without a schema or data migration. Tasks replaces the former human-facing Plan label; native Work/Plan mode is unchanged. Sidebar entry points show all projects; Project Home filters the same data. Project filters read bounded Hub metadata and saved task associations, including unavailable projects. Normal GPT project discovery remembers names in the existing private library cache; opening Tasks performs no native browser request. Unknown GPT availability is not treated as deletion. Existing revision conflicts, draft recovery, completion timestamps, links and idempotent writes are retained. Future AI Plans/Reports are separate modules and will supply their own reference types when implemented.


## 2026-09-10: Project Files/Git inspector

The header shortcut resolves the selected Codex project and machine; switching projects remounts the inspector and aborts stale reads. File actions stay inside their selected row. Directory sorting precedes pagination, and exact file reveals locate the relevant page. Git overview reads the configured project README, branch/upstream state, recent commits, branches and tags without changing the index or taking a native writer. Release failures remain independent of local Git/README.

Remote GitHub coordinates are normalized to a credential-free github.com URL. Release reads use the fixed [GitHub releases API](https://docs.github.com/en/rest/releases/releases), six records at a time, through the existing GitHub CLI login; public repositories have a bounded anonymous fallback. On this Windows installation the Credential Manager login is unavailable in SSH Session 0. A fixed `CodexWebGitHubReleases` task therefore performs only that GET in the logged-in session, with a private bounded file mailbox and hidden, limited-privilege process. No OAuth token is copied to the Hub, no public/private listener is added, and no Codex/desktop process is opened or stopped.

Install with `ops/windows/Install-GitHubReleases.ps1` in the intended Windows user session, using the stable Node runtime and existing `gh auth login`. It registers only the current user's task and does not require elevation. Without the optional helper, ordinary CLI/public reads remain available; unavailable private release metadata has an explicit retry/link rather than blocking files.


### 2026-09-10 — Project setup and persistent diagnostics

Issues #102/#103/#105/#106 replace transient new-chat shells, the one-page folder form, the large sidebar branding header and the navigation-changing Project Home with explicit loading, a reviewed setup wizard, a compact footer and a modal overview. They preserve the existing core execution/ownership architecture.

Project setup is stored in schema 18 (`project_setup_operations`) and in private execution-machine receipts. Each prepared operation has an immutable input and observed-state fingerprint. GitHub creation is never repeated after ambiguous dispatch. Clone staging is sibling-local and never overwrites non-empty source directories. Git and GitHub authentication run where the project lives; the Windows fixed `CodexWebProjectSetup` task reuses the user-session CLI login. Install its compiled probe from Linux with `ops/windows/Install-ProjectSetup.ps1`. The existing read-only releases task remains separate.

Schema 19 introduced private Bridge Doctor associations/incidents and a diagnostic-thread marker. Doctor runs independently of browser presence, with startup grace, persistent-fault thresholds, deduplication and sustained-health recovery. Current Chat remains separate. **Superseded execution scope:** read-only policy now applies to `diagnose` mode; account-enabled `repair` authorizes incident-related code/tests and ordinary deployment alongside other project work. Activation retains normal maintenance admission. Exact completed creation receipts can recover an association without another send. See the [October 1 repair changes and installed evidence](BRIDGE_DOCTOR_REPAIR_2026-10-01.md); do not restore the original blanket idle/read-only gate. Unknown sends are never replayed.

Optional incident screenshots intentionally remove all text, images and personal regions, including unknown dialog text. They are structural evidence rather than raw screenshots. Private SQLite backup preserves the metadata/evidence; screenshots sent to Codex use the existing authenticated attachment transport. This original evidence format does not restrict the later authorized repair workflow.

### 2026-09-10 — Private device terminals

The owner requested terminal output in Results and an infrastructure workspace alongside Remote, initially for the Windows PC and actual Linux host. Devices use a separate configured SSH registry; they never become fake Codex projects or acquire chat writers. The owner-approved terminal uses the existing Hub session/Origin/CSRF boundary, system OpenSSH, bounded PTYs and explicit device actions. This terminal feature does not expand the App Server helper API; the later [independent Computer Use module](COMPUTER_USE.md) has its own authorized scope. See [Devices](DEVICES.md) for lifecycle, native mount/permission limitations and verification boundaries.

## 2026-09-14 — Exact artifact navigation and large Codex exports

Assistant Markdown resolves generated file/image references inside Results/Preview. Native paths are retained only for the internal handler; normal external links keep browser semantics. Codex resolution binds the source thread, message, turn and canonical capture path, or the exact native image source digest. GPT uses exact normalized message file identities. No filename search, version substitution, native send or writer acquisition occurs. Missing references stay in a bounded internal error view. Private resource endpoints recheck the current workspace on reveal and download.

The reader-case ZIP (414,735,777 bytes) requires lifting the **Codex captured-export** limit from 32 MiB to 512 MiB. Transfers use existing system SSH, a fixed root/reparse-checked PowerShell stream or a confined Linux file descriptor, a 256 KiB buffer, a ten-minute deadline, byte count and SHA-256 verification. Temporary files become immutable Hub artifacts only after successful transfer and quota checks. HTTP HEAD and single-range downloads are authenticated and streamed; large files use browser downloads with attachment disposition, preserving the PWA page. Small preview/share blobs retain the 32 MiB bound. Ordinary Files reads, GPT transfers, uploads and shared publication are unchanged. Pending capture blocks engine maintenance.

## 2026-09-11 — Configured native project previews

The owner-approved #38 preview uses a separate fixed `CodexWebGuiPreview` interactive Scheduled Task over existing SSH and a private local file mailbox. This is the smallest compatible extension while keeping the currently running Companion untouched. Only a trusted machine-local action allowlist supplies executable/cwd/arguments; browser requests identify an action and an existing project chat. Each launch owns an unnamed Windows Job Object and captures only its own visible windows. Hub schema 25 persists exact operation/result/thread identity; uncertain launches are never repeated automatically. See [GUI previews](GUI_PREVIEW.md) for setup, capture limits, lifecycle and verification.

## 2026-09-21 — Codex file links outside the checkout

Explicit file links observed in authenticated native assistant messages may name exports outside the project directory on that same execution machine. Capture those exact paths through the existing private transport and bind snapshots to thread, turn and message. The browser cannot request arbitrary machine paths. Project Files keeps its existing root boundary. Import file links while reading historical native messages as well as live completion events; preserve existing snapshots and avoid duplicates. Files without extensions are supported as explicit links too.

## 2026-10-01 — Authorized Bridge Doctor repair

The owner's explicit repair-mode choice supersedes the September 10 read-only
Doctor restriction. Retain diagnosis-only as a separate per-account mode. Repair
uses the associated private diagnostic thread and the existing full-access native
profile, normal client tools, an instructed isolated worktree and ordinary release
admission/rollback. It may investigate and prepare alongside ordinary project
chats; owner work also remains available while maintenance runs. Do not equate
project-wide activity with an exclusive native conversation writer.

Native health uses the native contract, not the legacy extension schema. Recover
an unknown Doctor association from its exact completed creation receipt; do not
recreate or resend an uncertain operation. A definite pre-send missing-thread
refusal may replace the maintenance destination while retaining history. Healthy
observations immediately suppress obsolete pending incident dispatch. Login,
account binding and upstream cooldown do not authorize speculative code changes.
See [audit and verification](BRIDGE_DOCTOR_REPAIR_2026-10-01.md).
