# Private Server Workspace host boundary

This package prepares the host boundary for #170/#198. It does **not** yet add a
machine to the public app: Linux Files/Git/Codex/terminal integration, preview
proxy and user enrollment remain separate consumers, pending host acceptance.
The existing Windows transport and production engine are unchanged.

## Runtime

- Dedicated `codex-workspaces` OS account, rootless Podman and cgroup v2.
  Ubuntu's host AppArmor/user-namespace policy stays enabled. Stock Podman 4.9
  skips per-container AppArmor in rootless mode; this package does not claim that
  extra layer, disable the host policy or switch to privileged containers.
- Four preallocated 16 GiB ext4 loop disks, 64 GiB total. Root owns the backing
  images; a container receives one mounted disk, never the block device/image.
  Filesystem allocation enforces the limit. Disk ownership is durably assigned
  before container creation; an unclaimed nonempty disk cannot be assigned.
- Read-only approved base image, writable `/workspace`, bounded tmpfs, no
  capabilities, no-new-privileges, default seccomp, private namespaces.
  Each runtime: 2 CPU, 2 GiB RAM with no additional swap, 384 processes.
- Runtime processes have public IPv4 egress. A UID-scoped nftables output table
  rejects host-local destinations, private/LAN/Tailnet, link-local/metadata and
  IPv6. It does not alter Docker/UFW rules or other users. DNS uses a public
  resolver; no host proxy/environment/agent is inherited. There are no published
  ports. Services remain inside the workspace until a protected preview exists.
- Node, Python/venv, Git, gh, build tools and pinned Codex CLI in the base image.
  Users' credentials will be created inside their own `/workspace/home` through
  their explicit login. Existing native profiles/tokens are never imported.

## Private broker protocol

The rootless broker listens only on `/run/codex-workspace-broker/control.sock`.
It has no host-root helper endpoint or container API socket. The OS peer UID
must equal the configured Hub UID, and each request requires a short-lived HMAC
capability binding the exact owner UUID, nonce and request digest. The key belongs
only to the private engine/host installation; never expose it to a browser.
Production user/session authorization must precede signing and revocation must
close existing streams. No member access is enabled by this package alone.

First frame: `{claim, request, mac}` with canonical sorted ASCII JSON. Claims:
`owner`, `issued`, `expires` (at most 30 seconds), `nonce`, `digest` (SHA-256 request).
Requests: `status/create/start/stop/revoke`, or `exec` with `argv` and absolute
container `cwd`. No request accepts images, volumes, ports or runtime flags.
All exec arguments follow the fixed exact container argument; no host shell runs.

Exec returns `ready`, then base64 `stdout`/`stderr` frames and `exit` with code.
Client sends base64 `input` and explicit `eof`. Frames and concurrent channels are
bounded, output uses backpressure, stalled writes stop after 30 seconds. An idle
App Server may keep its channel open. Receipts retain accepted/completed/unknown
states; a lost stream or broker restart never replays a command. Unknown remote
effects remain unknown. Stop/revoke are explicit actions, not recovery side effects.

## Installation and acceptance

