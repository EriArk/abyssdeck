# Native Computer Use in Companion sessions (#166)

## Independent replacement installed — 2026-09-30

The owner updated successfully to desktop **26.928.2636.0**, CLI **0.159.2**,
Computer Use package **26.928.21956**, and `@oai/sky` **0.7.5**. Current runtime
paths exist. Native capture still times out on both Calculator and Notepad;
the owner confirmed the Calculator is visible and the desktop is unlocked.
The stock independent SDK transport still fails in nested App Server startup.
These are not remaining missing-executable evidence.

The owner then explicitly approved an independent same-user GUI adapter with
broad ordinary app access. `codexweb_computer_use` now supplies capture and input
through a separate local Companion task. Real screenshot/input/verification
passed locally and through Hub → SSH → installed persistent Companion with
CLI 0.153.4. See [implementation, installation and remaining acceptance](COMPUTER_USE.md).
The native vendor issue remains unresolved; the web route no longer needs its
pipe or update-sensitive runtime paths. Earlier sections below are historical.

## Owner-requested web-session and update-route check — 2026-09-30

The owner confirmed this turn runs through the web client and offered to switch
to desktop if recovery here fails. The normal in-turn `node_repl` / `@oai/sky`
call still fails to connect its native pipe. There are zero Computer Use pipes
and zero `ChatGPT.exe` processes. The persistent Companion's actual node_repl
child uses the existing `cua_node/b63ee7ee40c23b77` executable. This check does
not dismiss the owner's earlier successful repairs after executable relocation.

Update-route findings:

- Hub configuration read via SSH selects the installed persistent bridge and
  the private `8e5b6932251c2c1c` CLI snapshot. Its version is 0.153.4; the current
  desktop-relocated CLI is 0.158.0-alpha.2.1. Both Companion tasks have interactive
  logon. No active runtime was replaced.
- `Copy-CompanionRuntime.ps1` protects Codex plus its three execution helpers
  from desktop cleanup. It does not snapshot/update node_repl or Computer Use.
  Deployment documentation explicitly describes CLI upgrades as manual and
  idle-only. Do not confuse that protection with complete plugin runtime updates.
- Desktop logs show `cua_repl` discovery failing with missing path (OS error 3)
  at 06:35:49/50 UTC, then ready at 06:36:15. This is a concrete additional
  update/startup-path issue, distinct from the current `sky` missing-host error.
- The installed desktop package is `26.924.2738.0`; its Store updater and the
  current doctor report `26.928.2636.0` available. No update was installed here.
- Doctor warns about absent `CODEX_WINDOWS_REGISTERED_CORE`. Do **not** fix this
  by setting it blindly: the real desktop startup log also records the gated
  registered-core mode as disabled and explicitly selects copied runtimes.
  That warning does not establish a missing required Companion environment flag.
- Doctor's desktop `running: true` is not a reliable live-process check in this
  inspection: direct process and pipe enumeration found no desktop/host.

No production configuration or executable was changed. Web recovery has not
succeeded. Next compare actual Computer Use behavior after the owner's offered
desktop switch, then evaluate the available desktop update without replacing or
restarting an active writer. Companion redesign is explicitly deferred until
Computer Use works. Do not begin another identical standalone/read-only probe.

## Standalone startup narrowed — 2026-09-30

**Still not repaired or deployed.** A process-parent observation of the normal
`node_repl` -> `@oai/sky` call now establishes this chain:
trusted JS worker -> library-started Computer Use helper -> `codex app-server`.
The helper does start. The failing service is its child, not an absent helper
binary or a failure before helper launch. No helper protocol was called directly.

The stock node_repl workers run in a read-only filesystem sandbox. A separate
reproduction of the observed child command under that read-only policy exits
before initialization: with the owner's `CODEX_HOME` explicitly present it says
`failed to initialize sqlite state runtime` and reports denied temporary-path
writes. Without an explicit home it instead says `Could not find home directory`.
Both the installed 0.153.4 and current 0.158.0-alpha.2.1 App Servers fail in this
reproduction. The current CLI lists `sqlite` as a removed feature, not an
available configuration-only startup mode.

This is strong evidence of a startup/permission incompatibility in the
standalone route, but the original helper's nested stderr was not exposed:
do not present the reproduction as a captured original SQLite error. Direct
node_repl MCP stderr only reported initialization. A CLI diagnostic wrapper
captured sandbox launches but did not capture that nested stderr. No ordinary
model turn, app-input acceptance or host-with-desktop-closed acceptance passed.

