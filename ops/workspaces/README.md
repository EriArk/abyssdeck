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
using the committed Python sources. `apply-bundle.py` without `--apply` prints the
plan. With `sudo ... --apply`, it verifies hashes before invoking `install.py`.

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

Focused Linux checks: `python3 tests/server-workspaces.test.py`.
Primary references: [Podman run](https://docs.podman.io/en/v4.9.3/markdown/podman-run.1.html),
[Podman exec](https://docs.podman.io/en/v4.9.3/markdown/podman-exec.1.html).
The rootless AppArmor distinction follows
[containers/common's profile admission](https://github.com/containers/common/blob/v0.57.4/pkg/apparmor/apparmor_linux.go#L239-L251).
