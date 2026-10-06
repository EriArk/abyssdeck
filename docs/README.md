# AbyssDeck documentation

## Start here

| Goal | Read |
| --- | --- |
| Understand the product | [Main README](../README.md), [vision](VISION.md) |
| Understand the code and processes | [Architecture](ARCHITECTURE.md) |
| Plan a private installation | [Deployment](DEPLOYMENT.md) |
| Report a bug or contribute | [Contributing](../CONTRIBUTING.md) |
| Report a vulnerability privately | [Security reporting](../SECURITY.md) |
| Understand licensing and redistribution | [AGPL-3.0-only](../LICENSE), [scope](LICENSING.md), [third-party notices](../THIRD_PARTY_NOTICES.md) |
| Understand access and isolation | [Security model](SECURITY.md) |
| Back up, diagnose or recover | [Maintenance](MAINTENANCE.md) |
| Connect another user's Windows machine | [Enrollment](WINDOWS_ENROLLMENT.md), [Companion](COMPANION_APP.md) |
| Find website assets | [English promotional screenshots](../polish/marketing-en-2026-10-04/README.md), [full gallery](../polish/README.md) |

Deployment is operator-managed. A clean-host guided installer is still tracked in
[#11](https://github.com/EriArk/abyssdeck/issues/11). Example paths and addresses
must be replaced with the installation's own values. The [friend quick start](FRIEND_QUICKSTART.md)
also contains instructions for the maintainer's existing installation; it is not
a default public service or a complete self-hosting guide.

## Feature guides

- [Workspace](WORKSPACE.md), [project preparation](PROJECT_PREPARATION.md),
  [conversation bindings](CONVERSATION_BINDINGS.md) and [intake](PROJECT_INTAKE.md).
- [Files and editing](FILE_EDITOR.md), [viewers](FILE_VIEWERS.md) and
  [format-tool inventory](FILE_WORKSPACE_TOOLS.md).
- [Collaboration Spaces](COLLABORATION_SPACES.md), [activity](SPACE_ACTIVITY.md),
  [communication](COMMUNICATION.md) and [Brainstorm Rooms](BRAINSTORM.md).
- [Windows Computer Use](COMPUTER_USE.md), [native GPT on Linux](GPT_NATIVE_LINUX.md)
  and [independent personal Linux](PERSONAL_LINUX.md).

## Status, decisions and evidence

[Open issues](https://github.com/EriArk/abyssdeck/issues) track remaining work.
[CURRENT_STATUS](CURRENT_STATUS.md) records dated implementation and installation
evidence for the maintainer's deployment; its machine paths and versions are not
defaults for a new installation. Source completion, deployment and ordinary-use
verification are separate claims.

[Roadmap](ROADMAP.md), [decisions](DECISIONS.md), [releases](RELEASES.md) and
[verification](VERIFICATION.md) retain historical evidence. Dated proposals and
old "next stage" notes are not an instruction to repeat completed work.
`AGENTS.md` is the agent/owner decision record, not the product introduction.

The entry documents are in English. Some detailed guides and operational journals
remain in Russian. The English promotional gallery uses translated demo captures;
it does not establish that an English product locale has shipped.

Public-readiness follow-up: [dependency audit #237](https://github.com/EriArk/abyssdeck/issues/237),
[reproducible checks #238](https://github.com/EriArk/abyssdeck/issues/238) and
[release license/source packaging #240](https://github.com/EriArk/abyssdeck/issues/240).
The project license was adopted in [#239](https://github.com/EriArk/abyssdeck/issues/239).
