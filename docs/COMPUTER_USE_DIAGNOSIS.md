# Native Computer Use in Companion sessions (#166)

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

The missing endpoint is a **per-desktop-process named pipe**, not a missing installation directory. The installed desktop owns its creation and approval/lifecycle integration. CodexWeb's standalone Companion App Server does not create that desktop integration. A fixed pipe address in the explicit `node_repl` environment points to no running pipe owner in the observed session. Changing the runtime executable path or substituting another UUID cannot fix this lifecycle mismatch.

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

CodexWeb must not advertise a discovered MCP executable as proof that native desktop control works. Its allowlisted GUI Preview and manual Remote remain separate capabilities. This investigation adds neither a protocol clone nor a manual helper launcher. No successful native `list_windows`/screenshot acceptance is claimed; that requires a future explicit native-desktop session check. ClubManager's earlier SSH resource leak is a separate defect.
