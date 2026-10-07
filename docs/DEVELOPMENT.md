# Local development

Use a separate checkout and disposable state. You can build and open the interface
without Codex, ChatGPT, GitHub credentials or a connected development machine.
Those integrations remain unavailable until explicitly configured. This is a local
development setup, not the production gateway/engine installation.

## Get the source

Requirements: Git, Node.js 24.18.x and pnpm 11.13.1 (the versions declared in
`package.json`). Linux is the reference platform for the Hub test suite; Windows
can build the web/TypeScript packages and run the combined local launcher.

```sh
git clone https://github.com/EriArk/abyssdeck.git
cd abyssdeck
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
```

Use an installed Corepack or install the declared pnpm version with your normal
Node package tooling if Corepack is unavailable. Do not regenerate the lockfile
merely to get past a different local package-manager version.

## Open an isolated local interface

Create `.local/development/config.json` with the following content. Both its
database and files stay under the ignored `.local` directory. Run commands from
the repository root so the relative paths resolve consistently.

```json
{
  "hub": {
    "publicBaseUrl": "http://127.0.0.1:8780",
    "host": "127.0.0.1",
    "port": 8780,
    "databasePath": "./.local/development/app.db",
    "resultsPath": "./.local/development/results",
    "secureCookies": false
  },
  "auth": {},
  "machines": [],
  "projects": []
}
```

Linux/macOS shell:

```sh
HUB_CONFIG="$PWD/.local/development/config.json" pnpm start
```

Windows PowerShell:

```powershell
$env:HUB_CONFIG = (Resolve-Path .local/development/config.json).Path
pnpm start
```

Open the private first-use URL in `.local/development/setup-link.txt` and choose
a local password of at least 12 characters. There is no default password or login
username in this personal bootstrap mode. Do not share the setup URL or commit
the state directory. After setup, use `http://127.0.0.1:8780`. Stop with Ctrl+C;
restarting with the same config preserves your local state.

The interface starts empty. Use the browser fixtures for populated simulated
workflows; do not copy the maintainer's database or native account profiles.
Connecting real machines, enabling Team mode and installing private GPT require
the separate [deployment guide](DEPLOYMENT.md).

`pnpm start` serves the built interface. Rebuild after changing web source.
`pnpm dev` rebuilds once and watches the compiled Hub entry; it is not a complete
TypeScript/web hot-reload environment.

## Choose checks for the change

| Change | Checks and platform |
| --- | --- |
| Documentation/templates | Check relative links, `git diff --check`, repository guard |
| TypeScript/shared contracts | `pnpm build`, `pnpm typecheck`, affected tests |
| Hub, SSH, Unix sockets and engine | Linux; build first, then affected `tests/*.test.mjs` |
| Web layout/interaction | Build and relevant `tests/*.browser.mjs`; Chromium and WebKit |
| Windows Companion/helpers | Windows/.NET; [Companion build guide](COMPANION_APP_BUILD.md) |
| Native integration/deployment | Explicit operational checks with the correct private setup; not an ordinary contributor test |

Useful commands from the repository root:

```sh
node scripts/check-repository.mjs
node --test --test-timeout=30000 tests/repository.test.mjs
pnpm lint
```

For a browser fixture, install the browser binaries first. Linux may also need
Playwright system dependencies (`pnpm exec playwright install-deps chromium webkit`).

```sh
pnpm exec playwright install chromium webkit
node tests/auth-startup.browser.mjs
```

These browser scripts launch their own fixtures; they are run with Node, not
`playwright test`. Inspect each script's prerequisites and fixed local ports.
Screenshots and private run output belong in `.local`, not tracked source.

`pnpm test` builds and runs the full Node suite. The full baseline is not yet
clean: see [#238](https://github.com/EriArk/abyssdeck/issues/238). The October 7
repair cleared the 95 blocking lint errors and the TypeScript test-loader failure;
existing lint warnings remain. Build/typecheck and 54 focused tests passed on
Windows and in an isolated Linux container using preinstalled dependencies.
The full Linux suite and a fresh dependency installation were not rerun in that pass.
Report the exact command, platform and result; a focused pass is not a full pass.
GitHub Actions are disabled; no hosted CI approval is required.

## Find the implementation

Use the [architecture source map](ARCHITECTURE.md#source-map) to choose a module
and the [documentation map](README.md) for its contracts. Current behavior and
historical investigations are indexed separately in [History](HISTORY.md).
Follow [Contributing](../CONTRIBUTING.md) for scope, review and branch cleanup.