Do not disable node_repl isolation, make the owner's Codex state writable from
its JS sandbox, patch the bundled helper, or substitute approval state to force
this probe through. A compatible native host outside the JS sandbox must retain
the stock app-policy/approval behavior and exact conversation writer ownership.
That integration is not established. This investigation changed no production
configuration, installed binary, desktop lifecycle or application source.

## Follow-up: runtime relocation and library-owned host — 2026-09-30

The owner reports that this previously worked and suspects an update relocated
the executable. Treat that as a hypothesis to check, not evidence of which
component failed. The installed `node_repl.exe`, Node executable and module
directory all currently exist under `cua_node/b63ee7ee40c23b77`; their explicit
config does not reference the removed `4004642ff3fabdc7` runtime. A fresh session
through the **installed persistent Companion's legacy CODEX1 entry** initialized
0.153.4, read the current config and enumerated windows using normal `@oai/sky`.
This still does not inspect a previously loaded CODEX2 thread's cached MCP state.

A separate, unauthenticated disposable App Server/MCP fixture reproduced an
absent command followed by a config path update. The new tool appeared on the
next `mcpServerStatus/list`, even before explicit `config/mcpServer/reload`, and
its tool call succeeded. This fixture tests direct MCP discovery/calls, not an
active model turn. It does not justify unconditional MCP resets before every
user message or a claim that a stale path caused this incident.

**Correction to the earlier integration assessment:** the installed `@oai/sky`
Windows client has a library-owned helper transport as well as the desktop
native-pipe transport. Its helper transport retains app approval through
`nodeRepl.createElicitation` and refuses when approval is unavailable. The
expected helper is included in the current package. Therefore a standalone
route exists in the installed library; do not repeat that keeping the desktop
open is necessarily the only implementation path.

In ephemeral diagnostic threads only, selecting that transport via the
`SKY_CUA_NATIVE_PIPE` MCP environment override caused `sky.list_windows()` to
fail with `codex app-server exited before returning response 1`. It failed with
the Companion and with a fresh 0.158.0-alpha.2.1 App Server, including advertised
MCP elicitation support. Matching the diagnostic `CODEX_CLI_PATH` to 0.153.4 did
not fix it. The error propagates through the trusted node_repl RPC worker; the
exact reason its supporting App Server exits is **not established**. No model
turn was submitted, so a direct-tool-call context limitation is also unexcluded.
Do not claim this proves the standalone transport cannot work in a normal turn.

No helper was spawned manually, private protocol client implemented, sandbox
disabled, app permission granted or production configuration changed. The
stock library was invoked through node_repl. Continue with the standalone
transport's failed supporting-service startup and its real approval contract;
do not repeat runtime-directory replacement as a complete repair. Neither
native Computer Use acceptance nor a production fix has been achieved.

## Recheck — 2026-09-30

**Status: not repaired.** The owner deliberately switched to desktop execution
for this investigation. The September 27 missing-host finding remains relevant
to web handoff, but it must not be read as proof that a separate App Server can
never use the desktop-hosted tool.

### Confirmed cause in AbyssDeck

`apps/web/src/WebHandoff.tsx` requests `releaseDesktop: true` together with the
explicit stop confirmation. `apps/hub/src/desktop.ts` dispatches `ForceRelease`
and admits web writes only after verified desktop closure.
`ops/windows/CodexDesktopControl.ps1` closes the desktop package and its own
direct App Server children, preserving Companion. The Computer Use host belongs
to that desktop package, so the handoff also removes its native endpoint.
The independently running Companion cannot recreate it merely by importing
`@oai/sky` or reloading MCP configuration.

The shutdown is not an accidental blanket process kill: it implements the
single-writer handoff required by AGENTS.md and decisions D22/D24. Removing this
step or reopening the desktop immediately after it is **not a verified fix**:
the native conversation writer can still conflict. Do not weaken that guard to
make window enumeration pass.

### New evidence with the desktop running

- Desktop package `OpenAI.Codex_26.924.2738.0_x64__2p2nqsd0c76g0`, app version
  `26.924.22138`; bundled `cua_node/b63ee7ee40c23b77`, `@oai/sky` 0.7.4.
