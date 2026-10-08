# Текущий статус — 8 октября 2026

### GPT public progress continuity follow-up - October 8

The owner's simultaneous native/web screenshots exposed missing live content
after the earlier request-card fix. The stream observer excluded public summary
formats accepted by the canonical reader; Results received no live updates and
its whole-card merge could replace newer steps with an older history card. The
chat also hid all received steps whenever local activity stopped.

The native stream and history now share the pinned public-content projection.
Web Results includes the existing live stream, merges by exact request/step IDs,
and retains canonical final/incomplete output. The last turn's public steps stay
reachable in chat independently of activity visibility. MemoryCite renders as a
memory-use marker. No extra history polling, send replay, private thought export
or elapsed-time completion was introduced.

Read-only diagnosis of the affected conversation verified public intermediate
messages in both the native projection and saved Hub history. The final history
available during diagnosis cannot prove the exact timing/content seen by the
iPhone while streaming. Linux typecheck/build and 96 focused checks passed.
Chromium and WebKit passed at 390/820/1366 widths, including live summary arrival,
stale Results response, retained chat steps and literal MemoryCite code. Private evidence is stored in
`/tmp/abyssdeck-public-progress`; no private transcript is committed.

Activated source `45d65400`: web release
`029589a9e525245a6f7f0f84d71cd556ab838dccb81923c94be41de57d02704b`
serves `/assets/index-DNVzeKFJ.js`; public page and entry returned HTTP 200.
The owner adapter is `codex-web-gpt-native:26.928.31416-45d65400`, installed through
ordinary idle admission with its profile and stopped rollback container preserved.
The installed reader successfully returned the affected chat's 46 public messages,
including 14 intermediate messages. Hub/engine and GPT gateway identities/start
times were unchanged; engine remains `eebc3a4a` / schema 31. No owner prompt was
sent as a test; real iPhone live-stream parity is not claimed from fixtures.

### Immediate GPT request cards and rich public content - October 8

Results now displays the request using its native user-message identity as soon
as existing delivery receipts confirm acceptance, or canonical history contains
the request. Public steps fill in as received; canonical Results replace the
same card. No new polling, native request, automatic restart or input replay.

GPT answers and public progress render the observed layout vocabulary with
themed rows, grids, lists, typography and icons while preserving Markdown,
literal code, original copy text and code-source offsets. Known inline entities
and supplied links render normally. Missing citation/image destinations remain
explicitly unavailable; no destinations or native actions are invented.
See [the content coverage inventory](GPT_CONTENT_SUPPORT.md) for supported
formats, official references and remaining math/media/widget metadata work.
This is not full native ChatGPT feature parity.

Linux typecheck/build and 22 focused parser, receipt, incremental-history,
public-progress and link tests passed. Chromium and WebKit passed at phone,
tablet and desktop widths, including seven private public-answer samples from
the affected conversation, pending Results reads, immediate confirmed cards,
canonical identity, draft continuity, safe markup and retained literal code.
Private evidence is in `/tmp/abyssdeck-gpt-rich` on the host and
`.tmp/gpt-rich-evidence` locally; private samples are excluded from Git.
Activated source `4088704c` through the compatible web-only publisher. Release
`1fa6a17a2f81b4d869ba5c0e81b927552a73d49bb16b164e749a21e3bf2a633a`
serves `/assets/index-hwkyNh4y.js`; public page, version and entry returned
HTTP 200. Hub, engine, owner native GPT and GPT gateway retained their container
identities and start times. Engine remains `eebc3a4a` / schema 31; only
`WEB_REVISION` changed. Browser evidence is not a physical iPhone test.

### Contextual quick settings and explicit client recovery - October 8

Settings home now follows the current GPT/Codex mode, with common theme/text-size
links and the existing selected-machine limits overview. GPT offers connection
checks, client access and explicit one-tap restart; Codex reuses the exact selected
computer's existing restart controls and retains confirmation for stopping tasks.

GPT recovery is a typed, actor-bound supervisor operation, independent of the
renderer lane. Durable operation keys coalesce simultaneous taps and survive
restart/lost acknowledgements. It preserves the profile and message receipts;
there is no health-triggered restart, automatic send replay or caller-selected
command/container. Recovery reads run only on the visible settings home after a
manual request. Opening settings performs no restart.

Source validation: Linux type/build and 42 distinct native/service/provider and
Team checkpoint/rollback checks passed;
Chromium and WebKit covered mode selection, one-tap Codex control, GPT duplicate
taps/lost acknowledgement, draft continuity and phone/tablet/desktop layout.
The existing Chromium settings continuity check also passed; its home-limit
expectation now reflects the already-approved usage overview, and it waits for
responsive geometry before checking keyboard resizing.

Installed Hub/engine and web source `eebc3a4a`; both containers are healthy.
Web release `08c349fe9a5be9f5b3fdd6238a01580b9462eaa43d085490e43af9f66fefd263`
serves `/assets/index-TYlqEy-H.js`; public page and entry returned HTTP 200.
The owner's native image is `codex-web-gpt-native:26.928.31416-eebc3a4a`.
Its ordinary idle-admitted replacement preserved the profile and receipts;
subsequent native activity reported ready, and the installed Hub read the new
recovery capability successfully. The GPT gateway and native container were
unchanged during the later Hub update. Other users' older adapters are not
silently replaced; unsupported runtimes report restart unavailable.

An isolated offline enrollment container verified one actual restart, new
instance identity and no repeated restart from the same durable key. No owner
prompt was sent and the owner's recovery button was not invoked as a test.
Private evidence: `/tmp/abyssdeck-quick-settings` on the host. Normal user feedback
remains the source of device-specific findings, not a separate acceptance gate.

### GPT stale native conversation state recovery ? October 8

The reported TrainerOS GPT send failed before submission with
`NATIVE_CONVERSATION_BUSY`. A fresh canonical read showed the latest answer was
`finished_successfully` with `end_turn=true`; the native UI reported no visible
Stop. The current catalog explicitly accepts `latest` / preset 6 as
`gpt-6-thinking` / `max`, so the selection itself was valid. A prepare-only probe
still reproduced the busy rejection without sending input.

Applied the owner's already-authorized recovery restart to only
`codex-web-gpt-native-lab`, preserving its profile and durable receipts. After
initial UI loading (one `NATIVE_CONTROL_TIMEOUT`), the same prepare-only check
succeeded with the unchanged canonical parent and the selected model/effort.
No user message was resent, no unknown receipt cleared, and Hub, engine and
GPT-connect container identities/start times remained unchanged. No source
change or claim about the cause of the native stale state is made; the owner's
next ordinary send remains the end-to-end confirmation.

### Durable Codex conversation recovery logs — October 8

The project overview now offers a chat selector and ZIP export from the Hub's
saved public history, including archived and failed conversations. The archive
contains START-HERE.md, ordered Markdown parts, JSONL with message/turn identity,
coverage metadata and file references only. Attachment/artifact bytes are never
read, fetched or included by the recovery export. Export never resumes a
chat or contacts its computer. Explicit deletion removes the log with its chat.

Schema 31 retains native public history pages separately from the existing live
message journal. Existing catalog discovery starts one initial paginated copy;
its durable cursor survives interruption. Later source-version changes read only
the new tail, while live messages continue through the existing event stream.
There is no new polling timer. Unchanged sources, including failed reads, are not
queried again by the logger. Hidden reasoning and native tool inputs are excluded.
Existing native reads also preserve public pages. All files remain references; incomplete history is explicitly reported rather than invented.

The text-only ZIP uses the common DownloadLink and one closeable saving overlay
on iPhone/PWA. Backfill has a separate public-text mapping path: it does not
register old artifacts, copy images, import tool results or prepare previews.
Linux build/typecheck, 26 focused tests and 3 account-scope/maintenance tests pass.
Chromium and WebKit verified phone/desktop selection, one closeable save overlay,
no document navigation and retained composer draft. Initial copy, unchanged-source
suppression, new-tail reads, interrupted cursor recovery and offline export with
missing attachment bytes are covered. No physical iPhone acceptance is claimed.
Activated as `18ffcee9` through ordinary idle-admitted maintenance with a verified
checkpoint and three-copy retention. Hub/engine are healthy; public web release
`5abfcab39d4306bb27fb4a62f8fe3e8778883f2f80fde29541f7f0415805d957`
and its entry return HTTP 200. Native GPT container IDs/start times are unchanged.
Initial native backfill is running sequentially and has already completed several
conversations. Existing live-journal text is immediately exportable; no claim that
every historical conversation has completed its first copy yet.

### Codex gallery images and failed-thread library actions - October 8

The reported TrainerOS gallery is a local HTML export with 41 sibling PNGs,
several larger than 3 MiB. Its HTML was already captured correctly. Preview
sidecar transfer imposed a 2 MiB cap and the base64 bundle imposed 16 MiB total,
so a valid gallery failed with a misleading generic transfer error.

Interactive Codex previews now keep image references in a private source-bound
manifest, transfer visible images independently into quota-accounted artifact
storage, and deliver them through the authenticated parent to the sandbox as
Blobs. Image originals open in an in-frame dialog with Close; individual failures
offer Retry. No image count, per-image size or total-gallery byte ceiling is
introduced. The old 30-second bundle deadline is removed. Static text/script/CSS
parser budgets remain; the owner requested a separate broader limits audit next.
Old browser clients retain the portable bundle protocol; new clients explicitly
request the interactive image protocol. Portable share/export bundling is still
the old path. Server-backed HTTP/IP/port applications are distinct from local
HTML exports and are not newly proxied by this repair.

Native `systemError` no longer means ENTITY_BUSY for archive/delete. Actual local
turn ownership, native active status and queued work still gate these operations.
Thread deletion also cleans up binary artifacts and the new preview cache files.

Verification: Linux build/typecheck and 23 focused tests passed; Chromium and
WebKit verified lazy images larger than the former ceiling, original/close,
individual retry and parent draft continuity. Both also loaded all 41 images
from the owner's real gallery at phone width. A separate real Linux-to-Windows
transfer probe captured all 41 originals (44,716,217 bytes) with a 24,190-byte
HTML document; it used temporary proof storage, without mutating live history.

Activated as `2133f030` through ordinary idle-admitted engine maintenance with a
verified checkpoint and three-copy retention. Public web release
`f9025242f037ac5ca8a5767b15480884c71c2c5c8050c7bdef1b61bd7752d2d7`
and its entry return HTTP 200. Hub/engine are healthy; native GPT container IDs
and start times are unchanged. The old TrainerOS chat has not been deleted or
archived by the repair; its library actions are available to the owner. Native
iPhone behavior remains subject to ordinary-use feedback.

### Production save-worker policy and Safari sign-in - October 8

Owner feedback exposed a concrete deployment defect in the previous save repair:
the inline blob worker conflicted with the live site's `script-src 'self'` policy.
The old browser fixture did not send that header. Save preparation now loads an
ordinary same-origin worker asset; the site policy remains unchanged. The browser
regression includes the production script/worker restrictions and an exact 38 MiB
transfer, parent return and cancellation.

The explicit Safari copy-link fallback now points to the existing authenticated
file page, preserving its source/name through sign-in, instead of exposing a raw
API URL that answers LOGIN_REQUIRED outside the PWA session. Ordinary in-place
saves do not navigate there. No new file-size or elapsed-transfer limits are added.

The TrainerOS archive is already retained in the private Hub artifact store:
39,733,895 bytes, SHA-256
`6d68a3cae487c8d8ce361ab9860b97dcb9bc633933e8aa7ab627498296a82d2d`,
reverified on the host. A second server buffer would not fix the browser worker
failure. Broader automatic preservation of GPT result files and reuse from server
storage are a proposed product direction, not implemented by this web repair.
Chromium passed the exact-byte transfer, incomplete-stream cancellation, nested
preview return and authenticated fallback under the production script/worker
policy. WebKit passed its supported save/fallback/login paths; its test port has
no OPFS, so it does not prove native iPhone storage/sharing behavior. Linux build
and typecheck passed. Activated as compatible web-only `564385f4`, release
`5b9b1ac03c4832e9321913fa347789ce702c420f912a28896856c2ff286b9401`;
the separate worker asset returns JavaScript successfully. Hub, engine and native
container identities/start times are unchanged. Ordinary iPhone feedback remains
the evidence for the platform's native save UI.

### iPhone save navigation correction - October 7

The owner rejected the `5c7dd818` web handoff in ordinary iPhone use: it added a
second Download page and then opened native ZIP Quick Look without a return.
The passing desktop browser download tests did not establish that interaction.

Current source removes that handoff from ordinary saves. The common save dialog
stays over its parent, prepares remote files into temporary OPFS storage in a
worker, displays progress and invokes native file sharing only on a fresh tap.
There is no application file-size ceiling or elapsed-transfer deadline in this
disk path. Closing aborts preparation and removes temporary bytes; native sharing
retains its backing file until completion. Browser locks protect concurrent saves
and allow abandoned temporary files to be reclaimed after a crashed tab.

Unsupported storage retains the existing small-file memory preparation; its
32 MiB preview/memory budget does not reject browser downloads. Unsupported
iPhone/PWA system saves offer an explicit copy-link fallback without navigating
the app. Desktop browser downloads remain direct. Platform storage capacity and
native sharing support still apply. Previously shared `/download` URLs retain
authentication and now offer the same save dialog plus an explicit return.

The universal viewer and Results preview show a visible Download label, including
when a format has no preview. Source identity, editor snapshots and the installed
quota-based server transfer from `5c7dd818` are preserved. Help is updated.
Chromium verified a disk-backed 38 MiB download by SHA-256, share cancellation,
temporary-file cleanup (including a cancelled incomplete stream) and one request
with no navigation. Chromium and WebKit
verified the visible preview button, closing the nested save back to its preview,
exact local editor bytes, retained draft, and legacy-link login/return/errors.
The Playwright WebKit ports do not expose OPFS: their large-file fallback was
checked, not presented as proof of disk-backed preparation on an iPhone. Native
iPhone sharing remains subject to ordinary-use feedback. The final Linux typecheck
and web build passed. Activated as web-only `57689e42`, release
`4ef01392e75a6745efa112a4c846925bd4d90edd03626975fe44a42abaf2cd35`.
Hub, engine and native-client container identities/start times are unchanged;
the installed server transfer remains `5c7dd818`.

### Download handoff and large Codex exports - October 7

