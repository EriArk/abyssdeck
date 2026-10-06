# Deployment and operations

Examples use /srv/codex-web for private runtime state, /opt/codex-web for source and codex.example.com for the public origin. Replace them with your own values. Machine addresses in config.example.yaml are documentation examples, not defaults for your network.

This is an operator guide, not a verified clean-host installer. The October 6
revision reconciles the commands with the split gateway/engine sources; it has
not been exercised on a new Linux host in this documentation pass. Guided setup
and a reproducible clean-host rehearsal remain [#11](https://github.com/EriArk/abyssdeck/issues/11).
See [Contributing](../CONTRIBUTING.md) for local verification and known failures.

## Supported layout

The browser connects only to the Linux Hub through HTTPS. Use your own reverse proxy or the optional Cloudflare tunnel service in ops/linux/compose.yaml. Only port 443 of the Hub/ingress should be public. Do not expose Windows Codex, SSH, VNC/RDP or guacd to the Internet.

The configured Windows machine stays in the trusted LAN/Tailnet. The Hub uses system SSH and pinned host keys. The user-session Companion carries App Server stdio over a local-only named pipe; Windows must be running with the user logged in. Desktop ChatGPT/Codex does not need to stay open. After finishing a desktop-owned conversation, fully quit that client once to release its writer for the website.

Windows Pro may host RDP. Windows Home generally needs a configured VNC provider. Both are carried through Guacamole. Restrict Windows inbound SSH and Remote ports to the Hub address, and use encrypted LAN/Tailnet transport if the underlying LAN is not trusted.

Production runs two processes from the Hub image: `hub` is the web/API gateway;
`engine` owns authentication, storage, native sessions and queues. They communicate
through a private Unix socket. The gateway additionally needs a published web
release and its `current.json` pointer. Starting only the Compose service without
that initial publication is not a complete installation.

## Private state

Create a directory owned by the service user, mode 0700:

```text
/srv/codex-web/
  config.json        # Based on config.example.yaml; YAML or JSON accepted
  deploy.env         # CODEX_WEB_STATE=/srv/codex-web
  remote.env         # Only configured Remote secret variables, mode 0600
  ssh/config         # System SSH configuration with IdentityFile and pinned host keys
  ssh/windows_key    # Dedicated private key, mode 0600
  ssh/known_hosts
  engine/            # Private engine socket directory
  web-releases/      # Immutable releases, retained assets and current.json
  speech/            # Optional private worker socket mount
  documents/         # Optional private worker socket mount
  native-gpt/        # Optional private adapter mount, not a public endpoint
  data/app.db
  data/results/
  backups/           # Private snapshots; never serve over HTTP
  tunnel/config.yml  # Optional ingress configuration
  tunnel/TUNNEL.json # Only this tunnel's credential, mode 0600
```

The supplied containers use UID/GID 1000. Create the bind-mount directories with
that ownership before Compose starts; do not let Docker create root-owned mount
placeholders. Create `remote.env` as a private file even if no Remote secrets are
configured. If changing the service UID/GID, reconcile every relevant service,
worker and socket directory together. Team installations also have a shared
registry and personal namespaces; inventory the paths from their actual config.

Keep SSH keys, Remote passwords, ingress credentials and the website database out of Git. Do not copy native Codex auth.json or source repositories into Hub state. The tunnel container needs only its tunnel credential, not an account-wide Cloudflare certificate. Use your ingress provider's supported setup for your hostname and certificate.

## Fixed document pages

`ops/documents` builds a private LibreOffice worker for DOCX-to-PDF preview. Create
`${CODEX_WEB_STATE}/documents` owned by UID/GID 1000, mode 0700 before starting
the Compose `documents` service. Build it from the release's `ops/documents`
directory and set `DOCUMENTS_REVISION` to that image tag in `deploy.env`.
The engine mounts only its Unix socket directory, at `/run/codex-documents`;
there is no new public port. Start the worker before activating the engine release.

The viewer sends the already opened immutable DOCX through the authenticated,
CSRF-protected `/api/previews/docx` route. LibreOffice calculates automatic page
breaks and returns PDF pages; downloading still returns the original DOCX bytes.
The worker has no network, account/profile mount or persistent document storage.
Each conversion has its own disposable profile. Preview budgets are 32 MiB input
and output, 128 MiB expanded package and a 60-second conversion deadline; these
are parser budgets, not upload/download restrictions. The supplied Carlito,
Caladea, Liberation, DejaVu and Noto fonts cover common documents, but unavailable
fonts and advanced Word layout features can differ from Microsoft Word.

Validate an installation with `tests/documents-worker.py` inside the built image;
it checks real automatic/explicit pagination, final table, original bytes and
cleanup after cancellation. The API and Chromium/WebKit tests cover session/CSRF,
fixed pages, zoom and saving the original without losing the parent draft.

## Windows setup

For ordinary enrollment, start with the [Companion application](COMPANION_APP.md)
and [Windows enrollment guide](WINDOWS_ENROLLMENT.md). The scripts below are
operator-level component setup, not the complete Companion first-run experience.

Use elevated PowerShell for service/firewall installation. Supply your actual Hub IPv4 address and Windows account explicitly; the scripts have no owner-specific defaults:

```powershell
.\ops\windows\Enable-CodexHubSsh.ps1 -HubAddress HUB_LAN_IP -WindowsUser YOUR_USER -PublicKeyFile C:\Private\hub.pub
.\ops\windows\Install-Companion.ps1 -CodexCommand C:\Path\To\codex.exe -WorkingDirectories C:\Projects
.\ops\windows\Install-RemoteDesktop.ps1 -HubAddress HUB_LAN_IP -Installer C:\Private\tightvnc.msi -SecretFile C:\Private\remote.env
```

Inspect each script's parameters before installation. The Companion runs with the user's limited interactive token. The VNC installer script checks the official package signature and refuses to silently overwrite an existing server. For desktop-bundled Codex, Companion installation copies the complete selected runtime (Codex and its three helper executables) into its own versioned runtime directory and verifies SHA-256 hashes. Desktop updates cannot retire files underneath the independent App Server. Upgrades remain explicit: after active web work finishes, reinstall Companion with the current complete desktop bundle. Custom/standalone CLI paths remain unchanged. Older snapshots are retained because running App Servers may still use their helpers; incomplete staging directories can be reviewed after a failed installation.

## Start and first login

Use Node 24.18.x and pnpm 11.13.1, matching the Dockerfile. Review the selected
revision's local check results before installation; known baseline failures are
tracked in [#238](https://github.com/EriArk/abyssdeck/issues/238). Do not treat a
successful image build as a passing full test suite.

Prepare private config, directories, SSH and `deploy.env` first. Set
`CODEX_WEB_STATE=/srv/codex-web` in that file and use the same path in the commands
below. The config's `databasePath` and `resultsPath` must point into the mounted
state directory. For a fresh personal bootstrap use [the example config](../config.example.yaml)
with your own machine/project values. Do not turn on team mode against an empty
owner database: the source explicitly rejects that state. Team conversion uses
the separate [Team Workspace](TEAM_WORKSPACE.md) migration contract.

The following sequence is for a **new installation**, not an update shortcut:

```bash
cd /opt/codex-web
export SOURCE_REVISION=$(git rev-parse HEAD)
export WEB_REVISION=$SOURCE_REVISION
export ENGINE_REVISION=$SOURCE_REVISION

docker compose --env-file /srv/codex-web/deploy.env -f ops/linux/compose.yaml build hub
docker compose --env-file /srv/codex-web/deploy.env -f ops/linux/compose.yaml up -d --wait engine

# Publish the initial web release after the engine socket becomes healthy.
# No public postcheck URL yet: the gateway has not started.
docker run --rm --user 1000:1000 --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount type=bind,src=/srv/codex-web/engine,dst=/run/codex-engine,readonly \
  --mount type=bind,src=/srv/codex-web/web-releases,dst=/releases \
  "codex-web-hub:$SOURCE_REVISION" \
  node dist/publish-web.js /web /releases /run/codex-engine/engine.sock "$SOURCE_REVISION"

docker compose --env-file /srv/codex-web/deploy.env -f ops/linux/compose.yaml up -d --wait hub
```

Persist the selected `WEB_REVISION` and `ENGINE_REVISION` values in private
`deploy.env` for subsequent operator commands. Do not leave a later shell using
an unintended `local` image tag. Verify `/api/health` and `/version.json` through the
configured gateway and then through HTTPS ingress. Configure/start the optional
tunnel separately. A reverse proxy still requires the canonical HTTPS
`publicBaseUrl` and `secureCookies: true`.

Optional document/speech/native GPT services have separate configuration and
readiness requirements; the base sequence does not install or authenticate them.
Do not start all Compose services indiscriminately.

In personal bootstrap mode, the engine writes `data/setup-link.txt` with a private
single-use enrollment link. Open it and choose a password of at least 12
characters. This mode has no login username or default password. Team accounts
have their own identity/enrollment flow. Tokens, session digests and Argon2id
password hashes are stored instead of plaintext passwords.

The setup link is not a password-reset backdoor. Use the installed revision's
[credential recovery procedure](MAINTENANCE.md); never delete the database to
reset access.

## Upgrade and rollback

Record the installed web, gateway, engine and helper revisions before changing
anything. A web release and an engine image are different update targets.

1. Review the commit and local verification results. GitHub Actions is disabled.
2. For a compatible web-only change, use the checked publication path in
   `ops/linux/publish-web.py`. It verifies engine/schema compatibility, switches
   the immutable release pointer and checks the public result. Keep the previous
   release for rollback; this publication does not restart native work.
3. Gateway or engine image updates use their separate maintenance/admission path.
   An engine update must preserve active writers and uncertain receipts. Closing
   a browser does not mean native work has finished.
4. Before state-changing upgrades, create and verify the appropriate complete
   checkpoint. [Maintenance](MAINTENANCE.md) describes snapshot scope and restore
   limitations. Do not assume a single Store backup covers a team installation.
5. Activate only the intended component, then check its health, HTTPS access,
   exact version and private source access. Retain the previous image/state until
   the new deployment is verified.

Storage owns ordered migrations and rejects newer unsupported schemas. Its
migration checkpoint is not a full file/config/native-state backup. Do not run
downgrade SQL against live data. Rehearse an older complete snapshot in a fresh
private target, then deliberately switch the affected service to compatible
state. Preserve the original installation for rollback and never replay unknown
operations to make a restore appear complete.

[RELEASES](RELEASES.md) and [CURRENT_STATUS](CURRENT_STATUS.md) contain dated
evidence for the maintainer's deployment, not a guarantee about another host.

## Troubleshooting

Run doctor first; its default report is safe to share and contains bounded status codes rather than prompts, environment dumps or credentials. See [MAINTENANCE.md](MAINTENANCE.md).

- SSH_HOST_KEY_FAILED: verify the Windows host identity locally before updating only its pinned key.
- SSH_AUTH_FAILED: inspect the intended account and dedicated key permissions.
- COMPANION_STDIO_UNAVAILABLE: verify interactive login, the Companion task and configured Codex executable.
- CODEX_LOGIN_REQUIRED: sign into native Codex on its execution machine.
- THREAD_IN_USE: finish work in the client holding that conversation and fully exit it once; retry the original chat on the website.
- MIGRATION_PENDING: run the supported backup/upgrade path.
- PROJECT_ROOTS_UNRESTRICTED: configure the intended machine's allowed project roots and verify canonical-path checks; do not bypass the boundary to admit an arbitrary checkout.
- NXDOMAIN on one device: compare its resolver with authoritative/public DNS, check the hostname and stale router cache. Correct DNS locally; do not weaken HTTPS or replace hostname validation.
- Remote TCP failure: verify the configured LAN target and firewall source restriction. Do not open a public Remote port.

Raw Docker/SSH logs may contain installation-specific details; review them before sharing. Native integration scripts create disposable test conversations and may consume small Codex usage. Local portable checks and isolated browser fixtures need no production secrets.

## Observing desktop activity

Where the installed native layout is supported, optionally set `machines[].codex.activityNode` to the absolute path of Node 24+ on the execution machine. On Windows this is commonly `C:/Program Files/nodejs/node.exe`; verify the actual path. This setting only enables the fixed read-only metadata reader described in DECISIONS D25. It uses the existing SSH target and does not require a Companion restart or a listener. The machine must have node:sqlite and the native database layout expected by the reader. Unsupported or unreachable observation appears as unavailable, without writing to native files.

Pin the backup image to the deployed revision when upgrading. Restore rehearsal and old-image rollback require a compatible pre-migration snapshot; do not infer current schema compatibility from historical version examples.


## Optional Windows desktop restart

For independent GUI automation from web sessions, install the separate optional
[Computer Use module](COMPUTER_USE.md). It has its own limited interactive task,
stable MCP launcher and immutable versioned binaries. It does not require or
restart desktop Codex or either main Companion. Its install/update/rollback
procedure is distinct from the desktop restart control below.

From Windows PowerShell 5.1 as the intended desktop user with administrator rights, run `ops/windows/Install-DesktopControl.ps1` (optionally supply `-NodeCommand` and `-CodexHome`). Node must support node:sqlite; verify that the helper supports the installed native metadata layout. Installation creates the demand-only CodexWebDesktopRestart task and does not restart Codex or Companion. Set that machine's `codex.desktopControl` to the absolute installed path `%LOCALAPPDATA%/CodexWeb/desktop-control/CodexDesktopControl.ps1`, expanding the placeholder. Only configured Windows machines expose the Settings control.

Use the installed script's `-Action Status` for a read-only check. `-Action Probe -RequestId <new UUID>` exercises the scheduled interactive action without closing or launching Codex. Actual restart is requested from Settings and waits for no active tasks; a Windows login must remain available. The latest operation survives Hub/browser restarts. Never automatically retry an uncertain restart. Keep private desktop-control configuration and task definition in Windows backups. Reinstall the helper after a script change; no Companion restart is needed.