- Companion still configures App Server 0.153.4. The separately installed CLI
  is 0.158.0-alpha.2.1; no active runtime was replaced.
- The current configured native endpoint had a live matching pipe. Endpoint
  identity and private config are intentionally not included here.
- The official `node_repl` / `@oai/sky` entry point listed windows in this
  desktop session. A fresh **separate** App Server, using Companion's configured
  executable and an ephemeral thread, also listed windows through public
  `mcpServer/tool/call`. It submitted no model turn and approved no requests.
  This was a local stdio probe, **not** acceptance of Hub -> SSH -> installed
  Companion or of an existing Companion thread's MCP configuration.
- A disposable Calculator was opened using `sky.launch_app`. Window capture in
  the current desktop session failed with `FrameArrived timed out`; fresh window
  selection and one activation/capture retry failed with `window capture timed
  out`. The cause of these capture timeouts is not established. Enumeration is
  not evidence of working screenshots, input or approval routing.
- The installed CLI's public App Server schema provides
  `config/mcpServer/reload`. This can refresh configured MCP connections, but
  does not bootstrap the desktop-owned native host. The current desktop does
  not expose a reachable App Server daemon control socket for the documented
  stdio proxy. Do not describe a proxy transport as installed or tested here.

### Remaining integration requirement

The unresolved part is a supported host/approval lifecycle compatible with
AbyssDeck's independent execution and exact native writer ownership. Keeping a
desktop process alive is only a necessary condition in this observed setup,
not an accepted implementation. No standalone host bootstrap or safe
desktop-writer release/host-retention contract was established in this pass.

No desktop restart/closure, global config edit, permission change, native helper
spawn, conversation handoff or Companion replacement was performed. Application
code and the installed release are unchanged. #166 stays open; capture and
end-to-end web execution have **not** passed acceptance.

## Recheck — 2026-09-27

**Status: reproduced; not repaired.** The current Companion session still has no
native Computer Use host. This is a desktop-host lifecycle/integration boundary,
not a missing runtime directory. Do not describe #166 as completed Computer Use
support or keep scheduling it as a routine runtime-path replacement.

### Current evidence

- Installed package: `OpenAI.Codex_26.915.3509.0_x64__2p2nqsd0c76g0`, package
  status Ok; bundled app version `26.915.31029`.
- Global `mcp_servers.node_repl` now points at existing `cua_node/4004642ff3fabdc7`
  executable/Node/module paths. Its configured app version is `26.915.31029`,
  matching the installed app. The old version/path observation from September 13
  is no longer current; updating those values has not supplied a pipe owner.
- The environment still pins `SKY_CUA_NATIVE_PIPE=1` and a concrete
  `codex-computer-use-<UUID>` endpoint. There were zero pipes with that prefix.
  The actual endpoint UUID and private configuration are intentionally omitted.
- The running chain is persistent Companion -> configured App Server ->
  `node_repl`, all in Windows session 1. Both installed Companion Scheduled Tasks
  are Running with Interactive logon. Hub -> system SSH -> Windows independently
  confirmed the package, task/session state and absent pipe. This is not the old
  SSH Session 0 desktop problem. No Electron desktop process was running.
- Companion's configured App Server reports `codex-cli 0.153.4`; the explicit
  `CODEX_CLI_PATH` in node_repl reports `0.155.0-alpha.9`. This version difference
  is recorded, not asserted to cause the absent desktop-owned endpoint. No active
  App Server was replaced merely to test that hypothesis.
- Using the installed Computer Use skill, `await import("@oai/sky")` succeeds.
  `await sky.list_windows()` fails before any window selection or screenshot:
  `Computer Use native pipe is unavailable: failed to connect native pipe: The
  system cannot find the file specified. (os error 2)`.
  Resetting only this diagnostic node_repl kernel, importing again and repeating
  the read-only call produces the same failure. No window titles/content were read.
- Read-only inspection of the **current** desktop archive confirms the main
  process creates a fresh `codex-computer-use-<UUID>`, configures
  `WindowsHelperTransport` with its parent PID, handles Computer Use approvals,
  and supplies the native pipe to thread node_repl configuration. Neither
  `CodexWebBridge.cs` nor `RuntimeBroker.cs` creates that integration.
  Current archive SHA-256:
  `8227f6234cf2cc418ec8bbdeedec03f8d777f85520929ff2d9d38e774f681dfd`;
  main bundle `.vite/build/main-CIvjSspu.js` SHA-256:
  `c85af4d37bc53b49fab69f4b48cd941d25b58cafb1b1e5eaa39b18e2497019ff`.