Source fix: standalone PWA saves open an authenticated same-origin download page
instead of navigating directly to an attachment in the iOS browser sheet. The
page retains the exact source through login, checks headers, shows access/network
errors, and provides a native browser download without buffering the body.
Public file URLs and bypass tokens are not introduced. Existing small-file sharing
and local immutable editor snapshots retain their save flow. The 32 MiB preparation
budget is only for in-memory sharing/preview; larger originals use browser streaming.

Codex export capture now uses the available storage quota rather than a fixed
512 MiB ceiling. Transfers no longer expire after ten minutes of total elapsed
time; SSH retains connection/keepalive failure detection. Source identity, checksum,
partial-file cleanup and storage quota checks remain intact. GPT upstream upload
limits and format preview budgets are unchanged.

Verification: Chromium and WebKit downloaded an exact 38 MiB file through the PWA
handoff, retained the parent draft and exact source through sign-in, and handled
denied/malformed/external URLs. Linux build and 18 focused tests passed, including
a real 4 GiB + 16 byte disk transfer with checksum and bounded memory, plus HEAD
and byte ranges beyond 4 GiB. The owner's 39,733,895-byte archive matches its SHA-256
on the Hub. This is not physical iPhone acceptance.

Activated as `5c7dd818` on October 7: compatible web publication followed by the
ordinary idle-admitted engine update with a verified checkpoint and automatic
three-copy retention. Gateway and engine are healthy; the new public download
page is available. Native GPT client/container identities did not change. The
server-side quota-based export transfer is installed too; no force admission was used.

### Website demo using the real application - October 7

The current website edition is `demo/site/index.html` with its entire sibling
asset folder. It builds the real React application, shared windows, editors and
theme CSS with fictional browser-local data. Relative assets support embedding
under a website subdirectory; no Hub, account, external fonts or CDN is needed.
The English demo includes local file edits, notes/tasks/plans, image browsing,
scripted Codex/GPT replies, simulated Git review, terminal and Remote Desktop.
The feature guide distinguishes connected product capabilities from local examples.
Reloading resets the demo. Storage, socket/API calls and service-worker startup are
isolated by the demo build/runtime; production source and services are unchanged.

The earlier independent design and its sources are preserved byte for byte from
`9979549` in `demo/concepts/original/`. The old demo entry redirects to the new
package; embedding now requires copying the whole `demo/site/` directory.
Build/check recipes, iframe markup and redistribution notices are included.
GitHub Actions remain disabled. This is a static website artifact, not a live
deployment or evidence of native AI/device integration.

Verification: Chromium and WebKit passed the nested-path iframe package with
English chat/GPT, Markdown save, Git review/commit simulation, notes/plans,
Devices terminal, Remote canvas, image navigation, settings/help and window
minimize/restore. Both passed all six finishes at 393, 1194 and 1440 px without
page overflow, uncaught JavaScript errors, external requests or API requests
reaching the static host. No installed-app IndexedDB database was created.
WebKit editor input used keyboard focus and a real pointer save with the
automation stability wait bypassed; this is browser evidence, not physical iPad
acceptance. Screenshots and the report are under `.local/real-demo-check/`.

### Standalone English website demo - October 7 (superseded by real-UI edition above)

Added `demo/abyssdeck-demo.html`, a self-contained interactive artifact to copy
into the website's own static files and embed with the documented sandboxed iframe.
All visible text and fictional examples are English. The searchable feature map
covers 54 areas, with six theme finishes and phone/tablet/desktop layouts.
Production theme CSS and icon paths are embedded by a dependency-free builder.
Local text edits, image markup, CSV values, notes, task state, window docking and
downloads work in the browser. AI, GitHub, device and maintenance operations use
explicitly labeled simulations; binary format pages are capability illustrations.
No account, backend, CDN, analytics or external asset requests are required.
This is a distributable demo, not a production client or native integration proof.
No production service, dependency, deployment or GitHub Actions setting changed.

Verification: Chromium and WebKit passed all 54 feature entries with English-only
visible text, retained editor drafts, exact downloaded text, dock restoration,
terminal samples, review receipts and escaped message input. Both engines passed
six finishes at 393, 1194 and 1440 px inside the documented sandboxed iframe,
with no page overflow, JavaScript errors or requests beyond the two local HTML
pages. Chromium screenshots were visually reviewed. The repository guard and
staged whitespace check passed. This is browser evidence, not physical-device
or real AI/device integration acceptance.

### Contributor check repairs - October 7

Cleared all 95 blocking Biome errors: targeted formatting/import ordering,
explicit fixture button types and document languages, callback/assignment cleanup,
a typed screenshot result and a stable settings callback. Narrow documented
suppressions retain intentional control-character sanitization, source-change
speech cleanup, non-form carousel semantics and trusted-code serialization tests.
The shared lint configuration and warning severity remain unchanged.

`ApiError` now uses erasable TypeScript fields so Node's built-in type stripping
can load the quiet-recovery test without a new loader. Two outdated workspace
tests now check read-only inspection: no native writer acquisition or replacement
conversation, with the original identity and native completion status preserved.
The Sessions implementation was not changed to satisfy those tests.

Verification: lint exits 0 (0 errors, 1,310 warnings, 1,893 informational diagnostics);
build/typecheck and 54 focused tests passed on Windows and Linux with Node 24.18.0.
Linux used a disposable network-isolated container with preinstalled dependencies,
not production state. The Linux native-compatibility fixture was rerun separately
after adding its omitted source module to the temporary verification archive.
The focused set covers quiet recovery, workspace tools, book-reader indexing and
speech, native compatibility, GPT links and retained results. Full-suite and
clean-install reproducibility remain open in #238; no additional check framework,
dependency update, GitHub Actions, deployment or service restart was introduced.


### Contributor entry and documentation cleanup - October 7

The owner authorized retiring the four remaining historical branches. PRs #216
and #217 are closed without merging obsolete code; the remote now has only
`main`. All original branch tips remain in the verified local bundle. Local
worktrees and deployed release paths were not removed. GitHub Actions are disabled
at repository level, with no active runs. Issue/PR templates add reporting guidance,
not automation.

README and Contributing now point to an isolated local first run and checks by
platform. The documentation map groups feature/operations guides; HISTORY indexes
dated audits and mixed implementation journals without moving their URLs. Old
platform/UX/native-work specifications are explicitly scoped as historical.
Devices close/minimize behavior and dictation's native transport were reconciled
with source. Member onboarding now uses the reader's own Hub rather than the
maintainer's private installation address.

Verification on Windows, Node 24.18.0 / pnpm 11.13.1: build and typecheck passed;
the documented empty-machine local config started with disposable state, served
the interface and healthy API, and created its private first-use link. No native
account or production service was connected. The repository guard and its test
passed; local Markdown/image paths and documentation anchors passed across 1,983
Markdown files. This was not a clean Linux-host installation rehearsal.

