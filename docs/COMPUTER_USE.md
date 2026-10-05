# Independent Windows Computer Use

The optional `codexweb_computer_use` MCP server lets Codex work with ordinary
applications in the configured Windows user's logged-in, unlocked desktop.
The desktop Codex application may be closed. The normal main Companion, native
chat ownership and Hub authentication remain unchanged.

## Use

Ask Codex to work with the intended application. It can list visible windows,
launch an existing local `.exe` by its exact discovered path, bring a selected
window forward, capture it, click/double-click, type Unicode text, press key
chords (including `WIN`, `LWIN`, `RWIN`), scroll and drag. An action uses one recent screenshot and is followed
by a fresh observation. Launch has no shell or command arguments.

The image covers the visible portion of the selected foreground window. Unlike
the native capture implementation, this adapter does not capture an occluded
window: select its covering dialog or uncover it first. Moving/minimizing the
window, changing focus, locking Windows or switching to the secure desktop
invalidates input. Ordinary app sign-in and authorization are allowed when the
user requests them: login/password fields, Tab, Enter and sign-in buttons use
the same fresh observation and focus checks as other input. The adapter does
not reject a field merely because it masks its text. This owner-approved rule
supersedes the original blanket authentication prohibition.

Version 1.0.3 treats a passive surface owned directly by the observed window
(same Windows user/session, `WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT`)
as part of that app's captured image. This fixes WebView2 hover/status surfaces
incorrectly causing `WINDOW_OCCLUDED`. An empty title or shared process alone
never exempts a window. Foreign overlays and ordinary dialogs still block capture;
foreground, focused-control and exact pointer-target admission remain unchanged.
The transparent style describes painting, not permission to click through an
overlay: see [Windows extended styles](https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles).

Run `tests/computer-use-occlusion.tests.ps1` for the native offscreen-window
regression alongside `tests/computer-use.tests.ps1`. Fixtures verify the owned
passive surface and five blocking variants without sending input to user apps.

Use credentials explicitly supplied or read using appropriate file tools from
the user's designated files/configurations for the requested account, including
test fixtures. Authorization for that scope persists; do not ask again for each
field or login. Respect the user's explicit identification of non-sensitive test
data. Do not harvest unrelated sources, operate password managers, access another
person's account without authorization, or echo private secrets in replies.
The adapter does not log input, but ordinary MCP arguments can be retained in
conversation history. Direct user entry remains available for private passwords.
This is not a new secret vault or a claim that MCP text is absent from conversation logs.

Explicitly requested security/privacy changes through ordinary desktop controls
are allowed. There is no categorical ban on terminals or the Codex interface.
Prefer existing CLI/Devices tools for commands and native protocol for chat
actions; GUI use must preserve active native ownership and the single writer.
Browser tools are preferred when available, without a blanket ban on browser GUI.
Secure desktop, elevation bypass and another user's Windows session remain
outside the module. Ask only for missing authorization or an unresolved consequential
choice; do not add approval prompts to routine steps the user already authorized.

Do not repeat an input or app launch just because its response timed out. Read
the current window again and determine what happened. A used screenshot cannot
authorize another input. Taking over a desktop another person is actively typing
on can change focus; coordinate ordinary use with them.

## Install and update

Run as the intended Windows desktop user, with their interactive session open:

```powershell
./ops/windows/Install-ComputerUse.ps1
```

The installer uses the configured persistent Companion CLI to register MCP,
or accepts `-CodexCommand` for an explicit CLI. It creates only the current user's
`CodexWebComputerUse` task and files under `%LOCALAPPDATA%\CodexWeb\computer-use`.
The task is Limited/Interactive, runs at logon, and has no network listener.
The main Companion tasks and their CLI runtimes are untouched. The global Codex
config is backed up privately before adding this MCP server. Vendor-managed
`node_repl` and native Computer Use configuration are not changed.

For subsequent module upgrades, finish Computer Use actions and stop **only**
the idle `CodexWebComputerUse` task, then run this installer. It refuses to replace
a running host. It stages and hashes both binaries, starts/probes the new host,
and publishes an atomic `current.json` pointer only after readiness. The stable
`Start-ComputerUse.ps1` verifies the chosen client's SHA-256 before launch. Old
runtime files remain in place while already-running clients use them. Do not
delete runtime directories merely because the pointer has moved.

