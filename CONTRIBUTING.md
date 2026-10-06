# Contributing to AbyssDeck

AbyssDeck is an actively developed, operator-managed project. Start with the
[documentation map](docs/README.md) and [architecture](docs/ARCHITECTURE.md).

## Discuss and report

Search [existing issues](https://github.com/EriArk/abyssdeck/issues) before opening
a new one. For a bug, include the revision, platform, relevant component, steps,
expected behavior and actual behavior. Use fictional data in reproductions and
redact private paths, conversation contents and credentials.
Report vulnerabilities through the [private security channel](SECURITY.md).

For a substantial feature or visual change, discuss the intended workflow first.
Existing themes, source ownership, drafts and recovery behavior are product
requirements. Keep changes focused and explain any effect on stored data,
permissions, native integrations or deployment compatibility.

Original AbyssDeck material is licensed under [AGPL-3.0-only](LICENSE).
Intentional contributions are submitted under the same terms unless separately
licensed material is explicitly identified and accepted by the maintainer.
Contributors retain their rights; no copyright assignment or CLA is required.
Only contribute material you have the right to submit, and preserve third-party
notices. See [licensing scope](docs/LICENSING.md) and
[third-party notices](THIRD_PARTY_NOTICES.md).

## Build and check

Use Node.js 24.18.x and pnpm 11.13.1. The Hub and its full backend verification
target Linux. Windows-specific Companion checks require their own Windows/.NET
toolchain. A Windows failure in a Unix-socket or POSIX fixture is not automatically
a product regression; do not describe a Windows run as a complete Linux baseline.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
node scripts/check-repository.mjs
```

These commands do not deploy the application. GitHub Actions, automatic dependency
PRs and auto-merge are not used; verification is run locally or on an isolated
Linux verification host. Do not add a hosted workflow as a prerequisite.

The October 6 audit found existing lint/test failures. Their resolution is tracked
in [#238](https://github.com/EriArk/abyssdeck/issues/238); do not present the full
suite as green or hide unrelated failures. Report exact commands, platform,
revision and outcomes in a PR. Dependency follow-up is tracked in
[#237](https://github.com/EriArk/abyssdeck/issues/237).

Focused backend checks run after building, for example:

```sh
node --test --test-timeout=30000 tests/repository.test.mjs
```

Browser fixtures live in `tests/*.browser.mjs`; native/acceptance scripts are
separate. Read a script's prerequisites before running it. Ordinary checks must
use disposable state and simulated integrations, not an existing user's account,
server, native conversation or deployment credentials. Browser screenshots prove
the fixture behavior, not physical-device or live-provider acceptance.

## Submit a focused change

- Explain the concrete problem and resulting behavior.
- Include relevant verification and any known limitations; attach wide/narrow
  screenshots for visible UI changes.
- Preserve uncertain-operation receipts and at-most-once input. Navigation and
  health checks must not replay mutations.
- Keep generated builds, private state, logs, credentials and local tooling out
  of Git. Preserve existing compatibility IDs and native account bindings.
- Record source completion separately from installation. A commit or merge does
  not authorize restarting a running service or installing a candidate runtime.

`AGENTS.md` contains the project's agent instructions and dated owner decisions.
It is not the newcomer tutorial; use the documentation map for that entry point.