At the end of this documentation pass, lint reported 95 errors, 1,310 warnings and
1,893 informational diagnostics (#238; blocking errors subsequently fixed above).
The dependency audit reported 13 findings
(4 high, 7 moderate, 2 low, none critical; #237). Applicability and upgrades require
their own verification; these counts are not proven exploitable application paths.
The full test baseline, clean-host installer (#11), specialist-document consistency
(#176), and release notice/source packaging (#240) remain open. No application code,
dependency version or installed service changed in this documentation pass.

### Public branch cleanup - October 7

Verified the 76 remote branches against `main`, exact merged PR heads and patch
equivalence. Removed 71 completed branches with an atomic, expected-SHA guarded
push. That first pass retained `main`, PR branches #216/#217 and historical
`fix/settings-live` / `fix/speech-live` backports. The owner's subsequent explicit
retirement of the remaining four is recorded above.
Open PRs, local worktrees and installed releases were preserved. A verified local
Git bundle and exact ref manifest retain all 76 original branch tips.

Contributor guidance now identifies `main` and short-lived PR branches, with
cleanup after verified integration. GitHub Actions remain disabled; no workflow,
automatic merge or deployment was enabled. This was repository maintenance only.

### GPT native-outcome repair - October 7

Owner-authorized follow-up to the audit removes duplicate history/renderer/send
startup deadlines and the two-minute synthetic delivery warning. Real native
stream/read errors now reach the exact chat job through a small typed envelope;
partial output, attachments and uncertain receipts remain. Temporary read errors
no longer cause permanent chat pauses. Explicit Retry-After is honored without
an extra minimum, and repeated cooldown/busy preflight remains queued before any
upload/send. Pending history reads remain shared across cache expiry.

Linux build and both TypeScript checks passed, together with 310 regression
tests and nine native-adapter upgrade/rollback tests. Chromium and WebKit passed
the phone/tablet flow, retained draft/output, one-send lost acknowledgement and
visible native error. Repository guard and focused lint passed.

Activated source `aef6fd3`: Hub/engine and published web use that revision; the
owner native image is `26.928.31416-aef6fd3`, retaining the same official app,
profile/account binding and previous container for rollback. Ordinary idle
admission was used, without force. The verified Team checkpoint retains all
managed namespaces; retention kept three completed checkpoints. Preparation took
138 seconds while online, followed by 91 seconds of gateway/engine downtime.

Post-install checks: gateway/engine healthy; local GPT status 70 ms, bound activity
ready/non-generating in 1.9 s, three model versions in 2.3 s, and the reported
TrainerOS conversation's 282-node canonical history in 8.3 s. Installed adapter
modules match source hashes. No user prompt was submitted/replayed. Fixture tests
cover send/error behavior; these live checks are reads, not a claim about future
upstream availability. The earlier longer outer budgets below are superseded by
native-owned operation completion. See
[the audit and repair evidence](GPT_RELIABILITY_AUDIT_2026-10-07.md).

### GPT reliability audit and bounded polling fixes — October 7

The [GPT integration audit](GPT_RELIABILITY_AUDIT_2026-10-07.md) follows the
owner's failed-send report and request to inspect the whole GPT path. Live checks
found a responsive native conversation reader, a model-read cooldown, and an idle
receipt from October 3 still polled every 30 seconds. The dismissed attempt no
longer retained its original error, so that failure cannot be attributed precisely.

Source now expires unchanged idle receipt watching after five minutes, resumes it
on explicit conversation opening, avoids warming history for unchanged receipts,
preserves metadata caches during read-only preparation/reconciliation, and aligns
outer preparation/receipt deadlines with their slower bounded inner reads.
Actual active work and uncertain receipts remain intact; no send replay was added.

Seven focused suites passed on Linux (120 tests); the metadata-cache regression
passed separately on Linux and the inner slow-history regression passed separately
on Windows. TypeScript build passed; focused lint had no errors, with existing
warnings/information remaining. Temporary Linux test files used an isolated path,
not installed runtime modules or native profiles.

These changes are source-only: production still uses Hub/engine `00c8adc` and the
owner's native runtime `26.928.31416-f7347ec`. No services were restarted and no
user messages were sent. Cooldown timing propagation, consistent read-error
handling and coordinated refresh scheduling remain follow-up work. A local ready
process is not proof of upstream send availability.

### Owner-approved license adoption — October 6

The owner explicitly selected AGPL-3.0, including commercial use and paid hosting
under its source-sharing terms. Original AbyssDeck material now uses
`AGPL-3.0-only`: the full standard text is in LICENSE, with project attribution in
NOTICE and scope/contribution guidance in docs/LICENSING.md. Root/workspace npm
metadata and Companion package-license metadata use the same SPDX identifier.
No future-version permission, copyright assignment or CLA was added.

THIRD_PARTY_NOTICES.md distinguishes dependency licenses, vendored Guacamole/font
notices and the separately licensed MIT DXF Viewer adaptation. Existing upstream
notice files were preserved byte-for-byte. Production npm metadata was inspected
on Windows; this is not a complete native/NuGet/Linux redistribution audit.
Repository license adoption resolves #239; exact binary/container notice and
source packaging remains #240. No application behavior, installed runtime,
service, account or private data changed. GitHub Actions remains disabled.

### Public repository preparation — October 6

Documentation-only cleanup follows the public-readiness audit of `f6b071e`.
The README now uses the English promotional pack with its translation provenance;
the entry architecture/vision/roadmap distinguish current components from history.
Added a documentation map, contribution guidance and a private security-reporting
entry. Deployment now documents the engine/gateway split and initial web-release
publication, with clean-host verification still pending in #11. No runtime or
application source was changed or activated for this pass.

GitHub Actions is disabled at repository level. Automatic security-update PRs and
auto-merge were already disabled; no workflows or webhooks were present. Private
vulnerability reporting is enabled as a manual reporting channel.

New issues: #237 dependency advisories, #238 reproducible local checks, #239 license
decision. Existing #176 retains the broader documentation follow-up. The license
is not selected by this cleanup. Biome now honors Git ignore rules: the 15 errors
from ignored native build output disappear; the 96 tracked-file errors remain
visible and are tracked in #238. The repository guard, local document links and
whitespace checks passed. This is not a fresh Linux installation or full-suite pass.

Removed only the obsolete local `companion-source-052` and `companion-source-053`
build worktrees after checking clean source, merged commits and no referencing
process/service/scheduled task. Other worktrees, private state, histories and
installed runtime releases were preserved. Added `.codex/` to Git ignore rules.

Этот файл содержит текущую установку и остаток. Подробные прежние проверки,
версии и квитанции сохранены в [истории](STATUS_HISTORY_2026-10-02.md).
Историческое «следующее действие» не является новой задачей.

### Computer Use между окнами и диалогами — 5 октября

По уточнению владельца снята привязка задачи к одному окну. Источник `126f49b`,
отдельный Windows Computer Use host **1.1.0** установлен и отвечает через прежние
подключённые MCP-прокси. `observe` следует в активный owned-диалог, а сохранённый ID
закрытого диалога возвращает к исходному приложению. `window="active"` позволяет
увидеть новое активное окно; список включает окна без заголовка и связи владельцев.
Ответ ввода содержит `nextWindow`. Общая блокировка `WINDOW_OCCLUDED` удалена:
частичное перекрытие не запрещает снимок, точная цель клика проверяется отдельно.
Переход к другому окну разрешает новое наблюдение, но не старый ввод; повторов нет.

Исправлена активация между потоками окон; короткое создание native-диалога
дожидается готовности чтением. Проверены protocol/capability suite, реальные
offscreen HWND (включая вложенные диалоги и возврат) и видимые disposable fixtures.
Через **установленный host** трижды подряд пройден настоящий Windows Open picker
с путём на кириллице и возвратом по ID закрытого диалога; проверены переключение
между двумя окнами, отклонение устаревшего ввода, снимок с перекрытием и отказ
клика в перекрывающий элемент. Файлы не загружались в сайты и сообщения не отправлялись.
Последующее наблюдение `window="active"` через прежний MCP-прокси успешно получило
сохранившийся встроенный браузер. Содержимое пользовательских форм не изменялось.

Источник установленного runtime:
`81d3d5a4e1899ba85341a91fee0c79d8ebf1e45c330d8ce38e05cabf91db8744`.
Перезапущен только optional GUI host; остальные 25 отслеженных процессов, включая
браузер, Companion и Codex, сохранили PID/время старта. Предыдущий runtime/task/pointer
сохранён installer. MCP registration обновлена для новых подключений. Уже загруженные
описания tools получат новый текст при обычном reload/reconnect; работающий host
и подсказки в его ответах обновлены сразу. Принудительный перезапуск чатов не делался.

### Повторяющийся WINDOW_OCCLUDED — 5 октября

Исправление `14275ec` установлено в отдельный Windows Computer Use host 1.0.3.
На реальном открытом встроенном браузере воспроизведён отказ 1.0.2:
собственное окно WebView2 `Chrome_WidgetWin_1` с `exStyle=0x082000a0`,
прямым owner HWND браузера и строкой ссылки снизу считалось чужим перекрытием.
Это не потеря связи с Hub и не необходимость постоянно активировать браузер вручную.

Пассивная поверхность того же пользователя/сессии с точным owner и всеми тремя
стилями NOACTIVATE/TOOLWINDOW/TRANSPARENT теперь входит в наблюдаемое окно.
Пустой заголовок или общий процесс не дают исключения. Чужие перекрытия и обычные
диалоги остаются блокирующими; focus, foreground, точная цель указателя и
одноразовые наблюдения сохранены.

Проверки: основной protocol/capability suite и 6 вариантов настоящих offscreen
Win32-окон прошли. После установки существующий MCP-клиент получил полный снимок
того же окна с прежней строкой ссылки; одиночный Shift успешно отправлен, затем
сделано новое наблюдение. Сообщения/вложения не отправлялись и не редактировались.
Перезапущен только `CodexWebComputerUse`; браузер и остальные 24 отслеженных
процесса сохранили PID/время запуска. Main Companion, Codex, Hub и GPT не обновлялись.
Источник установленного runtime:
`6e7e55a958090815ceea017bf159b54bfe36fe8f263b4fa45a5ecb153ec9ef02`.
Предыдущий runtime и резервная копия task/pointer сохранены штатным installer.
Длительная обычная работа после исправления ещё не наблюдалась.

### Вставка текста в Remote — 5 октября

Добавлена кнопка буфера рядом с клавиатурой: местное поле с «Из буфера» и явной
«Вставить». Подготовка текста отделена от Guacamole.Keyboard, включая IME;
запоздавшее чтение буфера не заменяет новую правку. Ввод передаётся существующими
Unicode keysyms порциями, без дополнительного Enter. Переносы строк и Tab имеют
обычное клавиатурное значение. Закрытие/скрытие/разрыв связи останавливает ввод
без повторной отправки; уже введённые символы остаются.

Проверены сборка, 9 scoped Remote-тестов и Chromium/WebKit: кириллица и Unicode,
отказ clipboard API, запоздавшие чтения, отмена и телефон/планшет в трёх темах.
Это браузерные проверки с тестовым транспортом, не проверка живого ввода на ПК.
Совместимый веб `da79b56` опубликован штатным publisher; проверены live version
и SHA-256 загружаемого entry. Квитанция: `verification-da79b56-web/receipt.json`.
ID и время старта Hub, engine, GPT native и guacd сохранились. Переподключение
Companion, установка helper и перезапуск рабочих чатов не выполнялись.

### Пустая история TrainerOs — 4 октября

История сохранена. Подтверждён отказ Companion на страницах `thread/items/list`
с несколькими generated images: ответ 32–36 MB превышал предел кадра 16 MiB.
Catalog теперь уменьшает число элементов только для повторного чтения того же
курсора при типизированном отказе размера. Мутации не повторяются, порядок и
элементы сохраняются. Начальная загрузка веба восстанавливается после временных
502/503/504/сетевых отказов, включая возвращение на вкладку.

Проверены сборка, 22 теста Catalog/error/history, Chromium и WebKit с тремя
начальными отказами и восстановлением без отправок. Отдельное read-only чтение
реальной native-истории TrainerOs подтвердило успешное уменьшение 40 → 20 → 10.
Релиз `90367b5` установлен штатно с проверенным checkpoint. При проверке живого
API обнаружена несовместимость переименования: новый `clientInfo.title` нарушил
точное сравнение initialize у сохранённого Companion runtime. Восстановлено
прежнее служебное имя; видимый бренд остаётся AbyssDeck. Прямое read-only
подключение с исходными параметрами подтвердило тот же instance/PID и два
продолжающихся хода. Добавлен регрессионный тест совместимости инициализации.
Поправка `00c8adc` собрана и подготовлена на сервере: 35 candidate-тестов,
27 checkpoint/admission/rollback-тестов, Chromium/WebKit image smoke прошли.
Обычная проверка установки блокируется двумя Codex-ходами: старый engine
не может подтвердить их из-за изменённого initialize, хотя отдельный read-only
probe с прежними параметрами подтвердил точный instance и PID 17940.
Владелец подтвердил установку. При следующей проверке `00c8adc` уже установлен:
квитанция `deployment-00c8adc.json` фиксирует healthy, проверенный checkpoint и
время 17:28:03 UTC. Повторная установка не запускалась. Публичный history API
TrainerOs вернул HTTP 200, 14 сообщений последней страницы, финальный ответ и
курсор старой истории вместо прежнего 503. Ход завершён, native процесс PID 17940
с прежним временем старта сохранился. Владелец подтвердил: «Уже работает».
Исходники и исправление служебного имени находятся в main; живой Hub/веб —
`00c8adc`. Проверочные сессии API отозваны после чтения.

### Исправление повторных остановок из-за checkpoint — 4 октября

Подтверждён источник остановок Hub/engine каждые 30–40 минут: системный
`codex-workspace-checkpoint.timer` повторял неудачный холодный checkpoint.
Проверка личной SQLite-базы ошибочно применяла лимит чтения небольших файлов
1 GiB; реальная база выросла примерно до 1.5 GiB. ОС не перезагружалась.
Последняя наблюдавшаяся остановка: 16:22:57–16:24:57 UTC.

Лимит снят только для личной SQLite-базы, которую штатный SQLite backup копирует
постранично. До первой остановки coordinator теперь сохраняет durable attempt;
неудачная/оборванная попытка запрещает повторную автоматическую остановку,
включая после перезагрузки. Восстановление сервисов по журналу сохраняется.
Повтор после устранения причины — явный `--retry-failed` с обычной проверкой idle.

Владелец установил `checkpoint-fix-20261004/package-v2` в 16:42:24 UTC.
Квитанция установки подтверждает совпадение всех пяти установленных модулей
с пакетом; installer не запускал checkpoint. Ежедневный backup переключён
на проверенный maintenance-only образ
`sha256:23954d1488a8dd03dc35af9995d87c6d952d9b7e5cc50c1a9f42ca046b699fdc`.
Этот же образ использует verifier холодной копии только для engine `54d9afe`;
после смены engine используется его собственный backup-код. Работающий Hub,
engine и native процессы для установки исправления не заменялись.

Проверки: TypeScript Hub; 27 Linux-тестов coordinator/installer/disk backup;
три сценария Team backup/restore, включая воспроизведение отказа старого кода
при размере SQLite >1 GiB и успешное восстановление с исправлением. Проверки
репозитория и scoped lint прошли. Первая реальная онлайн-попытка выявила ещё
одну причину задержек: внешние записи перезапускали шаги incremental SQLite backup.
Для WAL-базы закреплена read-транзакция на время проверки и копирования;
отдельный writer продолжает записывать. Регрессионный тест воспроизводит
изменение снимка на старом коде и подтверждает стабильный снимок после исправления;
все три maintenance backup/restore теста прошли.

Ежедневный поток использует дополненный maintenance-only образ
`sha256:7d289819180aa878a82aa7ad97913b5033df1baf2be32d595b95c99b2901a9e8`.
Реальный backup завершён успешно в 17:02:15 UTC; квитанция
`daily-wal-activation.json` подтверждает сохранение ID и времени старта Hub/engine.
Холодный verifier остаётся на предыдущем проверенном образе: он читает уже
замороженную базу, поэтому исправление живого WAL ему не требуется. Новый полный
парный checkpoint ещё не подтверждён. Квитанции находятся в
`checkpoint-fix-20261004` и `workspace-checkpoint-install.json` на сервере.

### AbyssDeck: новое имя продукта и репозитория — 4 октября

Продукт переименован в **AbyssDeck**, GitHub —
[`EriArk/abyssdeck`](https://github.com/EriArk/abyssdeck). Обновлены README,
актуальные названия интерфейса/PWA, Companion, документация и ссылки на Issues.
Локальный и серверный origin используют новый адрес. Каталоги данных, службы,
идентификаторы пакетов/MCP, схемы URL, аккаунты и история сохраняют совместимость.
Исторические снимки экрана не перерисовывались.

Исходники: `a4b0eef`. Веб опубликован отдельно, без перезапуска Hub/engine;
совпадение контейнеров и времени запуска проверено до/после. Проверены публичные
HTML, manifest и version.json. Сборка, проверки репозитория, 22 проверки Doctor/
Companion и .NET Companion checks прошли. Экран входа просмотрен в размерах
телефона, планшета и компьютера, переполнения и ошибки страницы не обнаружены.

Подписанный Companion **0.5.7** опубликован и установлен штатным обновлением
на ПК владельца: `committed`, health-подтверждение нового процесса получено.
Ярлык — `AbyssDeck Companion`. Манифест пакета:
`c9f1164d420249276e57226116d5c3a9a8198b085331c694fe04f6219fdbd6ec`.
Открытые окна встроенного браузера не закрывались; новое имя его компонента
подготовлено в пакете и применяется при штатной безопасной замене.
Серверный движок остаётся `54d9afe`: изменения описательных строк backend и
распознавание нового имени проекта Doctor войдут в следующее обычное обновление.
Квитанции: `verification-a4b0eef-web/receipt.json` и
`verification-companion-a4b0eef` на сервере; локальная проверка —
`.local/abyssdeck-qa/browser.json`.

### Владелец использует прямой сервер — 4 октября

По уточнению владельца личное окружение предназначено для приглашённых пользователей.
У аккаунта владельца установки скрыты его создание/подключение и дополнительное
устройство server-workspace; сохранён прямой hub-host. Запросы create/start/connect
для владельца отклоняются до запуска команд. Прежняя ready-запись и диск сохранены.
Обычная роль администратора Hub у другого пользователя не даёт доступа к хосту и
не исключает его из личных изолированных окружений.

Hub `54d9afe` установлен штатно, без force; native и остальные 69 сервисов не
перезапускались. Проверены 19 сценариев transport/workspace/health, подключение
окружения участника во время работы и исключение владельца через HTTP API,
проверки обновления/отката Team. Chromium/WebKit: блок окружения скрыт, подключение
ПК осталось, 390/1024 px и три темы; снимки просмотрены. После установки реальные
API подтвердили отсутствие server-workspace, наличие hub-host, сохранение прежней
ready-записи, доступный ПК и healthy/canSend=true у GPT. Сохранены три checkpoint.
Квитанция: `verification-54d9afe/continuity-after.json`; перерыв Hub 131627 мс.

### Личный Linux без встроенного Codex — 4 октября

Владелец подтвердил удаление обязательного Codex из прежнего серверного окружения.
Подготовлены образ без Codex и отключение автоматического Codex runtime, опроса
проектов/активности и проверок Codex. Устройство, терминал, файловый транспорт и
сохранённые данные остаются. ПК владельца и его Codex не меняются.

Точная причина недоступности окружения — `RECEIPTS_FULL` у rootless broker.
Подготовлено ограниченное хранение завершённых status-проверок и очистка завершённых
записей при переполнении. Неизвестные исходы сохраняются в прежнем сроке хранения.
На Linux прошли 22 проверки broker и два сценария замены образа/отката.
Корневая установка ещё НЕ выполнена: нужен пользовательский sudo в Devices.
`ops/workspaces/remove-bundled-codex.py` по умолчанию делает dry-run; `--apply`
проверяет idle, сохраняет прежний контейнер и SQLite, меняет образ точного владельца
и helpers, повторно использует тот же диск.

Это не установка нового системного Linux/Incus. SSH/SFTP через Tailscale, свои
пакеты/службы и независимая от Hub жизнь остаются отдельным следующим этапом по
`docs/PERSONAL_LINUX.md`.

Hub/web `9edd8da` установлен обычным обновлением, без force. Проверены здоровье
engine/gateway и SHA-256 выдаваемых ресурсов; manifest
`ea36f1f6618f31470787d5dcee3453c8faac090dab625f694e6c61e0a63a8768`.
Авторизованные API подтвердили: устройство server-workspace сохранено, его проекты
Codex и предупреждения каталога отсутствуют; ПК доступен, GPT healthy/canSend=true,
activeJobs=0, unknownJobs=3. Native и 69 остальных сервисов не перезапускались.
Перерыв Hub 49388 мс, сохранены три последних проверенных checkpoint.
Chromium/WebKit проверили настройки на 390/1024 px в трёх темах; снимки просмотрены.
Квитанции: `verification-9edd8da/{receipt,continuity-after}.json`.

Готовый проверенный root-пакет на хосте:
`/home/abysscloud/services/codex-web/workspace-codex-removal-20261004/`.
Образ `sha256:a436cc301a6db48ec51f9d426f35352964e62d2a56d79e35098708fd162ed233`:
запуск, Node/Python/Git/SSH и отсутствие Codex проверены без личных данных.
Host-скрипт из `824cfd0` проверен на замену и откат, не останавливает Hub; применим
к подтверждённому полному broker после проверки простоя именно его контейнеров.
Пакет и исправление хранения receipts пока НЕ установлены: sudo требует пароль.

Повторная проверка после скриншота 09:45: запуск остановился до изменений с
`WORKSPACE_BACKGROUND_WORK`. На хосте у PID 1 прежнего контейнера обнаружены
359 завершённых процессов (358 Z и один Zs), живых дочерних команд нет.
Проверка ошибочно требовала одну строку процессов, а `sleep infinity` не убирал
осиротевших завершённых детей. Пакет обновлён на том же пути: общий разбор
pid/ppid/state для удаления и checkpoint игнорирует только подтверждённые Z,
живые/приостановленные команды по-прежнему блокируют замену. Новый образ использует
Tini как PID 1; реальный тест 40 осиротевших детей оставил ноль зомби.
Прошли 5 проверок удаления/отката/процессов, 11 checkpoint и 22 broker.
Владелец повторно применил root-пакет 4 октября в 10:17; вывод подтверждает
`installed=true`, `diskPreserved=true`, откат сохранён в
`/var/lib/codex-workspace-maintenance/remove-codex-20261004T071728`.
После этого через штатный Hub → SSH → owner-bound broker подтверждены ready/running
и точный новый image digest. Реальная команда в окружении завершилась с кодом 0:
пакет и executable Codex отсутствуют, /workspace/home и /workspace/projects на месте,
PID 1 — tini, процессов Z нет. Прежний RECEIPTS_FULL больше не блокирует status/exec.
Доказательство: `verification-9edd8da/workspace-removal-installed.json`.
Удаление обязательного Codex завершено; это не активация следующего Incus/SSH этапа.

### Готовность GPT и предупреждения проектов — 4 октября

Исправление установлено в Hub/web `f57461f`: общая готовность GPT использует локальный
native `workspace/activity`, проверяющий привязку аккаунта и наличие оболочки.
Загрузка каталога моделей больше не участвует в общем статусе; проверка модели,
лимитов, текущей ветки и квитанций перед настоящей отправкой сохранена. Холодный
Hub/новый native instance всё ещё требует своей проверки аккаунта. Смена аккаунта
сбрасывает прежнюю готовность, временная занятость локального чтения ограничена
backoff. Статус ожидания — starting, а не ложное «GPT работает».

На работающем сервере подтверждён `/api/gpt/status`: busy/canSend=false при нуле
активных задач; затем healthy/canSend=true без перезапуска GPT. Отдельная проверка
проектов показала доступный ПК и SERVER_WORKSPACE_UNAVAILABLE у старого серверного
окружения. Его общее предупреждение ошибочно попадало в чаты проектов ПК.
API теперь передаёт машинную принадлежность предупреждения; веб показывает только
ошибку выбранного устройства, не возвращает закрытую плашку при каждом фоне и
убирает её после восстановления. Одновременные обновления каталога объединены.
Личный Linux не устанавливался; недоступность старого окружения не объявляется
исправленной этой правкой интерфейса.

Локально проверены TypeScript, сценарии provider/аккаунта/квитанций, API каталога
и Chromium/WebKit: отправка при медленной истории/каталоге моделей, сохранение
черновиков, принадлежность предупреждений, закрытие и восстановление.
После установки подтверждены healthy/canSend=true, activeJobs=0; три неизвестные
квитанции сохранены. Native остаётся `26.928.31416-f7347ec` без рестарта; Companion
не изменён. Квитанция установки: `verification-f57461f/receipt.json`.

### Незавершённые ответы GPT и файлы — 4 октября

Установлена передача публичных сводок native `thoughts.summary` и `reasoning_recap`
через общий путь истории и проверки вложений. Скрытые группы, `raw_cot`, внутренний
analysis и тела вызовов инструментов не экспортируются. Ссылка на файл сохраняет
точный исходный message ID и проверку текущей ветки/аккаунта при скачивании.
Окончание хода на ошибке сохраняет доступный текст и файлы в чате/Результатах с
пометкой «Ответ не завершён», не создаёт бесконечную активность и не подтверждает
успешное завершение отправки. Позднее canonical-обновление заменяет это состояние.

Проверены проекция, скачивание, скрытые данные, замена состояния поздним ответом
и сохранение после перезапуска. На Linux прошли 81 проверка логики/IPC/хранения/
обновления Hub и 9 проверок установки native-адаптера. Chromium/WebKit проверили
доступность текста/файла и отправки на 390/1024 px; снимки просмотрены.

Hub/web установлен `f7347ec`, native — `26.928.31416-f7347ec`. Обычное idle admission,
резервная копия и проверка отката сохранены, принудительная установка не применялась.
Проверены здоровье engine/gateway, SHA-256 выдаваемых веб-ресурсов и установленного
`renderer-read.mjs`; 68 остальных контейнеров не изменились. Простой Hub составил
221115 мс, основное время заняла проверка снимка. Сохранены три последних checkpoint.

После установки обычный авторизованный запрос истории вернул HTTP 200 без `stale`:
в сохранённой истории 708 публичных сообщений, из них 370 сводок/комментариев.
«Художественное описание Юри» синхронизирован до `04_dym_nad_dorogoy_v1.md` и
`00_zhurnal_nepreryvnosti_v4.md`. Глава скачана через штатный приватный маршрут:
HTTP 200, 41023 байта. В актуальной canonical-ветке помеченных незавершённых ответов
уже нет; сценарий ошибки без final проверен фикстурами, не объявляется свежим
воспроизведением исходной ошибки iPhone. Ошибку генерации внутри самого ChatGPT
этот перенос не устраняет. Отправки не повторялись.

Квитанции: серверная `verification-f7347ec/{receipt,continuity-after,
exact-chat-readback,download-proof,pair-complete}.json`, а также
`verification-f7347ec/codex-web-gpt-native-lab/installed.json`.

### Лимиты на главной настроек — 4 октября

Возвращены лимиты Codex и остаток кредитов на главную общих настроек Codex/GPT.
Блок использует выбранную машину; подробная страница и подтверждение сбросов
сохранены. Скрытый блок не опрашивает устройство. Обновлена справка.
Сборка web и проверки Chromium/WebKit прошли: главная, переход к сбросам,
сохранение черновиков обоих клиентов и отсутствие чтений после закрытия.
Снимки телефона и широкого окна проверены в четырёх темах.
Web `4e681de` опубликован после серверной сборки и 16 проверок лимитов/квитанций.
HTTP entry, JS/CSS и SHA-256 manifest проверены. Hub, engine и GPT сохранили
прежние процессы и время запуска; Companion не обновлялся.
Доказательство: `verification-4e681de/web-check.json` в каталоге сервиса на сервере.
Личный Linux отложен владельцем.

### Личный Linux и общая роль Companion — подготовка 3 октября

Владелец уточнил и одобрил самостоятельное Linux-окружение для приглашённых
друзей/сотрудников: SSH/SFTP через VPN/Tailscale, администрирование внутри гостя,
пакеты, постоянные файлы и службы. Codex необязателен. Companion обеспечивает
работу устройства в целом; готовность одной интеграции не блокирует остальные.
[Решение, границы и оставшиеся шаги](PERSONAL_LINUX.md).

Подготовлен отдельный Incus host-пакет `ops/personal-linux`: ограниченные
project/pool/profile, отдельная сеть с защитой хоста/LAN/Tailnet/соседей,
устойчивые установочные квитанции и проверка на двух временных контейнерах.
Проверка предусматривает реальные SSH/SFTP, установку пакета, systemd, сохранность
после перезапуска, изоляцию UID/cgroup/seccomp, живые сетевые запреты и ENOSPC.
Она не устанавливает Codex и не использует реальные пользовательские аккаунты.
Упакованный запуск проверяет SHA-256 всех четырёх исходников по manifest.

На реальном Ubuntu 24.04 выполнены 13 Linux-проверок управляющей логики,
компиляция Python и read-only preflight/план. Подтверждены свободное место и
отсутствие пересечения новой подсети с текущими маршрутами. Incus ещё не установлен;
неинтерактивный `sudo` требует пароль. Это **подготовка исходников и установки**,
не доказательство реальной изоляции, готового SSH-маршрута или миграции пользователя.

Старый Podman broker остаётся active, прежние диски и подключения сохранены.
Hub/GPT/Windows Companion этим пакетом не обновляются. Сначала нужен системный
запуск готового пакета через Devices → Сервер и успешный отчёт
`/var/lib/codex-personal-linux-readiness.json`. После этого продолжить закрытый
broker/Companion adapter, ключи и точный маршрут Tailscale, backup/restore и переход.
Предложение про «Планы, задачи и заметки» ниже отложено этим выбором владельца.
Рекомендуемый режим для продолжения: GPT-6 Astra, Высокое (`high`).

Исходники `e76e9cd` отправлены в `main`. Точный пакет размещён на сервере:
`/home/abysscloud/services/codex-web/personal-linux-e76e9cd`.
Повторный запуск `apply-bundle.py` без `--apply` подтвердил все хеши и preflight.
SHA-256 manifest: `016c189d8483399b7f1eb54c7e03b865ea9b47188704a18d50a491aa4cab8a47`.
Команда для системного шага в приватном терминале сервера:

```sh
sudo python3 /home/abysscloud/services/codex-web/personal-linux-e76e9cd/apply-bundle.py --apply
```

### Настройки: одобренная структура в рабочих компонентах — 3 октября

После «Неплохо. Продолжаем» эскиз перенесён в общие настройки Codex/GPT.
Пять обычных разделов, отдельное администрирование, поиск конкретной страницы,
детали компьютера и выбранные лимиты вместо длинной общей страницы подключений.
Один вход в GPT; Doctor сохраняет место возврата. Посещённые формы и прокрутка
сохраняются, скрытые подразделы прекращают чтения; пароли очищаются при уходе.
Существующие права, команды, подтверждения и квитанции сохранены. Обновлена справка.
[Рабочие снимки и карта функций](../polish/07-settings-devices/settings-implementation/README.md).

Сборка web и 16 проверок лимитов/квитанций прошли. В Chromium/WebKit прошли
сценарии сбросов с потерянным подтверждением, повторным открытием и без повторного
расходования; общие настройки из Codex/GPT и точный Remote сохраняют редакторы.
Компоновка проверена в обоих браузерах: четыре темы × пять ширин, по 11 страниц;
отдельно — прокрутка, регулируемая навигация, сохранение форм, очистка пароля,
права администратора, отсутствие скрытого опроса GPT и границы окна с клавиатурой.
Исправлены узкая карточка темы и конфликт старого материала окна с новым корпусом
в теме 2000. Снимки просмотрены. Windows WebKit при намеренной замене документа
оборвал старый presence fetch; этот точный тестовый артефакт ограничен моментом
reload, повторная проверка навигации и смены роли прошла.

Web `6d97f47` опубликован штатным совместимым publisher после Linux-сборки и
повторных 16 проверок. Manifest:
`123bf9e4776c7ecb9675e4cb58f0fe4024257a8744c1240b506be869c4a37d47`.
HTTP entry, основной JS и CSS сверены по SHA-256. ID, образы и время запуска
engine/gateway `f32b7f3` и GPT-коннектора не изменились; Companion не обновлялся.
Квитанции на сервере: `verification-6d97f47/{linux-build-verified.txt,processes-before.json,web-check.json}`.
Это автоматизированные проверки, а не физическая проверка iPhone/iPad.

Следующий предложенный самостоятельный проход — разобрать «Планы, задачи и заметки»:
сначала сопоставить существующие функции и повторы, затем показать небольшой эскиз.
GPT-6 Astra, Высокое (`high`).

### Настройки: интерактивный эскиз структуры — 3 октября

После продолжения владельца подготовлен
[эскиз настроек и 15 экранов с описаниями](../polish/07-settings-devices/settings-study/README.md).
Пять общих разделов, отдельное администрирование, поиск страниц/конкретных действий,
детали компьютера, личного окружения, Codex и GPT. На телефоне — список → раздел →
детали; широкий экран сохраняет регулируемую навигацию слева. У GPT показаны
четыре состояния и один вход в подключённый клиент. Doctor открывается в одном
месте, с возвратом к источнику перехода. Настройки оформления и локальные черновики
сохраняются внутри эскиза; пароль и реальные команды не запрашиваются.
Проверены Chromium/WebKit, четыре темы × четыре ширины, по 16 ключевых страниц
на комбинацию; отдельно — поиск, переходы, черновики, разделитель, состояния GPT
и фокус вложенного окна. Снимки визуально просмотрены; это не аппаратная проверка.
Производственные компоненты, аккаунты, Hub и Companion в этом этапе не менялись.
Последняя подтверждённая установка остаётся веб `43ccf6b`, Hub/engine `f32b7f3`;
в этом этапе повторного опроса установки не было.
Следующий предложенный этап — реализация согласованной структуры в общих
настройках с сохранением функций, прав и квитанций, контекстными чтениями скрытых
разделов и обновлением справки. Сначала обратная связь по эскизу.
GPT-6 Astra, Высокое (`high`).

### Настройки: разбор структуры перед эскизом — 3 октября

Владелец подтвердил следующий проход и попросил объединить связанные настройки.
[Разбор и 26 текущих экранов](../polish/07-settings-devices/settings-review/README.md)
сопоставляют существующие компоненты с предлагаемой структурой: Интерфейс,
Подключения, История и данные, Обновления и диагностика, Мой аккаунт;
Пользователи и доступ — отдельно для администраторов. Предлагаются одна карточка
состояния GPT, единая точка настроек каждой машины и контекстные входы в существующие
Устройства/Doctor; права, квитанции и функции не объединяются и не удаляются.
Сняты реальные React-компоненты на одноразовых демонстрационных данных в Chromium:
телефон/планшет и все четыре темы. Проверено отсутствие ошибок страницы,
native отправок и управляющих действий. Аккаунты и подключения не изменялись.
Производственный UI остаётся `43ccf6b`, что подтверждено status на сервере.
Владелец подтвердил следующий этап — интерактивный эскиз новой структуры
и навигации. Результат и текущий следующий шаг находятся выше.

### Устройства: согласованная рабочая компоновка — 3 октября

После «Продолжаем» компактный выбор машины, общий корпус, сворачиваемая регулируемая
сводка и телефонные вкладки перенесены в существующие Devices-компоненты.
Действия машины и терминала разделены по меню, завершение сессии подтверждается.
Статус соединения перенесён к выбору сессии; дополнительные клавиши раскрываются
снизу. В открытом окне сохраняются выбранные вкладки/сессии машин и отдельные
черновики команд терминалов. Пароли не сохраняются, ввод при переходах не повторяется.
Общие геометрия, док, PTY, прокрутка и idle-release сохранены. Обновлена справка.
[Рабочие экраны и проверки](../polish/07-settings-devices/devices-implementation/README.md).
Проверены сборка web, 7 тестов устройств/жизненного цикла терминала, сценарии ввода,
буфера обмена, дока и освобождения сессий в Chromium/WebKit. Визуальные сценарии
покрывают четыре темы и пять размеров; исправлен уход фокуса в WebKit при Escape
в меню без доступных действий. Это автоматизированные проверки, не физический iPad.
Веб-часть `43ccf6b` опубликована штатным совместимым publisher после Linux-сборки
и повторных 7 тестов. Manifest:
`ea958b119fe056371b3b063317f25680f1ffb5aa50ddfe0912b90e573aa8d3e1`.
HTTP entry, общий CSS и JS/CSS Devices совпали с manifest по SHA-256. Hub/engine
остались `f32b7f3`: ID, образы и время запуска gateway, engine и GPT-коннектора
не изменились. Companion не обновлялся. Серверные квитанции:
`verification-43ccf6b/{linux-build-verified.txt,processes-before.json,web-check.json}`.
Следующий предложенный отдельный проход — разбор окна настроек и подключений,
сначала текущие экраны и обсуждение, без автоматической смены аккаунтов/маршрутов.
Рекомендация: GPT-6 Astra, Высокое (`high`); ожидается продолжение владельца.

### Устройства: интерактивный эскиз — 3 октября

Подготовлен [интерактивный эскиз и экраны](../polish/07-settings-devices/devices-study/README.md):
компактный выбор машины, общий корпус, изменяемая и сворачиваемая системная сводка
рядом с терминалом на широком экране; вкладки на телефоне. Действия машины и сессии
разделены по меню. Показаны ввод, дополнительные клавиши и восстановление локального
состояния выбранных устройств/сессий. Четыре темы проверены в Chromium и WebKit на
четырёх ширинах; рядом с PNG сохранены описания. Это только демонстрация на локальных
данных, без реальных команд и изменений Hub/Companion. Владелец согласовал следующий
этап реализации; актуальное состояние находится выше.

### Устройства: разбор перед эскизом — 3 октября

После завершения Results владелец согласовал переход к разбору «Устройств».
[Свежие экраны и предложение](../polish/07-settings-devices/devices-review/README.md):
сняты текущие компоненты в четырёх темах, телефон 390×844 и планшет 1366×1024,
на одноразовых данных без реальных SSH/команд. Проверена свежая сборка web.
Предлагаются компактный выбор машины, общий корпус, изменяемая сводка слева,
основной терминал справа и меню действий устройства. Существующие функции,
ввод, release и док сохраняются. Производственный интерфейс не изменён.
Предложенный интерактивный эскиз подготовлен следующим этапом выше.
Старые предложения о следующем Results ниже — история.

### Bridge Doctor: спокойное ожидание и отдельный диалог — 3 октября

Установлено в Hub `f32b7f3`: Doctor читает локальный heartbeat и результат обычных операций, без
фонового запроса models к GPT. Медленные чтения, cooldown и временные сбои чтения
не запускают ремонт совместимости. Подготовлен предел чтения 60 с в native, с запасом
во внешних слоях; проверки готовности объединяются и получают ограниченную паузу после сбоев.
Отправки и неопределённые квитанции не переигрываются. Обновление Hub не создаёт
повторный инцидент из-за одной лишь смены его revision.
Старая переписка без финального ответа перестаёт опрашиваться через пять минут
без открытия/изменения. Повторное открытие возвращает наблюдение; мониторинг реальных
выполняющихся задач и их квитанции сохраняются отдельно.

Связанный Bridge Doctor показывается отдельно в «Диалогах», принимает ручные сообщения
и сохраняет прежнюю историю, рабочую папку, ассоциацию и квитанции. Остальные технические
диалоги остаются защищены. Проверены typecheck, 79 тестов Doctor/provider/renderer,
ожидание чтения дольше прежнего таймаута и Chromium/WebKit: 45-секундное ожидание
истории без повторного запроса, сохранение черновика, отдельная навигация Doctor.
В Linux прошли 100 целевых тестов и проверки production image (private socket,
auth, engine/gateway reconnect); helper native-upgrade прошёл 6 своих тестов.
Engine/gateway healthy, HTTP entry и CSS совпали по SHA-256, manifest
`a033eace6ea82cc6bb64d48fb785df6c3be0bee051326174151411706285cb4c`.
Простой веб-части при штатной установке — 55,6 с. Остальные 68 сервисов сохранили
ID/образ/время запуска; автоматическая ротация оставила три последних проверенных checkpoint.
Read-only проверка установленного кода и рабочей базы подтвердила отдельную навигацию
Doctor и разрешение ручного ввода; сохранены native thread ID, рабочая папка и все 6
сообщений. В контрольном окне счётчики инцидентов не выросли.

Владелец разрешил восстановительный перезапуск действительно зависшего GPT, включая
случай недоступной проверки native idle. Это записано в AGENTS; медленное чтение само
по себе не запускает перезапуск. Host-only upgrader получил явный параметр причины
восстановления, сохранив проверки писателей Hub, manual lease, профиль и откат.

Native перезапущен и обновлён до `26.928.31416-3b7ab0d-r1`: внутренний deadline
60 с теперь действует. Первая установка выявила EACCES на двух файлах подготовленного
образа и автоматически вернула прежний контейнер. Исправлена упаковка COPY chmod=0644;
добавлена проверка импорта от runtime-пользователя в изолированном контейнере до остановки
живого клиента. Повторная установка уже прошла штатную проверку простоя.
Все 9 тестов upgrader прошли, включая recovery, отказ при активном писателе Hub,
откат и отказ до остановки при нечитаемом образе. После установки status — 0,02 с,
activity — 0,32 с (ready=true, generating=false), readModels — 1,38 с (3 версии).
Привязка аккаунта сохранена, SHA-256 обоих установленных модулей совпал с исходниками;
ввод не переигрывался. Эти проверки подтверждают готовность и чтение каталога, а не
полный пользовательский цикл отправки/ответа или чтение каждой старой переписки.
Предыдущий контейнер сохранён для отката. Hub/Companion этим действием не заменялись.
Квитанции установки и проверки: `verification-f0d9374/codex-web-gpt-native-lab/installed.json`
и `verification-f0d9374/recovery-check.json`.
Доказательства на сервере: `verification-f32b7f3/{receipt,continuity-after,
doctor-live-admission,doctor-runtime-after}.json`; попытка native — `verification-3b7ab0d`.
Ниже сохранена история предыдущего выпуска, а не текущие версии engine/gateway.

### Согласованный Results: реализация — 3 октября

Уточнение по IMG_0841: из раскрытых «Рассуждений» убраны пустые служебные статусы
«Пишет ответ», «Обдумывает задачу» и аналогичные записи без содержимого. Публичные
пояснения, команды, вывод и сохранённые действия остаются. Пагинация продолжает
работать даже при странице, содержащей только статусы.
Исправление `507b831` опубликовано только в веб-часть; engine/gateway остаются `b3c8666`.
TypeScript и Chromium/WebKit прошли проверку на четырёх темах при 390/1024 px.
HTTP entry и все 29 CSS проверены по SHA-256; все 70 сервисов сохранили процессы.
Квитанция: `verification-507b831/web-published.json`, manifest
`7ff2ac9843e1c55e6e930ef32062ec714759dcef48a5f2ab162df6c0303ded01`.

Реализованы компактные файловые строки, две колонки изображений с общей тонкой рамкой
и меню на миниатюре, боковые меню ссылок/HTML-демо. Плотность свободнее на планшете,
компактнее на телефоне. Сохранились общий просмотрщик и галерея, поиск, выбор нескольких,
подготовка ZIP, отправка, исходные байты скачивания и точный переход к сообщению.

Основные категории — «Файлы», «Изображения», «Рассуждения». В Codex карточка начинается
с запроса; внутри раскрываются сохранённые публичные шаги и карточки работы с командами,
выводом, проверками и diff. Связи строятся по thread/turn/native item, без угадывания
по времени. Чтение не запускает native history, отправку или polling провайдера.
История загружается страницами по 40 шагов; прежнего ограничения восемью шагами нет.
Старые действия без точной связи остаются доступны отдельно, в том числе из дополнительного
меню категорий. Если исходный запрос ещё не сохранён, показан «Ход задачи»; обычное чтение
нативной истории сохраняет публичный запрос. Утраченные рассуждения не выдумываются.

[Снимки реализации и проверка](../polish/05-files/results-implementation/README.md).
TypeScript/build, scoped Biome и 18 Linux-проверок (включая проекцию, поиск, передачу
файлов, Team socket и checkpoint/rollback/admission) прошли. Chromium/WebKit проверили четыре темы на 390/1024 px, позицию меню, галерею,
исходные скачивания, ZIP, вложенную отправку, источник и сохранение раскрытия.
Это автоматизированные проверки контролируемых данных, не физическая проверка iPad.
Выпуск `b3c8666` установлен штатным engine-upgrader поверх `9d148c1` после idle admission
и проверенного checkpoint. Engine и gateway healthy; HTTP entry и все CSS совпали
по SHA-256. Manifest `07c252f8b03ec1d3d3495563f70d01c3f17e6c19758b129e0dc1aca9690bf0c1`.
68 остальных сервисов сохранили ID/образ/время запуска; Companion не менялся.
Подготовка checkpoint шла до остановки; перерыв веб-доступа составил 49,3 с.
Автоматическая ротация оставила три последних проверенных engine-checkpoint.
Доказательства: `verification-b3c8666/{receipt,image-smoke,continuity-after}.json` на сервере.

На больших историях перед установкой найден и исправлен дорогой запрос: подробности
теперь вычисляются только для выбранной страницы из 21 записи, а не для всех ходов
перед сортировкой. На трёх историях с 194–293 тыс. событий повторное чтение страницы
заняло 96–222 мс, timeline — 2–13 мс (read-only замер; холодное чтение было 366–866 мс).
Это замер текущей базы, не гарантия времени для любого объёма.

### Эскиз Results и объединённые «Рассуждения» — 3 октября

Подготовлен [интерактивный эскиз со снимками](../polish/05-files/results-study/README.md):
компактные строки файлов, миниатюры изображений, небольшие действия, поиск и выбор нескольких.
Владелец уточнил: в Codex «Работу» заменить «Рассуждениями», включив раскрываемые карточки
действий в общий ход задачи. В эскизе показаны три публичных шага с вложенными чтением файлов,
изменениями и проверками. После корректировки владельца «Рассуждения» находятся в обычном
ряду категорий. Сначала видны карточки с самими запросами, внутри каждой раскрываются
рассуждения, а в их последовательности — карточки работы. Вложенное раскрытие сохраняется
при сворачивании запроса и переключении категории. Плотность автоматически свободнее
на планшете/десктопе и компактнее на телефоне; отдельный выбор плотности убран.
По IMG_0838 меню изображения перенесено в правый верхний угол миниатюры; тонкая рамка
и тематическая подложка объединяют картинку, имя и размер в одну карточку.
По IMG_0839/0840 ссылки и HTML-демо также получили единое меню «⋯», но сбоку справа
на линии названия, как у файлов. «К сообщению» перенесено в меню; раскрытие содержимого
независимо и не сбрасывается при открытии меню. Это описание проверки макета; последующая реализация указана выше.

Chromium/WebKit проверили четыре темы на 320/390/736 px, меню, галерею, раскрытие действий,
возврат из просмотра к поиску и выбору файлов, автоматическую плотность и оба уровня раскрытия
карточек запросов. PNG и соседние MD обновлены; снимки просмотрены.
Это макет с контролируемыми данными и локальными действиями, не новая серверная функциональность.
На момент этого эскиза production Results не менялся. Последующее одобрение и реализация
согласованного Results указаны выше.
Рекомендация: GPT-6 Astra, Высокое (`high`). Расширение форматных инструментов остаётся отложенным.

### Компактная панель файла и разбор Results — 3 октября

По IMG_0837 действия файла и инструменты встроенного текста сведены в одну строку.
«Сохранённый результат» стал иконкой с доступным названием и подсказкой. Сам текстовый
просмотрщик предоставляет прежние инструменты в общую панель через portal; копирование,
озвучка, перенос и исходный текст сохраняют владельца состояния. Основные действия
остаются смонтированными при загрузке предпросмотра. На особо узкой ширине панель
прокручивается горизонтально, сохраняя кнопки 44 px, вместо второго ряда.

[Снимки панели](../polish/05-files/preview-toolbar/README.md).
Chromium/WebKit проверили один ряд и 44 px кнопки во всех четырёх темах на 390/768/1366,
исходный текст/перенос, вложенное открытие сохранённой копии без сброса состояния,
создание/переименование/копирование с коллизией/перемещение/удаление и родительский черновик.
TypeScript/build и scoped Biome прошли. Реализация `47ecc0d` установлена web-only publisher.
Manifest `7c21a9e33d8942992c025f16f62aaf22d5a0e7a730dbff6b39aabd916b2dd6a6`;
HTTP Hub, current/status/version совпали. SHA-256 entry, общего CSS и ReadableFilePreview
JS/CSS проверены. Engine/Hub/GPT сохранили ID, образы и время запуска при публикации;
Companion не менялся. Доказательство: `verification-47ecc0d/web-check.json` на сервере.
Внешний HTTPS и физическое устройство отдельно не проверялись.

Владелец остановил расширение форматных инструментов и выбрал Results следующим
предметом обсуждения. Кадры видео отложены, Devices не является следующим этапом.
[Разбор текущего Results](../polish/05-files/results-review/README.md): компактные
строки для файлов, миниатюры для изображений, компактные действия и спокойнее категории.
Эскиз этого предложения подготовлен в следующем проходе и указан выше; production-редизайн
описан выше. GPT-6 Astra, Высокое (`high`).

### Поиск и личные закладки книг — 3 октября

В общей читалке EPUB/FB2, а также TXT/Markdown появились поиск по разделам,
переход с подсветкой и личные закладки. Место хранится по текстовому якорю,
поэтому изменение шрифта/ширины не привязывает закладку к старому номеру страницы.
Активная озвучка продолжает с выбранного места; пауза остаётся паузой.
Закладки принадлежат аккаунту, точным байтам книги и этому браузеру; межустройственной
синхронизации пока нет. Оригинал не меняется.
[Подробности](FILE_WORKSPACE_TOOLS.md#восьмой-шаг-поиск-и-закладки-книг-3-октября),
[снимки](../polish/05-files/book-navigation/README.md).

Chromium/WebKit: EPUB/FB2, точные переходы/подсветка, повторное открытие, разные
аккаунты и одноимённые книги, отмена поиска, озвучка и четыре темы. Регрессии
существующей читалки прошли в обоих браузерах. 46 unit/help-проверок, TypeScript,
сборка и scoped Biome пройдены. Это браузерные проверки, не физический iPad.
Реализация `cf8e2c4` интегрирована в `main` и установлена web-only publisher.
Manifest `9bfa6fadc5f64c130b39d3c25d88dfee53ca44bf829103806bcd99d8715595a3`;
HTTP Hub, current/status/version совпали. Проверены SHA-256 entry и ReaderFilePreview
(JS/CSS). Engine/Hub/GPT сохранили ID, образ и время старта во время публикации.
Companion не менялся. Доказательство: `verification-cf8e2c4/web-check.json` на сервере.
Внешний HTTPS и физическое устройство отдельно не проверялись.

Дальнейшее расширение инструментов отложено владельцем. Следующее обсуждение — Results;
текущий порядок и исправление панели файлов указаны выше.

### Выбор и извлечение ZIP — 3 октября

Добавлены выбор файлов/папок, сохранение выбранного ZIP-копией и извлечение в папку
проекта с вложенными путями. Общая очередь сохраняет коллизии и точные квитанции;
повторное открытие незавершённой группы не отправляет завершённые файлы заново.
Границы: 32 файла в очереди, 32 МиБ распакованных данных, пустые папки не извлекаются.
Оригинал не меняется. [Подробности](FILE_WORKSPACE_TOOLS.md#седьмой-шаг-выбор-и-извлечение-zip-3-октября),
[снимки](../polish/05-files/archive-selection/README.md).

Chromium/WebKit проверили реальную запись файлов, коллизии, частичное завершение,
потерянные ответы mkdir/upload и восстановление без повторной записи; регрессии
manual-edit/package-preview также прошли. Unit/help и TypeScript/build пройдены.
Проверки браузерные, физическое устройство не заявляется.
Реализация `82240b6` отправлена в `main` и установлена web-only publisher.
Manifest `844600d74b7a1cb4c84920acc108aeb6669b9a240c2e3f2c1cabc0e837c5f858`;
HTTP Hub, current/status/version совпали. Проверены SHA-256 entry, PackageFilePreview,
worker, FileCopySave и ProjectFileUpload (JS/CSS). Процессы Engine/Hub/GPT сохранили
ID, образ и время старта во время публикации; Companion не менялся.
Доказательство: `verification-82240b6/web-check.json` на сервере.
Это проверка HTTP Hub и браузерных фикстур; внешний HTTPS отдельно не проверялся.

Следующий шаг поиска и закладок выполнен; текущий статус указан выше.

### Чтение PDF в общем просмотрщике — 3 октября

Добавлены выделение/копирование текста, поиск по страницам с подсветкой и лента
миниатюр. Переходы сохраняют разметку; оригинал и экспорт не меняются. PDF/DOCX
остаются фиксированными страницами. Сканам без текстового слоя нужен OCR, которого
этот шаг не добавляет. Поиск ограничен бюджетом с явным указанием неполного результата.
[Границы и проверки](FILE_WORKSPACE_TOOLS.md#шестой-шаг-чтение-pdf-3-октября),
[снимки](../polish/05-files/pdf-reading/README.md).
Реализация `305974a` интегрирована в `main` и установлена web-only publisher.
Manifest `ce59b4473f31cee052ffa3e90cd8102dfe183384a104bc7fb2a641bb5b56584b`;
HTTP Hub, current/status/version совпали. Получены и проверены SHA-256 PDF JS/CSS,
worker, экспорта разметки и DOCX-адаптера. Engine/Hub/GPT сохранили ID контейнеров,
образы и время старта во время публикации; Companion не менялся.
Доказательство на сервере: `verification-305974a/web-check.json`.
Chromium/WebKit, регрессии PDF/CSV, unit/help, TypeScript/build и scoped Biome прошли.
Это проверка HTTP Hub и браузерных фикстур; внешний HTTPS и физическое устройство
не заявляются.
Последующий шаг выбора и извлечения ZIP выполнен; текущий статус указан выше.

### Monaco для кода в общем просмотрщике — 3 октября

Issue #236 реализован с последующим уточнением владельца: Monaco для кода на
поддерживаемом desktop; CodeMirror остаётся для Markdown, CSV/TSV, обычного текста,
телефона/iPad и ошибки загрузки Monaco. Переход в правку сохраняет тот же корпус,
точный источник, черновик, квитанции, сохранение и конфликтные решения.

Проверены Chromium/WebKit: ввод, несколько курсоров, поиск/переход к строке,
настоящие локальные TS-подсказки, Undo после просмотра, CRLF/BOM, конфликт,
потерянное подтверждение с прежней квитанцией, освобождение моделей, точность JSON,
темы/размеры и резервный движок. Регрессии file-tools/manual-edit/format-tools,
TypeScript/build, help и scoped Biome прошли. Терминалы и Companion не изменялись.
[Карта и ограничения](FILE_WORKSPACE_TOOLS.md#пятый-шаг-monaco-для-кода-в-общем-просмотрщике-3-октября),
[снимки](../polish/05-files/code-editor/README.md).
Реализация `9178a0a` находится в `main` и установлена web-only publisher.
Manifest `10b3b20346719b8591dfa9e1adec83affaac34e62dc2165ff72b514e1d373f48`;
HTTP Hub, current/status/version совпали. Получены и проверены SHA-256 движков,
CSS, всех пяти workers и шрифта значков. Engine/Hub/GPT сохранили ID контейнеров,
образы и время старта во время публикации; Companion не менялся.
Доказательство: `verification-9178a0a/web-check.json` на сервере.
Это проверка HTTP Hub; внешний HTTPS и физическое устройство не заявляются.
Последующий шаг чтения PDF описан выше.

### XLSX в общем окне — четвёртый шаг, 3 октября

Реализованы диапазоны, TSV-копирование, правка текстовых/числовых/логических значений
и очистка ячеек, Undo/Redo, локальные черновики и экспорт XLSX-копии через общий
процесс сохранения. Оригинал не меняется. Формулы, оформление и остальные части
книги сохранены; формулы не вычисляются внутри просмотрщика. Полный пересчёт
запрашивается при открытии экспортированной книги в табличном приложении.
Границы и доказательства: [карта форматов](FILE_WORKSPACE_TOOLS.md#четвёртый-шаг-значения-xlsx-и-диапазоны-3-октября).

Реализация `435aebb` отправлена в `main` и опубликована web-only publisher.
Установлен manifest `c30efa134aa98931b214ef8567263c9013e92bac640f39aa051da7a6be40280c`;
HTTP Hub, current/status/version и новый XLSX chunk совпали. Процессы
Engine/Hub/GPT сохранили образы и время старта во время публикации; Companion
не менялся. Проверка: `verification-435aebb/web-check.json` на сервере.
Это проверка HTTP самого Hub, не внешнего HTTPS-входа или физического iPad.
Chromium/WebKit: XLSX round-trip, диапазоны, черновики, четыре темы и высота
с клавиатурой; независимый openpyxl; package unit/browser, manual-edit,
file-preview, help, TypeScript/build и scoped Biome прошли.
[Снимки с описаниями](../polish/05-files/xlsx-tools/README.md).
Следующий предлагаемый шаг — текстовый поиск/выделение и миниатюры PDF;
GPT-6 Astra, Высокое (`high`), после продолжения владельца.

### PDF и CSV/TSV в общем окне — третий шаг, 3 октября

Реализованы PDF-разметка (перо, маркер, комментарии, Undo/Redo), локальные черновики
и экспорт отдельного PDF без растрирования исходных страниц. CSV/TSV получил таблицу,
заголовки, выбор разделителя, фильтр и правку ячеек через тот же CodeMirror-документ:
единые Undo, черновик, сохранение и конфликты. Оригиналы остаются неизменными при
работе с копиями; фильтр не удаляет скрытые записи. Справка обновлена.
[Подробности и границы](FILE_WORKSPACE_TOOLS.md#третий-шаг-pdf-и-csvtsv-3-октября),
[снимки](../polish/05-files/document-tools/README.md).

Проверены Chromium/WebKit, четыре темы, сохранение/восстановление, точные CSV-байты,
Unicode-комментарии и повторное открытие PDF-копии. Прежние file-tools, manual-edit
и file-preview прошли. Unit/help, TypeScript/build и scoped Biome прошли. Установлен веб-выпуск `4f6ac34`, manifest
`3c939ddd9b0c8a6e7673cb94c75057c685e8bcc5554b38eff2eaab256bc5bec0`.
Web-only publisher подтвердил установку; HTTP Hub отдал тот же manifest и новые
DelimitedTable/PdfFilePreview/pdfAnnotations chunks. Процессы Hub/Engine/GPT
сохранили образы и время старта на момент публикации; Companion не менялся.
Доказательство: `verification-4f6ac34/web-check.json` на сервере. Это проверка
через HTTP самого Hub; отдельная проверка внешнего HTTPS-входа не заявляется.
Исходники и документация отправлены в `main` (реализация `c745c44`, компоновка
`b0da579`, сохранение чтения CSV и единиц PDF `4f6ac34`).

Следующий после PDF/CSV шаг XLSX выполнен и установлен; текущий результат
и следующее предложение указаны в разделе выше.

### Инструменты формата в общем окне — второй шаг, 3 октября

В исходниках добавлены Markdown/код-инструменты, проверка JSON/JSONL/XML и точное
форматирование JSON; неразрушающая разметка растров с Undo, обрезкой/поворотом и
экспортом PNG/JPEG-копии; скорость/позиция/A–B для медиа; сортировка ZIP.
Все действия остаются в общем корпусе. Оригиналы, точные источники, конфликты,
квитанции и прежние форматные обработчики сохранены. Справка обновлена.
Подробности и границы: [карта форматов](FILE_WORKSPACE_TOOLS.md#второй-шаг-инструменты-формата-3-октября).
[Снимки](../polish/05-files/format-tools/README.md).

Проверены TypeScript/build, unit-тесты текста и CSP, file-tools/file-preview
и format-tools в Chromium/WebKit. Реальный WAV/A–B проверен в Chromium;
Windows WebKit не предоставляет декодер WAV/MP3, этот сценарий не заявляется.
Найдена и исправлена CSP-причина отказа медиа Blob: разрешение добавлено только
в `media-src`, без расширения script/connect/object. На Linux дополнительно прошли 6 проверок gateway/CSP: активный ответ GPT, очередь
Codex, точная форма, терминал и атомарная публикация/откат. Старый тест публикации
содержал фиксированную схему 28; теперь проверяет версию своей настоящей фикстуры.

Установлен выпуск `2e16c88`, manifest
`baaeea6f072dce516ff3af9f55fb5513d4a02174561573272b72b92387e295c2`.
Веб-шлюз обновлён отдельно по независимому пути; Engine/GPT сохранили контейнеры,
образы и время старта, Companion не переустанавливался. Затем опубликованы assets;
host status, manifest, HTTP `/version.json` и новые lazy chunks совпали.
HTTP самого Hub подтвердил manifest и `media-src 'self' blob:`.
Внешний HTTPS вернул автоматическому запросу 403; проверка через внешний
вход этим запросом не подтверждена.
Доказательства на сервере: `verification-2e16c88/gateway-check.json` и `web-check.json`.
Реализация в `main`: `2e16c88`; корректировка регрессионного теста: `d6498f7`.
Следующий после этого выпуска шаг PDF/CSV описан в текущем разделе выше.

### Единое окно файла — реализация, 3 октября

Просмотр и текстовая правка теперь используют один корпус. CodeMirror остаётся
смонтированным при переключении: черновик, выделение и Undo сохраняются, просмотр
показывает текущие несохранённые изменения. Общие действия стали компактными иконками,
свойства раскрываются отдельно. Закрытие общего окна проверяет изменения; док
сохраняет редактор. Прежние обработчики форматов, полные байты, конфликты, квитанции,
копии и GitHub review сохранены. Новые форматные инструменты ещё не добавлены.

[Снимки и описания](../polish/05-files/viewer-workspace/README.md).
Прошли web typecheck/build, file-tools, manual-edit, file-preview и window-dock
в Chromium/WebKit. Проверены пустой документ, Undo после просмотра, закрытие с
черновиком, сворачивание и восстановление, четыре темы и узкая высота с клавиатурой.
Это браузерные проверки. Веб-выпуск `325441c` установлен web-only publisher;
host status, manifest и HTTP `/version.json` совпали:
`daba124a69c64a9d361ee944390693cb3adc1f07d94c6873af70a9d52158fe93`.
Проверены HTTP-файлы нового редактора, общей оболочки и стилей. Hub, Engine и GPT
сохранили время старта и образы; Companion не переустанавливался. Доказательство:
`verification-325441c/web-check.json` на сервере. Следующий этап — контекстные
инструменты из пункта 2 [карты форматов](FILE_WORKSPACE_TOOLS.md), GPT-6 Astra,
Высокое (`high`), после продолжения владельца.

Исторические разделы ниже описывают предшествующие макеты и выпуски.

### Просмотр ↔ правка: одобренное направление, 3 октября

Владелец одобрил корпус и попросил правку в том же окне, без потери функций,
с подходящими инструментами для всех форматов. Составлена
[карта существующих возможностей и расширений](FILE_WORKSPACE_TOOLS.md).
Эскиз дополнен режимами, MD-инструментами и локальной разметкой PNG/PDF.
Это интерактивное уточнение проекта: настоящие редакторы, экспорт и новая оболочка
ещё не внедрены. Установленный веб-выпуск остаётся `7187de0`.

### Общий просмотрщик — обсуждение после Git, 3 октября

Подготовлен [интерактивный эскиз](../polish/05-files/viewer-study/README.md):
один корпус, компактные группы навигации/формата/действий, большой экран,
раскрываемые свойства и краткий нижний статус. В эскизе PNG/PDF/MD, четыре темы,
переключение файлов/страниц. Chromium/WebKit, узкая и широкая компоновка проверены.
Это предложение для обсуждения; production просмотрщик не менялся, установленным
остаётся веб-выпуск `7187de0`. Остальные форматы и действующие контроллеры сохраняются.

### Git — внедрение согласованного окна, 3 октября

Добавлено отдельное окно Git: изменения по умолчанию, регулируемый узкий список,
большой diff рабочей копии/индекса, история, ветки и релизы. Вход «Файлы» открывает
существующий общий менеджер с точным проектом и путём; Git и черновик остаются
смонтированными. Геометрия, док, телефонная навигация и четыре темы сохранены.

Коммит и push используют прежнюю «Доставку»: отдельная подготовка/подтверждение,
сохранённые квитанции, проверка потерянного ответа без повторного исполнения.
Завершение через повторную проверку обновляет Git; старое завершение сохраняет
более новый черновик. История пока показывает метаданные коммитов: локальный
исторический diff отсутствует в контракте, переключение веток не добавлено.

[Снимки и описания](../polish/03-projects/git-workspace/README.md).
Прошли project-git, project-delivery, window-dock в Chromium/WebKit, web typecheck,
build и help-content. Дополнительно проверены длинное название проекта и доступ
к действиям при высоте 430 px. Это браузерная проверка, не проверка физического iPad.

Веб-выпуск `7187de0` установлен обычным web-only publisher. Host status, manifest
и `/version.json` совпали: `337738f0c4b29ee06e051e2fdbb660b1c25238846a8ff58d32dcdb9df62ded46`.
Проверены HTTP-ресурсы нового Git и квитанций «Доставки». Hub, Engine и GPT сохранили
PID lifetime/время старта и образы; Companion не переустанавливался. Доказательство
на сервере: `verification-7187de0/web-check.json`. Общий просмотрщик — следующее обсуждение.

### Git — предложение и уточнение файлового входа, 3 октября

[Интерактивный макет](../polish/03-projects/git-study/README.md): изменения и
история в общей двухпанельной компоновке, узкий регулируемый список, большое
сравнение, проверка коммита и отдельная отправка. Данные и операции демонстрационные.
Это стадия обсуждения, production Git и установленный веб-выпуск не менялись.

Владелец отменил прежний запрет файлового менеджера из Git: нужна отдельная
кнопка, открывающая **существующий общий файловый менеджер** с тем же контекстом
репозитория. Не создавать вторую реализацию. Макет показывает снимок текущего
общего окна, а не имитирует его операции. Общий просмотрщик обсуждается после Git.
Макет проверен в Chromium/WebKit: 32 сочетания тем/ширин, выбор, diff,
коммит/отправка на примере и сохранение черновика при возврате из Files.
Снимки с соседними MD лежат рядом с предложением. Внедрение следует после обсуждения.

### Общий корпус и движение панелей — 3 октября

Левая навигация и результаты раскрываются внутри общего корпуса за 240 мс.
У зелёной и 2000 убраны вложенный корпус навигации и лишняя рамка результатов;
материалы/цвета сохранены. Короткие ручки заменяют сплошные цветные разделители,
включая клавиатурный фокус. В GPT добавлен общий регулятор ширины результатов.

Рабочие окна получили общий вход; док — выход с сохранением смонтированного
содержимого. Файлы, viewer, настройки и Devices также закрываются с коротким
переходом. Release терминала по-прежнему принадлежит явному закрытию Devices.
Ручная ширина, viewport и reduced motion не ждут анимации; скрытые панели
недоступны для фокуса, а на телефоне возвращаются в обычную навигацию.

[Снимки и описания](../polish/10-themes/expanding-panels-2026-10-03/README.md).
Проверки: workspace-panels, window-dock и devices в Chromium/WebKit, typecheck
и web build. Проверены ввод/reconnect терминала, черновики, темы и телефон.
Веб-выпуск `2178c92` установлен; host status, manifest и `/version.json` совпадают:
`420be1ac055215d7c6ca242459b3ed32063e2cff0d78c1d5ced87a63826aa7d8`.
Проверена отдача нового CSS с переходами и JS модулей. Hub, Engine и GPT сохранили
image и время запуска; Companion не менялся. Квитанция:
`verification-2178c92/web-check.json`. Физический iPad этим не проверяется.

### Файлы: компактные команды и обычные операции — 3 октября

Убрана крупная полоса «Разблокировать файлы / Предпросмотр приложения»:
эти действия стали ключами шапки. Создание, загрузка, выделение и действия
над выбранными файлами находятся в компактном ряду над колонками. Список
остаётся узким относительно просмотра. Сохранены материалы четырёх тем,
изменение геометрии, док и телефонный возврат из просмотра к списку.
Меню элемента доступно также правой кнопкой мыши.

Одиночное копирование/вырезание переведено на общий механизм групповой вставки:
совпадение имён теперь предлагает замену точной версии, другое имя, пропуск
и прежнее слияние папок. Исправлен скачок ширины просмотра: старый предел
700px мог быть меньше исходной процентной ширины; теперь ограничивает
доступное место при сохранении минимума соседнего списка.

[Снимки, описания, ориентиры GNOME/Dolphin/Thunar и карта функциональности](../polish/05-files/commands-2026-10-03/README.md).
Корзина/Undo, перетаскивание файлов, системные сочетания буфера и вкладки
не добавлены. ZIP пока доступен из группового выбора после разблокировки.
Git и архитектура viewer не перерабатывались.

Проверки Chromium/WebKit: file-manager-commands, file-batch, file-tools,
project-file-upload, file-browser, window-dock. Проверены реальные временные
файлы, конфликт и сохранение обоих, перенос, удаление, потерянные подтверждения,
ZIP, черновики, навигация, перегородки и темы. Windows browser-fixture подаёт
байты своих файлов отдельно для download, поскольку local-linux валидирует
POSIX-пути; это не проверка production Linux transfer. Старый editor-тест
приведён к текущему договору перемещаемых окон и вводу через клавиатуру CodeMirror.
Typecheck и web build проходят. Физические устройства этим не проверяются.

Док дополнительно проверен; владелец уточнил, что нашёл его сверху у перегородки.
Изменять его расположение не требовалось.

Веб-выпуск `d99a240` установлен. Host status и `/version.json` совпадают:
`2cd1ca53bdf56047fdf7077eca16d923f0644fa52fb7671f5473ddfd7cfb74ab`.
Проверены новый entry JS и отдаваемый файловый модуль с компактной панелью
и контекстным меню. Hub, Engine и GPT сохранили image и время запуска;
Companion не менялся. Квитанция: `verification-d99a240/web-check.json`.
Следующая отдельная тема — Git (рекомендуемый уровень Высокое / `high`),
после согласования Git — общий просмотрщик.

### Док рабочих окон и клавиатура iPad — 3 октября

Владелец одобрил внедрение макета. Общая регистрация рабочих окон добавляет «−»
и док справа от перегородки, не меняя ширину чата. Док оформлен материалами темы,
сворачивается в язычок со счётчиком, показывает название при наведении/удержании.
Содержимое окон остаётся смонтированным; вложенный viewer сворачивается вместе
с родителем и освобождает нативную модальность. Обычный вход в файлы, настройки
и Devices восстанавливает уже открытое окно. Файлы сохраняют исходный проект
при переходе в другой проект и переключении Codex/GPT. Сворачивание Devices
не запрашивает release и оставляет тот же PTY; явное закрытие работает как прежде.
На телефоне док/«−» скрыты; переход к узкой ширине возвращает окна на экран.
Парковка живёт до закрытия страницы; геометрия хранится прежним общим механизмом.

IMG_0439 показывает схлопнутый интерфейс над клавиатурой. Расчёт высоты больше
не смешивает `innerHeight` и `visualViewport.height` через минимум. Используется
целостный visual viewport; нулевые временные размеры игнорируются. Убрано
наблюдение за размером собственного корня, добавлены pageshow/visibilitychange.
Автоматический сценарий с рассинхронизированными размерами воспроизводит риск
прежнего расчёта и подтверждает новую компоновку. Это не доказательство точной
последовательности событий WebKit на физическом iPad из пользовательского снимка.

Проверки Chromium/WebKit: window-dock, window-geometry, devices, viewport-controls.
Проверены модальность, черновики, исходный проект, переход между клиентами,
восстановление обычным входом, удержание, телефонный режим, отсутствие release
терминала и поля над клавиатурой. Typecheck и web build проходят.
Снимки реализации: [polish](../polish/10-themes/window-dock-live/README.md).
Веб-выпуск `8c5daff` установлен. Host status и `/version.json` совпадают с manifest
`024644a9137f5aa7e328de9b0b027164ad83070854faa023ad552bf1f1de9cda`.
Проверена отдача нового entry JS и модулей; Hub, Engine и GPT сохранили прежние
время запуска и image. Companion не менялся. Квитанция:
`verification-8c5daff/web-check.json`. Следующая отдельная тема — Git, затем viewer.

### Док свёрнутых окон: исходный макет — 3 октября

Подготовлен [интерактивный макет и снимки](../polish/10-themes/window-dock-study/README.md)
для зелёной темы, «2000» и органайзера. Рейка прикреплена справа к перегородке,
сворачивается в язычок и не меняет размеры чата; в телефонном режиме скрыта.
Локальная демонстрация сохраняет черновики, скролл, геометрию и исходный проект
при сворачивании/восстановлении. Проверено 36 сочетаний тем/ширин в Chromium/WebKit.
Это исходное дизайн-предложение; внедрение после одобрения описано выше.
Сам HTML-макет остаётся автономной демонстрацией, не кодом установленного дока.

### IMG_0437: частично нарисованная картинка — 3 октября

Проверен точный снимок `sprites.png` из PikoOS: серверный PNG целый, 45 750 байт,
совпадает с показанной на скриншоте верхней частью. Исходник не повреждён.
В сообщениях введено общее полное декодирование перед показом (`DecodedImage`);
видимый снимок Codex получает eager/high после единственного IntersectionObserver,
вместо второй очереди lazy-загрузки. Картинки вне видимой области по-прежнему
не запрашиваются, обновление истории сохраняет тот же img и текущий запрос.
GPT использует то же декодирование с прежним ограниченным восстановлением ошибок.
Оригиналы, авторизация, кэш сервера и пересылка файлов не меняются.

`image-stream.browser.mjs` в Chromium/WebKit проверяет PNG, передаваемый двумя
частями: неполный растр не показывается, после завершения появляется целое изображение,
повторного GET при decode/обновлении истории нет. Точный источник сетевой паузы
на физическом iPad не установлен; не считаем её устранение доказанным только
по изменению отрисовки. Исправление включено в установленный веб-выпуск `39961aa`.
Также пройдены image-gallery и async-question-images в обоих браузерах.

### Перемещение и размер рабочих окон — 3 октября

Общий `useWindowGeometry` добавляет перетаскивание свободной части шапки, восемь
ручек изменения размера, клавиатурное управление и сброс двойным нажатием/Home.
Ключи отдельных инструментов хранятся локально в пространстве аккаунта; имена
проектов/файлов туда не записываются. Подключены файлы/Git, viewer/редактор,
настройки, устройства, справка, заметки/задачи, работа/ядро/GPT проекта, общение,
brainstorm, расписания, источники Activity, поиск результатов и рабочие окна GitHub.
Компактные подтверждения/меню не меняются. Закрытие терминалов, модальность,
сохранение документов и вложенные окна остаются под управлением исходных компонентов.

Геометрия ограничивается видимой областью, включая изменение высоты клавиатурой.
На телефоне работает штатная компоновка; она и развёрнутый viewer не перезаписывают
сохранённые размеры. Кнопки шапки не начинают drag; touch drag не закрывает настройки
через swipe. Отмена жеста восстанавливает исходное положение без записи.
По умолчанию просмотр занимает 56% файлового окна, расположения — 150 px;
пользовательские ширины разделителей сохраняются. Длинные имена сокращаются
в одну строку; при сужении окна просмотр переключается в отдельную панель.

Проверки: typecheck/build, `window-geometry.browser.mjs` и `device-chassis.browser.mjs`
в Chromium/WebKit: resize по восьми направлениям, drag/отмена, keyboard,
повторное открытие/перезагрузка, вложенный/развёрнутый viewer, черновик,
настройки, размеры телефона/планшета и четыре темы. Touch drag дополнительно
проверен Chromium CDP. Снимки `.local/qa-window-geometry/` и `.local/qa-device-chassis/`.
Это автоматические браузерные проверки, не утверждение о физическом iPhone.
Веб-выпуск `39961aa` установлен: host status и `/version.json` совпадают с manifest
`a0d9cbd5eee5619fea41f07b7595922aed607a572f099bbfd8a5462f24632409`.
Проверена фактическая отдача entry JS и общего модуля геометрии. Engine, Hub, GPT
сохранили прежние время запуска и image; Companion не менялся.
Квитанция: `verification-39961aa/web-check.json`.

### Видимость отправляемого сообщения — 2 октября

Владелец сообщил об исчезновении отправленного текста/картинки на несколько секунд
в Codex и GPT. В Codex добавлено локальное отображение отправки в текущем чате:
оно сохраняет текст и метаданные вложений после HTTP ACK до появления сообщения
в истории. Отстающий снимок истории его не удаляет; новое событие заменяет ровно
одну запись, а сверка снимка учитывает подтверждённый turn и вложения.
В GPT сообщение видно и во время ожидания HTTP ACK, после которого его заменяет
штатная запись задания. Если native user message появился без вложений, исходная
картинка сохраняется по тому же соответствию задания и native-сообщения, которое
заменяет временную запись в ленте (native ID либо однозначное штатное сопоставление).
При отказе черновик остаётся;
смена чата не переносит отправляемое сообщение в чужой диалог. Отправки не повторяются.

Проверки: build/typecheck, history-state; send-visibility и gpt-outbox в Chromium/WebKit
(задержка ACK/истории, картинка, отсутствие дублей, отказ, переход между чатами).
Снимки тестового окружения: `.local/qa-send-visibility/`. Это проверка браузерных
переходов с управляемым транспортом, не физического телефона или работы провайдера.
Веб-выпуск `976f6b1` установлен. Host status и `/version.json` совпадают:
`922a160cdd40ada824042575b3c0fa6bf37be7cfb88bd33c0b4253084429f53e`.
Проверена фактическая отдача исправленного JS обоих клиентов; engine, Hub, GPT
не перезапускались, Companion не менялся. Квитанция: `verification-976f6b1/web-check.json`.

### Уточнение следующего визуального прохода — 2 октября

Файловый список остаётся относительно узким, основное место получает просмотр.
Имена не должны разрываться посреди слова. Внутреннее устройство общего viewer
обсуждается отдельно после Git. Для общих окон запрошены перемещение за шапку,
изменение размера за края/углы и локальное сохранение геометрии по окну/устройству;
малый экран не должен затирать широкую компоновку или скрывать крестик.
Геометрия окон и узкий список реализованы проходом 3 октября выше.
Общая файловая композиция пока не принята владельцем:
избыточны этажи управления, большие служебные кнопки и дробление корпуса.

### Цельный корпус, ширина панелей и IMG_0824 — 2 октября

Владелец подтвердил направление TrainerOS для общих тем CRT Green и Hi-Tech 2000
и регулируемую ширину всех существующих соседних вертикальных панелей.
После [макета](../polish/10-themes/device-study/README.md) владелец подтвердил продолжение.
В исходниках добавлены общий корпус чата/рабочих окон, утопленный экран и компактные
иконки предпросмотра. Цвет корпуса остаётся пользовательским; Organizer/Classic
не получают корпус устройства. Файловый менеджер не добавляется в GitHub или Results.

Общий PanelDivider подключён к расположениям/просмотру файлов, свойствам viewer,
настройкам, справке, устройствам, общению, задачам/заметкам/планам, истории ядра,
расписаниям GPT, редактору общего материала, обзору проекта и выпуску изменений.
Навигация и Results используют тот же жизненный цикл pointer capture, сохраняя
свои прежние размеры/ключи. Ширина новых разделителей сохраняется локально,
ограничивается доступным местом и сбрасывается двойным нажатием; работают стрелки,
Home/End. На узком экране разделитель скрывается вместе с соседним представлением.
Сетки полей, кнопок и карточек не превращаются в панели.

IMG_0824: длинный вопрос больше не рисуется внутри рамки fieldset через legend.
Видимый заголовок находится внутри блока, доступное имя группы сохранено.
Отправка отдельных async-ответов и полный набор ответов Plan не изменены.
Дополнительная сверка Hub (точное событие TrainerOS 824240): один вопрос имел
native-фазу `final_answer`, поэтому под ним ошибочно добавлялись шесть изображений
всего хода. Вопрос исключён из этого fallback; его собственные вложения остаются,
изображения хода доступны в Results и в обычном итоговом ответе.

Проверки: build/typecheck; codex-questions, file-browser, file-batch и
device-chassis и async-question-images в Chromium/WebKit. Проверены длинный вопрос, отдельные ответы,
перетаскивание/клавиатура/сохранение размеров, узкое→широкое окно, вложенный viewer,
настройки/заметки/справка, черновик и четыре темы на 390/768/1366 px. Снимки реальных
компонентов в тестовом окружении: [polish](../polish/10-themes/device-implementation/README.md).
В визуальном тесте транспорт файла заменён точными байтами fixture; он не является
проверкой Linux-переноса через Windows.

Веб-выпуск `21ae865` установлен без перезапуска engine, Hub, GPT или Companion.
`/version.json` и host status подтвердили manifest
`ebf5d439b2512b082b3ddb97be55946747e6e2a5a46293dfc79a6ea288d9d62b`;
проверена отдача JS общего разделителя, CSS корпуса и исправленных вопросов.
Квитанция: `verification-21ae865/web-check.json`. Времена запуска engine/Hub
остались 16:58 UTC; GPT-контейнер работает с 18 сентября.

### Галереи изображений — 2 октября

Соседние картинки в сообщениях Codex/GPT и наборы созданных изображений используют
одну галерею: один снимок, стрелки и номер. Продолжение ответа сохраняет выбранный
слайд. Просмотр изображений из Results листает только изображения и подгружает
следующую страницу по явному нажатию, не меняя фильтр/прокрутку исходной ленты.

Проверено: build/typecheck; Chromium и WebKit — чат обоих клиентов, сохранение
слайда при продолжении, точное открытие, пагинация, черновик и четыре темы на
390/768 px. Снимки: `.local/qa-image-gallery/`. `artifact-navigation` проверен в
режиме `ARTIFACT_LINKS_ONLY=1`; старый сценарий большого ZIP отдельно расходится с
нынешним полным просмотром архивов и не является проверкой этой галереи.

Первый web-only выпуск `cdc1c10` установлен без перезапуска engine. После
сообщения владельца исправлено распознавание native-изображений с названием
«Изображение» без расширения/MIME; тест теперь проверяет реально декодированную
картинку в viewer. Встроенные изображения/вложения сообщений также собраны в
галерею с навигацией в увеличенном просмотре. Chromium/WebKit проверены.

Исправление галереи `81ff835` установлено web-only; revision подтверждён
через `/version.json`. Engine и Companion не перезапускались.

### Общий файловый навигатор — 2 октября

Один FileBrowser подключён к файлам проекта, выбору папки при создании проекта и
выбору папки для сохранения копии. История назад/вперёд, вверх, сегменты пути,
ручной адрес, поиск, сортировка, список/значки. Панель расположений на широком
экране и раскрываемая на телефоне; выбранный файл справа либо поверх списка.
Сохраняются прокрутка, исходный чат и существующие операции/квитанции.
GitHub исключён по решению владельца; Results остаётся лентой.

Проверено: typecheck/build, Chromium/WebKit — пути Linux/Windows, история,
прокрутка, выбор папки проекта, независимые назначения копий, четыре темы на
390/768/1366 px и окно 390×430. File-batch прошёл на Windows; file-tools с
настоящими Linux-файлами — в изолированном Playwright-контейнере на сервере,
включая сохранение, конфликт, потерю ответа и восстановление черновиков. Старый
тест заполненного localStorage актуализирован: черновики уже хранятся также в
IndexedDB. Снимки с описаниями: `polish/05-files/explorer-2026-10-02/`.
Web-only выпуск `695d90f` установлен. `/version.json` вернул manifest
`43e32b0339639ee3ca9dd5ad338a1be54bdcb390b51e830a44de46ce3a888cc7`;
проверена отдача JS-модуля навигатора и его CSS. Engine/Companion не перезапускались.

## Установлено и проверено

| Компонент | Состояние |
| --- | --- |
| Hub и engine | `9d148c1`, установлены 2 октября в 16:58 UTC; healthy. Квитанции на Hub: `verification-9d148c1/receipt.json`, `deployment-9d148c1.json`. |
| Web | `39961aa`, перемещение/размер рабочих окон, узкий файловый список и полное декодирование картинок перед показом. Предыдущая непрерывная видимость отправки сохранена. Manifest и JS проверены; engine не перезапускался. |
| Native ChatGPT | `26.928.31416-e934ed1`; адаптер обновлён после проверки native idle. Исправлено подтверждение сообщения после замены временного родителя в canonical graph; настоящий Altar job сверён как completed без повторной отправки. |
| Windows Companion владельца | UI 0.5.6 установлен через подписанное обновление; Browser 1.0.1 обновлён до комплекта 0.5.6. FileLaunch ждёт фактического UAC; persistent worker — свободного окна обслуживания. Все девять конфигураций ПК сохранены без изменений. |
| Server Workspaces | Host/runtime/features активированы 28 сентября. 2 октября после ремонта scaffold создан личный workspace владельца: Hub ready. Проверены файлы, инструменты и Codex initialize через Hub → SSH → broker; личный Codex пока не авторизован. |
| Daily checkpoints | Таймер уже установлен владельцем; последние три завершённых копии на поток. Не предлагать установку таймера заново. |
| Пользовательские проекты и активные Codex | Persistent runtime на Windows переживает обычные совместимые обновления Hub. Это не обещание пережить перезагрузку самого ПК. |

### Исправление IMG_0811

Обычные асинхронные вопросы отвечаются независимо: нажатие варианта отправляет
только этот ответ сразу, даже если соседний вопрос с текстом пуст. Свой текст
имеет кнопку под собственным полем. Принятые ответы сохраняются отдельно;
переоткрытие не отправляет их повторно и сохраняет недописанные ответы.
Предварительно отмеченный вариант не является согласием без нажатия.
Обязательные вопросы режима плана передаются полным набором в native request.

Проверены Chromium/WebKit: смешанная форма, несколько отдельных выборов,
переоткрытие частично отвеченной формы, точные question IDs, сохранённый черновик,
отсутствие ручного Steer и неизменный native Plan flow. Build/typecheck,
34 серверных теста, 25 проверок updater и smoke производственного образа проходят.
Это автоматические проверки; физический iPhone отдельно не объявляется проверенным.

### Исправление IMG_0816 — подключение окружения

Кнопка подключает готовое серверное окружение к существующей личной сессии,
не пересоздавая её и не ожидая активные чаты/терминалы. Проверены сохранение
активного хода и auth-watch, повторный connect, изоляция пользователей и restore
admission: 40 Linux Team tests. Chromium/WebKit проходят при 390/1024 в трёх темах.
Выпуск `fcd3fb6` установлен. Настоящий POST connect вернул 200, Devices содержит
server-workspace, список активных машин сохранил main-windows и добавил окружение.
Квитанция: `verification-fcd3fb6/live-connect.jsonl`.

### IMG_0817–0819 — вход, каталог и выделение текста

Выпуск `46e51ec` установлен: личное окружение, ожидающее вход Codex, сохраняет
каталог и не создаёт общую ошибку обновления проектов в чатах других машин.
Настоящие ошибки соединения остаются видимыми; личный вход по-прежнему требуется
для работы Codex. В подсказках указан предварительный переключатель входа по
коду устройства в настройках безопасности ChatGPT.

Выделение текста в обоих чатах приостанавливает автоматическую прокрутку и
переход к началу завершённого ответа; нативное выделение/меню копирования не
перехватывается. Проверены Chromium/WebKit: сохранение Range и позиции при
обновлении/завершении ответа, возврат в конец. Длинное нажатие на физическом
iPhone этими проверками не подтверждается.

После установки настоящий `/api/projects?refresh=1` вернул 200 и `warnings: []`;
проекты ПК и обе машины сохранены. Доказательство на Hub:
`verification-46e51ec/live-catalog.jsonl`. Пройдены 19 тестов Linux-образа,
25 проверок обновления/отката, Chromium/WebKit для копирования и выделения,
вход в изолированном производственном образе. Обновление: подготовка 125 с,
простой Hub 214 с (контрольная копия и проверка восстановления); сохранены
три последних завершённых engine checkpoints.

### Сокращение простоя при обновлении

Выпуск `9d148c1` установлен: устранены повторные полные проверки неизменившихся SQLite-баз.
Результат используется только внутри одного updater process и сбрасывается при
изменении базы/WAL/rollback journal, включая замену файла и ctime. Проверка прав,
аккаунтов и thread identities выполняется заново; самостоятельный restore не
использует прежний кэш. Репетиция восстановления сохраняет точную сверку байтов.
Квитанция обновления теперь содержит время отдельных этапов `stages`.

27 Linux regression tests проходят. На изолированной копии настоящих БД (основная
1,1 ГБ) create + admission: 89,0 → 21,2 с; оба restore вернули данные, записанные
после подготовки. Это последовательный стендовый замер, зависящий от файлового
кэша; его нельзя выдавать за простой production. QA-копии после замера удалены.
Доказательства: `update-downtime-qa/test.log`, `update-downtime-qa/benchmark.json`
на Hub. Исходный отдельный verify занимал 51,3 с, из них 28,1 с — SQLite.

Реальное обновление 2 октября: онлайн-подготовка 121,0 с; простой **52,5 с**
против 213,6 с предыдущего обновления. По `deployment-9d148c1.json`: остановка
1,5 с, checkpoint 32,8 с, старт engine 8,9 с, admission 2,3 с, web 6,9 с.
В checkpoint: исходные БД 14,3 с, файлы 0,5 с, SQLite copy 4,3 с, manifest
2,9 с, проверка сохранённых БД 1,0 с, копия восстановления 9,9 с. Это измеренный
запуск, не гарантия постоянного времени при другой нагрузке или размере данных.
Все три ранее активных persistent thread ID сохранились после установки
(`verification-9d148c1/continuity-before.json`, `continuity-after.json`), повторной
отправки не было. Retention оставил последние три завершённые копии.

## Текущая работа и условия

1. **GPT — реальные оставшиеся сбои [#185](https://github.com/EriArk/abyssdeck/issues/185).**
   Владелец сообщает, что отдельные чаты всё ещё проблемные. Глобальный healthy
   status этого не опровергает. Читать точный chat/job/canonical state для нового
   случая; не переотправлять старые запросы и не перезапускать ответ ради диагностики.
   Исправленные stale progress и scoped admission не предлагать реализовать снова.
2. **Companion 0.5.6 — завершение компонентов [#173](https://github.com/EriArk/abyssdeck/issues/173).**
   Владелец вернулся домой и явно разрешил обновление. Подписанный feed опубликован;
   UI 0.5.6 установлен в 13:49:09 UTC. Исправлены кнопки ремонта после обслуживания.
   Browser обновлён и отвечает через независимый MCP. FileLaunch сохранил прежнюю
   установку: Windows elevation не была подтверждена. Persistent worker не заменялся
   во время активных чатов; ожидает обычного idle admission. ПК друга недоступен.
3. **Upstream история [#188](https://github.com/EriArk/abyssdeck/issues/188).**
   Hub cache, incremental native IPC и reuse неизменного HTTP body уже работают.
   Остаётся полный canonical GET от upstream; поддерживаемый delta-контракт не
   установлен. Это отдельная оптимизация, не доказанная причина каждого сбоя GPT.
4. **Polish [#228](https://github.com/EriArk/abyssdeck/issues/228).**
   Каталог [polish](../polish/README.md) уже создан. Обсуждение дизайна с владельцем
   предшествует новым визуальным изменениям; переснимать всё без изменений не нужно.
5. **Server Workspaces [#170/#198](SERVER_WORKSPACES_2026-09-28.md).**
   IMG_0815 подтвердил успешный sudo repair: ready=true, все четыре слота очищены.
   Штатный API сверил старый creating intent: WORKSPACE_MISSING, затем state=absent.
   Новый create вернул 200/ready, повторный GET подтвердил ready. В собственном runtime
   проверены точные бинарные файлы, Git/Node/Python и Codex initialize без запуска чата.
   Добавление подключения исправлено в `fcd3fb6`: готовое окружение подключается
   к текущей сессии без ожидания чатов. Остался собственный codex login --device-auth. Прежняя Windows-машина и аккаунты не заменялись.
   #198 (managed integration copy) остаётся отдельным продуктовым объёмом.

Сверка открытых задач: [ISSUE_RECONCILIATION_2026-10-02.md](ISSUE_RECONCILIATION_2026-10-02.md).
Восемь завершённых/заменённых задач закрыты; большие trackers не означают отсутствия
всех функций внутри них. Оставшиеся архитектурные пункты не запускаются автоматически
из-за открытого issue.

## Проверки при использовании и отложенное

По решению владельца отдельного обязательного этапа аппаратной приёмки больше нет;
#10 закрыт как отменённый. Новые ошибки из реального использования становятся
конкретными исправлениями. Это не утверждение, что все устройства проверены.

Самостоятельный Hub installer #11, сравнение Remote #182 и глобальный AI operator
#206 не входят в выбранный проход. Узкая историческая причина terminal unknown #233
не установлена; текущий close/idle release исправлен и проверен на настоящем SSH.
Она не удерживает обновления и не требует повторять пользовательский ввод.

Текущий порядок владельца: завершение Companion, конкретные GPT-сбои, Server Workspaces.
Рекомендация — GPT-6 Astra, Высокое (`high`). Подробные результаты и реальные остатки:
[обновление 0.5.6 и ремонт GPT](COMPANION_GPT_WORKSPACES_2026-10-02.md).
