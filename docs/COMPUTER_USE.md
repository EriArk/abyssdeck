# Independent Windows Computer Use

The optional `codexweb_computer_use` MCP server lets Codex work with ordinary
applications in the configured Windows user's logged-in, unlocked desktop.
The desktop Codex application may be closed. The normal main Companion, native
chat ownership and Hub authentication remain unchanged.

## Use

Ask Codex to work with the intended application. It can list visible windows,
launch an existing local `.exe` by its exact discovered path, bring a selected
window forward, capture it, click/double-click, type Unicode text, press key
chords, scroll and drag. An action uses one recent screenshot and is followed
by a fresh observation. Launch has no shell or command arguments.

The image covers the visible portion of the selected foreground window. Unlike
the native capture implementation, this adapter does not capture an occluded
window: select its covering dialog or uncover it first. Moving/minimizing the
window, changing focus, locking Windows or switching to the secure desktop
invalidates input. Do not automate passwords, authentication/security dialogs,
terminals or the Codex interface through these GUI tools. Existing private
Devices terminals remain the route for commands and password prompts.

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