### Supported route and acceptance boundary

The current [official Computer Use guide](https://learn.chatgpt.com/docs/computer-use)
describes the desktop app plugin and per-app approvals. The
[official Remote guide](https://learn.chatgpt.com/docs/remote-connections)
retains that desktop host and its configured tools/permissions. Neither the
inspected installation nor the reviewed App Server documentation establishes a
supported standalone Companion endpoint bootstrap. This is a scoped finding for
the inspected version, not a claim that every future integration is impossible.

For native Computer Use now, use a desktop-owned session with the plugin enabled
and its normal permission flow. The existing explicit desktop handoff can be used
once work is idle. Starting the desktop alone does not rebind this existing
Companion conversation's fixed endpoint. Native acceptance must then list windows
and, separately, inspect a disposable agreed test window; it has **not** passed here.

A future in-web solution needs a supported host/approval/session contract. Do not
copy a live desktop's pipe UUID into global configuration, manually spawn its
internal helper, clone its private protocol, or claim GUI Preview / Run and show
implements native Computer Use. #166 explicitly excludes those substitutions.
No native settings, permissions, desktop lifecycle, Companion binaries, owner
conversation or paused GPT receipt were changed in this recheck.

## Historical inspection — 2026-09-13

Read-only diagnosis, 2026-09-13. No global configuration, native account, owner conversation, desktop process, helper lifecycle or AltarApps file was changed.

## Finding

The missing endpoint is a **per-desktop-process named pipe**, not a missing installation directory. The installed desktop owns its creation and approval/lifecycle integration. AbyssDeck's standalone Companion App Server does not create that desktop integration. A fixed pipe address in the explicit `node_repl` environment points to no running pipe owner in the observed session. Changing the runtime executable path or substituting another UUID cannot fix this lifecycle mismatch.

This explains the observed connection failure before listing windows. It does not prove that the account has the native Computer Use feature enabled, or that launching any executable would establish an approved integration.

## Evidence

- Installed package: `OpenAI.Codex_26.908.4834.0_x64__2p2nqsd0c76g0`, healthy package path; configured App Server reports `codex-cli 0.153.4`.
- Observed chain: the local `CodexWebCompanion.exe` launches its configured `codex.exe app-server --listen stdio://`. The Electron desktop was not running. Its absence is expected in the owner's independent web-client workflow.
- The configured `node_repl.exe`, Node executable/module directories and trusted paths exist. The “old installation path disappeared” hypothesis was not confirmed.
- The explicit global `node_repl` environment retains application version `26.901.51231` and one concrete `codex-computer-use-<UUID>` pipe. No pipe with that prefix existed at inspection. The version field is stale, but that alone does not account for the missing server.
- Read-only installed `app.asar` inspection (SHA-256 `2bd5b96a48232f3ccf3df6be50965920699ea3a1b4512dcdd770e209fd1f009e`): the desktop main bundle `.vite/build/main-D8abTQQE.js` creates a fresh native pipe path, owns `WindowsHelperTransport`, binds approval/activity to its App Server and disposes the transport with the desktop process. The path is supplied to its `node_repl` environment during desktop bootstrap. Initialization is gated by both native Computer Use feature flags.
- Repository inspection found no writer of `SKY_CUA_NATIVE_PIPE_DIRECTORY`, `BROWSER_USE_CODEX_APP_VERSION` or global `node_repl` overrides. The Companion source launches the configured stdio App Server and does not bootstrap Electron's Computer Use transport. The historical author of the explicit global override is unknown.

## Supported boundary and next use

Use the installed desktop's own session for its native Computer Use integration, subject to that account's feature availability and native permissions. Existing explicit Settings handoff can release web writers and open the same native conversation when the owner chooses. Merely starting the desktop does not establish that a pre-existing Companion session has inherited its fresh pipe or approval bindings.

AbyssDeck must not advertise a discovered MCP executable as proof that native desktop control works. Its allowlisted GUI Preview and manual Remote remain separate capabilities. This investigation adds neither a protocol clone nor a manual helper launcher. No successful native `list_windows`/screenshot acceptance is claimed; that requires a future explicit native-desktop session check. ClubManager's earlier SSH resource leak is a separate defect.