The prior task XML, pointer and launcher are kept in a sibling backup directory.
To roll back when idle, stop only the GUI task, restore its previous task XML and
pointer/launcher from that same backup, and start it. No desktop Codex update or
Companion writer restart is needed. `-SkipMcpRegistration` installs/probes the
module without changing the Codex configuration.

New native sessions read the MCP registration. A native session that already
cached its tool catalog may need a normal idle reconnect/reopen or supported MCP
reload. Do not restart a running task merely to refresh its catalog.

The registration includes the non-secret `CODEXWEB_COMPUTER_USE_RELEASE` source
SHA-256. Updating only the stable launcher's `current.json` leaves the native MCP
configuration unchanged, so a supported `config/mcpServer/reload` can retain the
old client and its initialize instructions. The release fingerprint makes the
configuration change visible without moving the launcher or replacing an active
client's files. After registering an upgrade, use the supported native reload and
verify the target thread with `mcpServerStatus/list`; acknowledgement alone is
not proof that it received the new contract. Reload queues refreshes for loaded
threads; do not interrupt active work to force an immediate refresh.

To disable, remove `codexweb_computer_use` with `codex mcp remove`, then stop its
GUI task. To keep it disabled across logon, disable that task too. This does not
disable the main Companion or code/file/terminal support.

## Boundaries and focused verification

- The pipe ACL and impersonated client identity restrict it to the same Windows
  SID; `PIPE_REJECT_REMOTE_CLIENTS` excludes SMB access. Target PID, process start,
  same-user session, visibility and foreground are rechecked before input.
- No screenshot/text/arguments are logged by the adapter. MCP delivers images to
  the requesting Codex conversation using its existing transport.
- Frames, images, window registries, concurrent pipe connections and actions are
  bounded. Observations expire after 90 seconds and are invalidated before input,
  including uncertain failures. There is no automatic input retry.
- `tests/computer-use.tests.ps1` checks bounded protocol input, key parsing,
  cross-client isolation, single-use capabilities and expiration without touching
  the desktop. Live acceptance is separate.

On 2026-09-30, the installed module captured a real test window, clicked its
editable surface, typed `CodexWeb работает`, and showed the exact text in a new
image. A separate ephemeral App Server through **Hub → SSH → installed persistent
Companion → CLI 0.153.4 → MCP** captured the same window, clicked and typed into it.
Reusing the consumed observation was rejected without duplicate text. That
probe opened no model turn and closed only its disposable runtime. The owner’s
desktop and active chats were not restarted.

The final installed module also launched the normal Windows Calculator, captured
its window, injected a number key and showed the changed display in a fresh
screenshot. This is the same application whose native capture had timed out.

This verifies the adapter and the installed web execution transport. A complete
owner-driven switch back to the PWA after closing desktop Codex remains physical
acceptance; do not label the vendor's `@oai/sky` capture bug fixed.

On 2026-09-30, version **1.0.1** removed both the MCP instructions' blanket
authentication prohibition and the runtime `ES_PASSWORD` rejection. The installed
stable launcher returned the new authorization contract through the actual
Hub/owner LAN SSH route. A local synthetic WinForms masked field accepted exact
text, Enter and Tab through the installed host, verified in fresh images. No real
account login was attempted. The fixture was closed; main workers, Companion UI,
existing MCP clients and their old runtime files were preserved. Existing clients
may retain old initialize instructions until their next normal MCP connection.

Version **1.0.2**, installed on 2026-09-30, permits explicitly requested ordinary
desktop security/privacy changes and credentials from user-designated files or
configurations. It removes categorical terminal/Codex GUI bans and supports
Windows-key modifiers. Key parsing, extended input flags and the existing
capability/isolation checks passed; this pass did not perform a real account
login or change security settings.

At 18:10 UTC, the existing idle AltarAppsReborn thread was refreshed through the
owner's actual Hub/LAN SSH/persistent runtime. Before registration of the release
fingerprint, native reload acknowledged the request but the thread still reported
1.0.0. With the fingerprint, the same supported reload produced **1.0.2 / connected**
and the updated `act` description. The native PID/runtime instance and active
turn were preserved; both active Hub threads remained persistent. No model turn,
native worker restart or main Companion restart was used. The eight unrelated
task definitions, UI process and installed binary hashes were also verified.
