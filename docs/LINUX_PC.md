# Linux personal computer

A personal Linux machine uses `type: "ssh-linux"`, distinct from an isolated
server workspace. Project paths are absolute POSIX paths. The existing SSH key,
strict host-key checking and per-machine authorization apply to files, Git,
attachments, project setup/delivery, activity and resource inspection.

## Persistent Codex 0.167

Run the pinned Codex executable in a user systemd service with
`app-server --listen unix:///run/user/<uid>/abyssdeck/codex.sock` and a private
runtime directory. Install `ws` (the Hub's locked version) beside
`ops/linux/codex-socket-bridge.mjs`. Configure the machine's `codex.command`,
`codex.activityNode`, `codex.launcher` (the bridge's absolute path),
`codex.appServerSocket` and `codex.persistent: true`.

The Unix endpoint speaks WebSocket. The bridge converts the Hub's JSONL stream
to WebSocket messages over SSH. Closing/restarting the SSH connection does not
terminate the native server. The actual account must match the preserved machine
binding. Never replace account fingerprints to make a mismatched login pass.

Native acceptance on 2026-11-09 used Codex 0.167.0: account identity, eight native
models, permission profiles, planning, command execution, a completed answer and
a second answer surviving SSH disconnection/reconnection. The executable is
pinned separately from desktop app updates; update it only when native work is idle.

## Desktop, terminal and launching files

GNOME Remote Desktop shares the logged-in graphical session over RDP. Use a
separate generated credential and a TLS certificate. Hub configuration supports
`certificateFingerprint: "sha256:aa:bb:…"` (32 colon-separated bytes) while
certificate verification stays enabled. Guacamole remains on Hub loopback; do
not forward the PC's RDP or SSH port to the public internet. Screen sharing
requires the graphical session to be available; it is not a pre-login console.

A Linux `devices` entry uses the existing SSH PTY terminal, metrics and explicit
power/mount actions. Actions requiring elevation still prompt through the terminal.
Linux file launch supports `.sh`, `.py`, executable `.AppImage` and `.desktop`
files using user systemd units. A durable intent is written before launch; a
repeat checks that same unit and never starts a second process. Missing units
return an unknown outcome. Windows executables and the Windows-specific GUI
preview worker do not become Linux applications automatically; use Linux builds
and Remote for their windows.

The real installation also enables the two user services, linger for native
Codex, and a session-start mount of the surviving project volume by UUID. RDP
still follows GNOME's graphical session lifecycle.

## Recovery after losing the old OS profile

`upgrade-engine.py --recover-machine PRIVATE_PLAN.json` applies the explicit
replacement only after normal idle admission and a sealed full Team checkpoint.
The plan binds the original config checksum and one existing machine ID, supplies
its Linux machine/device settings, and declares Windows-to-POSIX path mappings.
It cannot replace authentication, Team or another machine's settings. Full
checkpoint rollback restores the old config and databases before public admission.
Background native discovery waits until candidate admission completes, then
resumes automatically. This prevents newly discovered desktop threads from
changing the exact identities being checked against the checkpoint.

Only the owner's catalog paths and thread working directories change. Existing
Hub/native thread IDs, account bindings, messages, attachments, result provenance
and operation receipts remain intact. Old native project IDs are retained as
recovery metadata rather than supplied to a new native profile.

If the old native profile was lost, affected threads become `historyMode: saved`.
The web sidebar groups these under the initially collapsed «Серверный архив».
Recovered projects without a new native binding appear there too; surviving
projects remain in the ordinary list with their usable chats. Archive history
is read-only, excluded from live activity counts and recent shortcuts, and
clearly labelled in explicit search. Temporary connectivity loss does not
reclassify a working project or chat as server archive.
History and backlinks read the public messages already retained on the Hub, with
pagination and no native reads. A send fails with `NATIVE_HISTORY_UNAVAILABLE`;
it never recreates a conversation or replays an uncertain prompt. This preserves
only the messages the Hub previously cached, not native history from the erased
disk. Surviving folders are mapped explicitly; absent folders are not fabricated.

Focused acceptance: Linux SSH/probe/file transfer tests; runtime identity,
file-launch, doctor, terminal and Team checkpoint tests; Chromium/WebKit Remote
selection and composer retention. On the real PC, verify an authenticated RDP
image, PTY, directory/Git inspection, and a harmless script whose duplicate launch
has exactly one effect. Keep private configs, credentials, receipts and detailed
installation proofs outside Git.
