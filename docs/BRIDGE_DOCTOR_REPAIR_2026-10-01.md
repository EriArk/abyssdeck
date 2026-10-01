# Bridge Doctor audit and repair — 2026-10-01

## Evidence and changes

The owner requested native application updates and restoring bridge compatibility,
then explicitly continued the proposed Doctor audit/repair stage. The previous
release (`ba02bd4`, native `26.928.31416-ba02bd4`) had already restored live GPT.
This stage fixes the maintenance mechanism, not another native app upgrade.

Confirmed defects:

1. `GptService.doctorReport()` returned native provider health, but `doctorState()`
   validated it with the old browser-extension contract (bridge 6.3.14/protocol 5).
   Healthy native instances therefore produced false `GPT_CONTRACT_MISMATCH`
   incidents with all browser capabilities false. Native reports now use their
   own state/read/send contract. Known compatibility, cooldown and authentication
   errors are classified without copying raw errors or secrets.
2. Doctor's instructions AND native policies forced read-only execution. The
   explicit per-account `repair` mode now grants the existing full-access profile
   and normal client tool context only to that account's associated Doctor thread.
   Other diagnostic threads retain their previous permissions. Old configurations
   retain diagnosis-only until the account explicitly selects repair.
3. Both Doctor dispatch and session admission waited for all project work.
   Associated maintenance now runs alongside ordinary project chats; the owner
   can also continue while Doctor runs. Its instructions require an isolated Git
   worktree and ordinary verification/deployment. Worktree use is an instruction,
   not a new filesystem sandbox. Activation still follows the normal updater.
4. The installed association was `unknown`, although operation
   `6de23308-4afe-4935-82fb-0b43c0d95ae4` was complete and named the existing
   diagnostic thread `1b53baf4-61e0-46f2-864b-be740ede6ecc`. Exact stored creation
   evidence now restores the association automatically, without creating a thread
   or resending a turn. Stale busy Doctor state can be checked with read-only native
   inspection; it never steals another writer.
5. Pending old incidents could dispatch while the connection was already healthy,
   during the 30-second recovery debounce. Healthy observation now suppresses
   dispatch immediately. Sustained health retains incident history as recovered;
   current fault dispatch matches the current fingerprint only.
6. A definite pre-send missing destination can rotate the maintenance destination.
   Unknown acceptance retains its identity and is never retried. Changing repair
   to diagnosis while preparing aborts before sending a full-access turn.

## Deliberately retained boundaries

Private account/project association, exact operation receipts, native writer
ownership and normal deployment admission remain. No automatic replay of uncertain
messages, restart of unfinished provider responses, forced deployment, account
rebinding or credential export was added. Authentication and upstream cooldown
are distinguished from code incompatibility. Existing fault debounce and incident
coalescing keep a transient outage from launching repeated repair turns.

## Verification

- `pnpm build` and `pnpm typecheck`.
- 69 passing Linux behavior tests: Doctor, access/handoff, elicitation, queue, native
  provider/work. Candidate-image verification extends this to 76 tests with
  Companion/Team checks, plus 23 upgrade/checkpoint/rollback fixtures. Focused
  Windows Doctor/access tests also pass.
- Access fixtures updated to the already-shipped behavior: opening a thread only
  inspects it; an explicit send acquires a writer. Persisted-thread fixtures now
  declare native persistence instead of accidentally testing an empty draft.
- Chromium/WebKit real application fixture: selecting repair, disabling Doctor,
  dismissing incidents and preserving the parent draft. Screenshots cover four
  themes at phone, keyboard-height phone, compact tablet and wide tablet sizes.
- Fixture RPC checks the actual native `permissions=:danger-full-access`, `never`
  policy, repair instructions, parallel owner turns and unchanged preferences;
  diagnosis remains read-only. Lost acknowledgements never dispatch twice.

## Installed acceptance

Normal updater installed `1e22073` at 15:36 UTC, with verified backup and healthy
engine/web. Native ChatGPT stays `26.928.31416-ba02bd4`. The same Doctor association
recovered to ready and the owner's authenticated settings API enabled repair.
Native capabilities include `full`. All 88 old incidents are recovered; the same
one turn command and five messages remain. Neither recovery nor mode activation
sent a new Doctor turn. Both persistent Codex threads survived; the current turn
remained running. Both problematic GPT conversations returned fresh history,
healthy/read/send readiness; two old uncertain receipts remain unchanged.

Evidence: private `verification-1e22073/{doctor-live,doctor-final-counts,gpt-live,
continuity-before,continuity-after,receipt}.json` and deployment receipt. A future
real incompatible app update has not yet been
repaired autonomously by this new mode; controlled dispatch tests and installed
health/configuration checks do not claim that end-to-end result.
