# Installed GPT check, 2 October 2026

Scope: the owner's request for one autonomous pass, issue #230 and remaining
reproducible reliability defects. Production baseline: Hub/engine `ed44e8d`;
owner native `26.928.31416-ed44e8d`. No existing uncertain user send was replayed.

## Live evidence

An authenticated, temporary audit session exercised the public Hub with Chromium
at 390×844. It used a separate native chat and five explicit test sends:

- A roughly 1,200-word story: close the browser immediately after durable HTTP
  202. Hub completed the turn and recorded an unread final answer independently
  of the browser. Canonical history contained one user/assistant pair.
- Three successive sends, closing the browser after admission: both followers
  remained visible before closing. All three completed in order, without duplicate
  native messages. Returned history included all four finished turns.
- Abort the first send response **after** its real HTTP 202 acknowledgement:
  one POST only, reload recovered the job, and the final answer arrived once.
  Canonical history ultimately contained five user/assistant pairs.
- Simulated history-read 503 and offline/online: previous answer and unsent draft
  survived; reloading restored the draft; recovery issued no send.
- The installed checkpoint timer fired at 22:31:07 UTC and correctly skipped a
  new copy because the last verified checkpoint was recent. Production offline
  duration has not been measured; the previously recorded isolated restore proof
  is still distinct from that acceptance.

Transient `unknown` without an error recovered canonically in these runs. It is
not evidence of a failed send and must not trigger a duplicate POST.

## Defects found and fixed

- [#231](https://github.com/EriArk/abyssdeck/issues/231): queued followers
  displaced an earlier, still-live turn awaiting its canonical acknowledgement.
  Progress, live text and Stop now select the same earliest outstanding job;
  an unconfirmed send offers no Stop action against a different queued job.
- [#232](https://github.com/EriArk/abyssdeck/issues/232): GPT project
  overview supplied `unread: false` for every chat. It now uses the same exact
  completion markers as navigation. Opening the overview does not mark a final
  answer read.

Regression: `gpt-continuity.test.mjs` and `gpt-progress-queue.browser.mjs`;
the latter verifies both fixes in the actual GptWorkspace in Chromium/WebKit.
The broad #185 audit remains open for scenarios not exercised here (including
physical-device behavior); these checks are not blanket product acceptance.

## Theme family variants (#230)

Four families, nine variants, five added. Legacy defaults remain organizer/light,
CRT/green, Hi-Tech/light and classic/dark. New variants are organizer/dark with
warm paper and gold decoration; neutral CRT/dark and silver CRT/light;
Hi-Tech/dark; classic/light. Shared geometry and independent casing/accents remain.

The strict preferences API stores a last choice per family, account-scoped local
storage supplies first paint, and Hub hydration restores another device. Invalid
family/variant combinations are rejected. Rejected writes roll back the preview.
Settings and the in-app guide describe the same controls.

`theme-variants.browser.mjs`: nine variants in Chromium and WebKit at phone,
tablet and desktop widths, populated chat with table/code, settings screenshots,
legacy defaults, family memory, unchanged case, draft persistence, fresh-device
hydration and failed-save rollback. Screenshots were inspected. This does not
claim physical iPhone acceptance.

## Credits

The installed `main-windows` account/rateLimits projection returned 18% weekly
allowance and a native balance of 62500 credits at this check. No account or
billing setting was changed. AbyssDeck treats usage as information and delegates
turn admission to native Codex; it has no percent-zero send gate.

`usage-continuation.test.mjs` supplies both windows at 100% consumed plus credits,
then verifies one exact native `turn/start` and no reset-credit consumption.
Purchased usage credits and earned limit-reset credits remain separate.
[OpenAI pricing documentation](https://learn.chatgpt.com/docs/pricing#what-are-tokens-and-credits)
describes available credits extending work after included usage. The real account
has not yet crossed that boundary in this audit; actual boundary billing is not
claimed verified, and no balance was deliberately exhausted to manufacture it.

Local ignored evidence: `.local/live-gpt-audit/`, `.local/qa-theme-variants/`.
Temporary audit authentication was revoked in both session stores at the end of
the audit. The last installed status check returned healthy, canRead/canSend true,
zero active jobs; two pre-existing uncertain receipts were preserved.

## Candidate verification and activation

`d8ec99e` is committed/pushed to main. The production image passed Linux focused
Companion/Team socket/auth and credit-continuation checks, checkpoint/rollback/
upgrade fixtures, and Chromium/WebKit login plus real authenticated DOCX rendering.
Evidence lives at `verification-d8ec99e` under the Hub service directory.

The ordinary updater initially waited to replace `ed44e8d` with `d8ec99e`. At
2026-10-01 23:05 UTC the owner personal engine returned one unknown Devices
terminal, zero busy terminals; the member engine returned zero for both. Read-only
host inspection found the existing SSH bash foreground process without visible
child commands, which does not prove that its editable input buffer is empty.
At that point no terminal was closed and no input was injected. The owner then
confirmed this was the finished terminal and explicitly requested fixing window
closure and installing the update. After checking the exact shell again, only
that idle shell was closed. The ordinary updater installed `d8ec99e` at
2026-10-01 23:11:33 UTC; both containers are healthy, schema 30, active Codex
continuity preserved. Three verified checkpoints remain.

[#233](https://github.com/EriArk/abyssdeck/issues/233) adds explicit
window release after verified idle, cancellation on reconnect, and single-Enter
normalization of pasted commands. The old unknown state is not retroactively
attributed to the independently reproduced duplicate-newline defect.

`bb4cc01` installed through ordinary admission at 2026-10-01 23:33:49 UTC.
Production Chromium opened an actual `hub-host` SSH terminal, submitted a
five-second sleep with a pasted trailing newline and closed Devices. The terminal
remained open while the command ran, then closed automatically after completion.
At 23:36 UTC the root and both personal engines returned busy=0, unknown=0;
GPT returned healthy, canRead/canSend true, zero active jobs. The exact temporary
verification session was revoked in both stores. Three verified checkpoints remain.

Candidate verification: 22 focused production-image checks, a real Linux no-echo
PTY check in the same build stage with Python, 25 checkpoint/rollback/admission
fixtures, and Chromium/WebKit image login and DOCX pipeline checks. Local browser
regressions cover explicit close, active work, reconnect, network disconnect and
single-Enter input. Evidence: `verification-bb4cc01` on the Hub and ignored local
`.local/server-audit-20261002/`. This does not claim physical iPhone acceptance.
