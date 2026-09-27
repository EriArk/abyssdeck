# Exact Windows file launch (#180)

Files and the universal file viewer share one launch control. An existing exact
Codex artifact link opens the viewer without running anything. The launch panel
prepares a current file reference and names its project, PC and relative path.
Run is a separate tap. Open location mounts the existing Files window over the
source and selects the exact file. Remote mounts over the same source; no project
switch or same-name lookup occurs.

## Identity and execution

The authenticated personal Hub runtime resolves either an exact artifact ID from
its own database or the existing working-file source URL. No arbitrary shell,
arguments, machine address or working directory is accepted. Windows EXE, BAT,
CMD and policy-permitted PS1 are supported. COM and arbitrary associated documents
are not treated as programs. Batch paths with shell expansion metacharacters are
rejected. Working directory is the exact file's containing directory.

Preparation binds the project/checkout, complete configured machine, relative
path, SHA-256 and byte length for five minutes. Captured source provenance is
recorded for new Codex artifacts. Older/unproven copies, a changed machine binding,
and changed bytes require opening the current working file explicitly in Files.
Outside-project exports remain downloadable, without gaining execution rights.
Sharing material never delegates execution on its source machine.

Hub receipts are saved before dispatch. The PC mailbox publishes an exclusive
request and exclusive claim before starting a fixed interactive Scheduled Task
handler. Requests expire after 30 seconds, preventing a delayed launch after
an absent desktop returns. Repeated PUT and status reads never dispatch again.
Hub status reads coalesce and preserve terminal outcomes. Browser reads stop after
three failures or a bounded observation window; manual inspection remains possible.
A new launch requires a separate deliberate preparation and Run action.

The native helper rejects reparse ancestors, holds parent directory handles against
rename, opens the target against write/delete, and rehashes it immediately before
starting. It uses fixed handlers with no caller arguments, launches without elevation,
and does not inherit the helper's PowerShell execution-policy override. Script
policy remains the user's Windows policy. No Windows listener is created.

The helper observes the exact process for up to two hours, retaining PID, exit code
and fresh progress. Stale observation becomes unknown. Closing the UI, observation
expiry or a Remote failure never kills the launched process. Process exit does not
claim that an application delegated to another process has exited. This is not a
process manager. Up to four native observations run concurrently; receipts are
bounded at 10,000 and never silently recycled into new executions.

## Installation and persistence

New per-user helper: `CodexWeb/file-launch`, task `CodexWebFileLaunch`, Interactive
logon, limited privilege, private ACL, no task execution-time kill. Updates wait for
helper idle, retain state, back up prior helper files/task XML, and preserve other
existing task settings. The enrollment bundle installs it for new Windows PCs.
Existing GUI Preview and Codex Companion contracts and tasks remain unchanged.

Personal DB additive tables: file_launch_preparations, file_launch_operations,
artifact_source_bindings. Schema version stays 29; snapshots retain these tables.
No GPT job, private profile or uncertain send is inspected/replayed by this feature.

## Verification

- Focused backend tests: exact source resolution, changed/legacy/outside source,
  frozen project/machine, separate personal runtime, revoked execution access,
  expired preparation, lost acknowledgement, repeated request and early exit.
- Chromium/WebKit: Result viewer and Files use the same action; exact folder reveal,
  failed Remote return, draft continuity and reload without another launch; four
  themes at phone, keyboard phone, tablet and desktop widths. Screenshots inspected.
- Installed Windows helper through Hub -> SSH -> Scheduled Task: visible fixture
  EXE, CMD and PS1 windows in session 1, exact exit codes 0/7/9, duplicate prevented,
  changed source rejected. Test fixtures close themselves; no unrelated app is killed.
- Physical iPhone/iPad acceptance remains pending ordinary owner use.
