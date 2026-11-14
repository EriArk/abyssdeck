# Linux recovery Companion

Small local GTK 4 window and command-line controls, installed in the user's home
so they remain available if the project disk or website fails. Python 3 with
PyGObject/GTK 4, systemd user services, Node and the existing bridge's `ws` module
are required. No new network listener or copied credentials.

Install against an existing `abyssdeck-codex.service`:

```sh
python3 ops/linux/companion/install.py \
  --projects /absolute/path/Projects --disk-uuid ACTUAL_FILESYSTEM_UUID \
  --node /absolute/path/node --ws-module /absolute/path/bridge/node_modules/ws \
  --ssh-helper /absolute/path/private-ssh-wrapper \
  --url https://your-abyssdeck.example
```

The SSH wrapper must use the installation's existing pinned host identity and
noninteractive authentication. Remote controls target only `codex-web-engine`
and `codex-web-hub`. The installer does not restart running services.

Launch **AbyssDeck Companion** from the application menu. Checking status is
read-only. Start starts the local Codex service idempotently. Restart buttons
require confirmation that current work can be interrupted; they never replay a
message or acquire an existing chat's writer. Server restart is explicit even
when a health check fails. Remote failure does not hide local controls.

CLI fallback, also independent of the project disk:

```sh
python3 ~/.local/share/abyssdeck/companion/control.py status
python3 ~/.local/share/abyssdeck/companion/control.py start
python3 ~/.local/share/abyssdeck/companion/control.py restart-client --confirm-interruption
python3 ~/.local/share/abyssdeck/companion/control.py restart-server --confirm-interruption
```

## Boot requirements

The project filesystem must be configured by UUID in `/etc/fstab`; a desktop
login autostart script using UDisks is insufficient for unattended boot.
For the owner's NTFS Data volume the installed options are
`uid=1000,gid=1000,umask=022,nofail,x-systemd.automount,x-systemd.device-timeout=10s`
and its original `/run/media/eriark/Data` path is retained. Systemd generates the
mount point and automount unit on boot. Do not create replacement project folders
on the system disk when Data is absent.

Enable the user service, SSH at system boot and user lingering. The installed
service drop-in accesses the project directory (triggering automount), checks
the actual filesystem UUID before starting Codex, and retries a failed start
with a 10-second delay. The desktop session is not required for web coding;
interactive desktop/browser control still needs its normal graphical session.
The server containers should retain their existing restart policy.

A `Type=simple` service can become active before its socket listens. Recovery
waits for read-only native initialization/account/model responses, retrying only
ENOENT/ECONNREFUSED during startup. It does not retry commands or messages.

## Verification

`python3 tests/linux-companion.test.py` covers disk absence/wrong identity,
confirmation, scoped restart, startup readiness and inspection without effects.
`control.py --smoke` constructs the real GTK window then exits without service
changes. Exercise a real local restart only when that native runtime is idle;
the desktop app and its runtime are independent. A source test is not evidence
of a physical reboot or of a successful remote server restart.