`prepare-server-workspaces.sh` previously installed rootless prerequisites.
Build `Containerfile` with the recorded immutable Node base and pinned Codex
version. Save the image archive and its SHA-256; prepare an exact setup manifest
using the committed Python sources. The manifest `image` must be the archive's
config digest from `install.archive_image_id(Path(archive))`, never an assumed
`docker inspect .Id`: Docker's containerd store can report an OCI index digest.
Preserve that build identifier separately as `sourceImageId` if needed. The
[OCI config digest is the ImageID](https://github.com/opencontainers/image-spec/blob/main/config.md#imageid).
`apply-bundle.py` without `--apply` verifies file/archive hashes and this exact
config identity before printing the plan. With `sudo ... --apply`, `install.py`
rechecks them, loads/inspects the exact image before provisioning disks/services,
and pins the same config digest throughout broker and acceptance. No tag fallback.

Installation creates disks/services/firewall and tests two disposable environments.
It refuses existing running infrastructure rather than replacing active work.
Existing disks are never reformatted, including after interrupted installation.
Acceptance checks namespaces/capabilities, seccomp, actual cgroup limits,
host/sibling paths, denied private network, working public dependencies, ENOSPC,
normal tools and preserved data after restart. No real account is signed in.
Only exact disposable test containers/files and empty test directories are removed.

Readiness is written to the private Hub state `workspaces/host-readiness.json`.
On failure the broker stops; disks and network restrictions remain for inspection.
Timeouts and malformed acceptance output also stop it. If acceptance is forcibly
interrupted, temporary containers may remain; installation refuses to replace them.
The engine/gateway/native clients are not restarted. The runtime is not advertised
as usable until real-host checks and the application integration are completed.

The broker registry, slot-to-owner identity, image version and fixed disk snapshots
must become part of coordinated backup/restore before user enrollment. Do not copy
live loop image files as a supposedly consistent backup. Rebuild and deletion are
deliberately not exposed yet; they need exact ownership and active-work admission.

Application integration now uses a runtime-only owner capability and the existing
private system SSH connection to `client.py`. Do not put a service account, key or
raw host-shell endpoint in member configuration. The `serverWorkspaces` section
selects the host SSH target/config and absolute host-side Hub key path; each actor
explicitly creates their own slot through Settings. Copies of machine JSON have
no execution authority. The application prepares missing private HOME directories
in older images before marking an environment ready (Codex requires CODEX_HOME
to exist). Existing Windows machines and credentials are unchanged.

### Offline paired disk checkpoint

`backup.py` is an administrator tool, separate from browser download/export.
It does **not** stop users or mount/unmount anything. Before `backup --apply`:

1. Enter ordinary coordinated Hub maintenance after active work has finished;
   preserve the verified cold Team snapshot and its `team-manifest.json`.
2. Stop the workspace broker and all its containers, then unmount the claimed
   slot mounts. Keep the Hub engine stopped throughout the disk checkpoint.
3. Run `sudo python3 <release>/ops/workspaces/backup.py backup --apply
   --directory <new-private-directory> --team-snapshot <verified-team-snapshot>`.
4. Run the same tool with `verify` and those paths. Start the exact mounts and
   broker only after verification, then resume the Hub normally. Failure never
   automatically starts anything.

The checkpoint includes the SQLite broker registry/receipts and exact sparse
disk bytes, SHA-256, image/config identity, slot-to-owner mapping and paired Team
registry hash. It checks stopped broker/containers and unmounted disks before
copying. A private Team backup without this companion does not contain workspace
files or accounts. Keep the installation's existing keys and image archive under
the separate host backup policy; this tool restores only the same installation.

Restore the paired Team snapshot with native admission still **blocked**, stop
engine/broker/containers and unmount the slots. Use `restore --apply --directory
<disk-checkpoint> --team-snapshot <paired-team-checkpoint> --live-team <restored-team.db>`.
All copies/hashes finish before replacements; mismatched identities, reused slots,
running services, mounted disks and damaged files refuse restoration. Previous
disk/registry files remain under an exact `.before-restore-<uuid>` suffix. Newer
broker receipts and revocations survive restoration; accepted operations become
unknown, never replayed. An interrupted replacement remains offline for operator
recovery. Do not automatically reopen native admission after restore.

Focused coverage: `tests/server-workspace-integration.test.mjs`,
`tests/workspace-backup.test.py`, and `tests/server-workspace-runtime.py <runtime.tar>`.
The latter exercises the actual installed image in a disposable rootless store,
without signing in or allocating a production owner slot. It is not real-account
or real-disk restore acceptance. The transport does not expose container ports
or the host network.

### Protected application preview

The runtime includes Chromium. The project's preview window opens a separate
ephemeral browser **inside the same user's container**, starting at its loopback
HTTP port. The Hub transports bounded JPEG frames and explicit typed input through
the existing private broker exec channel. No project HTML runs at the Hub origin;
Hub cookies, browser profiles and CDP ports are not exposed. Chromium uses
`--no-sandbox` inside the existing rootless namespace/seccomp/network/disk boundary;
this is not an additional Chromium sandbox claim. Downloads are disabled there;
use project Files for original bytes. The temporary browser HOME is under `/tmp`.

Two views per private runtime, maximum 1600×1200, coalesced one-second frame reads,
bounded input and two-minute inactive expiry limit resource use. Changed project,
machine authority or revocation closes a view. A lost input confirmation is never
replayed. Closing the window stops only its browser; the application keeps running.
The next view has a fresh browser session (unsaved form text/cookies are not kept).
Phone taps/swipes, keyboard/text insertion and screen presets use one themed UI.

Checks: `tests/workspace-preview.test.mjs`, `tests/workspace-preview.browser.mjs`,
and `tests/server-workspace-runtime.py <runtime.tar> --preview` (real disposable
rootless Chromium and Codex, no production account). CDP uses the official
[Page](https://chromedevtools.github.io/devtools-protocol/tot/Page/) and
[Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/) interfaces.

### Automatic paired checkpoint service

`apply-features.py --apply` installs the reviewed `features-package.json`, exact
runtime archive/config digest, and `install-checkpoint.py` package. This combined
runtime update is **pre-enrollment only**: any existing workspace registry row
refuses it; existing-user image migration is separate. No disk is reformatted.
The new timer waits until Hub activation; it is not evidence of a completed backup.

Root installs fixed scripts under `/opt/codex-workspace-checkpoint`, settings at
`/etc/codex-workspaces/checkpoint.json`, and `codex-workspace-checkpoint.timer`.
The timer tries every 30 minutes (with jitter), skips when a verified pair is less
than 23 hours old, and keeps three complete sets in the root-private
`/var/lib/codex-workspace-checkpoint/backups`. Existing Hub-only copies remain
independent; they must never be described as copies of workspace disks.

The coordinator serializes with engine deployment/profile maintenance. It first
prepares the Team backup's file inputs online (not old backups or restore rehearsals
stored alongside them). Warm copies alone are never valid checkpoints. After fresh
idle admission it stops the Hub and broker, checks for detached workspace processes,
stops only idle containers and unmounts exact claimed slots. It reconciles changed
files, captures SQLite databases and copies workspace disks at that frozen point.
Sparse disk copies skip unallocated ranges while retaining the format-1 SHA-256
over all logical bytes. Filesystems without extent support use the linear fallback.
The original services resume **before** the Team CLI builds/verifies the archive
and before disk checksum verification. The CLI mounts only the isolated captured
state at its original absolute paths; it never mounts the live state. A running
app/server defers the copy; it is not killed. A private journal records transitions before
effects. `ExecStopPost` invokes the fixed `checkpoint.py --recover` to restore
exact mounts, original containers and the original Hub, preserving revocation.
No user commands are replayed. If identity has changed, recovery refuses and keeps
the journal for an administrator. Never delete that journal to force a new copy.

The backup container rootfs is read-only, but its isolated snapshot bind is writable
for SQLite sidecar bookkeeping. Live Hub data and browser profiles are never
available to this container. Completion records include prepare, capture/restart
and verification timings. A held maintenance lock is a successful deferred run.

Only `complete.json` marks a verified pair. After successful recovery, the current
invocation removes its own failed staging or its successful temporary frozen tree.
Older incomplete/foreign directories are not swept. Retention removes older completed
sets only after the new pair verifies; a filesystem cleanup failure does not fail
the completed checkpoint or stop services. Restore uses the paired Team snapshot and `disks` directory
with the offline procedure above, native admission still closed. Keep the previous
runtime archive and host keys separately. Focused tests in
`tests/workspace-checkpoint.test.py`, `tests/workspace-backup.test.py`,
`tests/team-engine-upgrade.py` and `tests/checkpoint-installer.test.py` cover refusal,
interrupted unmount, corrupted copies, warm source changes, resume-before-verification,
revocation, retention and exact installation hashes. They are not production disk
restore acceptance.

For an existing installation, build **only** the checkpoint update package:

```sh
python3 ops/workspaces/package-checkpoint.py --output /absolute/new-package \
  --hub-user INSTALLATION_USER --state /absolute/hub-state
sudo python3 /absolute/new-package/install-checkpoint.py --apply
```

The package contains source and installation paths, no credentials or backup data.
The installer preserves disks/runtime, refuses an active checkpoint/recovery journal,
verifies installed module hashes and records `workspace-checkpoint-install.json` in
Hub state. It enables the ordinary timer without starting a checkpoint immediately.
Do not rerun the pre-enrollment `apply-features.py` for this update.

Hub activation uses the ordinary `ops/linux/upgrade-engine.py` release with
`--enable-server-workspaces --workspace-image sha256:<accepted-config-id>`.
It requires the new accepted host image and active checkpoint timer, disallows
forced maintenance, checkpoints Team before adding the exact fixed host binding,
and verifies private identities before public admission. Rollback restores the
original configuration as well as Team data. It does not migrate the owner's
existing Windows projects or copy account credentials into new workspaces.

Focused Linux checks: `python3 tests/server-workspaces.test.py`.
Primary references: [Podman run](https://docs.podman.io/en/v4.9.3/markdown/podman-run.1.html),
[Podman exec](https://docs.podman.io/en/v4.9.3/markdown/podman-exec.1.html).
The rootless AppArmor distinction follows
[containers/common's profile admission](https://github.com/containers/common/blob/v0.57.4/pkg/apparmor/apparmor_linux.go#L239-L251).
