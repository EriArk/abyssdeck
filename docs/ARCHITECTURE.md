# Architecture

AbyssDeck combines private project workspaces, native AI integrations and explicit
collaboration on an operator-managed Linux Hub. This page describes the current
component boundaries. Dated installation evidence lives in
[CURRENT_STATUS](CURRENT_STATUS.md); earlier design proposals remain in Git history
and the [decision record](DECISIONS.md).

## Processes and connections

```text
Desktop / tablet / phone
          |
       HTTPS / WebSocket
          |
  Web/API gateway (hub service)
          |
     private Unix socket
          |
  Persistent engine
      +-- authentication, personal stores and shared registry
      +-- projects, files, Results, queues and operation receipts
      +-- private machine connections / Companion / Codex
      +-- private native GPT adapter
      +-- guacd for configured Remote Desktop connections
      +-- private document and speech workers
```

The production [Compose definition](../ops/linux/compose.yaml) separates the
replaceable gateway from the engine. The gateway serves an immutable web release
and forwards authenticated application traffic through the private engine socket.
The engine owns authentication, SQLite, native sessions, queues and private PTYs.
A compatible web publication does not replace that engine or its native workers.
Engine/schema updates have separate maintenance admission and checkpoint rules.

The combined development launcher is a different mode: `pnpm start` starts
`apps/hub/dist/main.js`. Do not infer the production topology from that command.
See [deployment](DEPLOYMENT.md) for the initial web-release publication step.

## Source map

| Location | Responsibility |
| --- | --- |
| `apps/web` | React workspace, responsive themes, Files/viewers, Results and settings |
| `apps/hub` | Gateway, engine, authentication, storage, orchestration and publication |
| `apps/companion` | Windows Companion application and device integration |
| `packages/shared` | Shared types and protocol contracts |
| `packages/machines` | Machine transports and source-bound operations |
| `packages/codex` | Codex protocol integration |
| `ops` | Installation, workers, platform helpers and maintenance tools |
| `tests` | Unit/integration, browser and explicit native/operational checks |
| `polish` | UI studies and captured screenshot collections with provenance |

## Identity and ownership

Resolve the authenticated principal before selecting a personal runtime, Store,
machine or native connector. Each user has private storage/artifacts, machine
configuration, native sessions, GPT bindings and background work. A failed
connection must not fall back to another user's machine or account.

The shared installation/collaboration registry holds users, logical projects,
memberships, checkouts, published objects and coordination permissions. A logical
Project and a user's Checkout are distinct: machine/path/native conversation IDs
and local Git state belong to the checkout. Shared project membership grants
access to published shared material, not to another member's private native chat.

Long-lived operations retain initiator, project/checkout, source revision and
receipt identity. Authorization is checked again at the operation's relevant
dispatch, commit and publication boundaries. Downloads, WebSockets, terminal and
Remote tickets retain their resource scope. Host administration is trusted; this
is not end-to-end encryption against the installation owner.

[Team Workspace](TEAM_WORKSPACE.md), [Collaboration Spaces](COLLABORATION_SPACES.md)
and [conversation bindings](CONVERSATION_BINDINGS.md) describe the detailed contracts.

## Storage and recovery

SQLite stores Hub metadata, history projections and operation receipts. Captured
artifact bytes are private files exposed through authenticated source-bound APIs.
Native conversation/account state remains owned by its provider on the execution
machine; a Hub history cache is not a replacement for that state.

An uncertain acknowledgement is reconciled against the exact original receipt.
It must not cause an automatic second send, command, commit or installation.
Readiness failures are scoped to the affected integration/conversation. Ordinary
navigation and diagnostic reads do not authorize repairs or replay input.

[Maintenance](MAINTENANCE.md) distinguishes data snapshots, private configuration,
multi-user state and external native/project backups. Schema checkpoints alone
are not a complete installation backup. Restore and rollback require matching
state and source compatibility, not downgrade SQL against a live database.

## Execution and optional integrations

Windows execution uses the logged-in user's local-only Companion through the
private SSH route. The Companion UI, execution workers and optional
[Computer Use module](COMPUTER_USE.md) have separate lifecycles. Interactive GUI
work belongs to the user's session, not an SSH service desktop. There is no
public Companion GUI listener.

The [native GPT adapter](GPT_NATIVE_LINUX.md) is a private, account-bound
integration. Native compatibility and installed versions must be checked
separately from the web build. Slow history alone is not proof of a broken client.

[Independent personal Linux](PERSONAL_LINUX.md) is an optional direction for
invited users: persistent files/services and SSH/SFTP over VPN/Tailscale, with
Codex optional. Prepared sources do not establish a completed Incus installation
or host-isolation acceptance. The installation owner retains their existing host
connection; that does not grant other Hub administrators host access.

## Shared user interface

Files uses one source-aware manager, including the separate Files window opened
from Git. Results remains a feed. The universal viewer keeps the same source,
window, position and draft when changing from view to edit.

Desktop code editing can use Monaco. Markdown, CSV/TSV, ordinary text and
mobile/iPad code editing use CodeMirror; a mounted document must not lose its undo
history merely because the window changes size. Format-specific capabilities and
limits are listed in [file tools](FILE_WORKSPACE_TOOLS.md).

CRT Green and Hi-Tech 2000 use continuous device casings with recessed screens;
Organizer retains its book/paper character. Wide layouts have adjustable panels
and a working-window dock; phones use reversible single-panel navigation.

For access controls read the [security model](SECURITY.md). For reproducible local
checks and their known gaps read [Contributing](../CONTRIBUTING.md). The
[documentation map](README.md) links the remaining feature contracts.
