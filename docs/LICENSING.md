# AbyssDeck licensing

Copyright (C) 2026 EriArk and contributors.

The owner selected the **GNU Affero General Public License, version 3 only** on
October 6, 2026. The SPDX identifier is `AGPL-3.0-only`. The complete, unmodified
license text is in [LICENSE](../LICENSE); this page is a practical explanation,
not a replacement license or an additional commercial-use restriction.

## Scope

The repository's original AbyssDeck code, documentation and original assets are
covered by AGPL-3.0-only unless a file or accompanying notice specifies otherwise.
Existing third-party and separately licensed material retains its own terms.
The [third-party notice index](../THIRD_PARTY_NOTICES.md) identifies known special
cases, including material imported from the owner's separate MIT DXF Viewer.
Screenshot provenance is preserved; this license does not relicense third-party
application content or marks depicted in a capture.

The `private: true` package field prevents accidental npm publication; it does
not mean that the project's source license is private or noncommercial.
AGPL-3.0-only does not automatically authorize use under a later AGPL version.

## Use, modification and distribution

Commercial use, paid support, installation and paid hosting are permitted under
the license. When conveying covered software, preserve notices and comply with
the applicable source-distribution requirements. If you modify the program and
let users interact with that modified version remotely through a computer network,
section 13 requires a prominent opportunity for those users to obtain its
Corresponding Source at no charge through a standard means of copying software.

Corresponding Source means the source for the actual version being provided,
including the required build/install scripts. Linking to an unrelated or newer
upstream revision does not supply the source for private changes. A fork may
provide its own source archive or repository; contributing a PR upstream is not
required by this license.

Ordinary user projects, conversations, uploaded files and generated results do
not acquire AGPL merely because AbyssDeck stores or processes them. Section 2
limits coverage of output to output that itself constitutes a covered work.
Do not include credentials, private profiles or user data in source downloads.

These terms do not replace the conditions of separately installed providers,
native applications or services. Installing an integration does not grant rights
to redistribute that provider's binaries, account or branding.

## Contributions

Unless explicitly identified as separately licensed material accepted by the
maintainer, intentional contributions to AbyssDeck are submitted under the same
AGPL-3.0-only terms. Contributors retain their rights; this policy requires no
copyright assignment and creates no exclusive commercial exception for the owner.
Only submit material you are entitled to contribute and retain upstream notices.
See [Contributing](../CONTRIBUTING.md).

## Name and presentation

The AbyssDeck name and logo identify the official project. Describe a fork or
hosted instance accurately and do not imply official maintenance or endorsement.
These identification guidelines do not narrow the software rights in AGPL or
claim trademark registration. Third-party product names identify integrations;
their rights remain with their respective owners.

## Release responsibilities

Adding this license to the repository is not a certification of every existing
binary, container image or installed service. Before distributing a release,
verify that its license/notices and exact Corresponding Source are available,
including the applicable dependency sources and build materials. Check frontend,
server, Companion, bundled native libraries, fonts and optional worker images
separately. Preserve any required relinking/replacement rights for LGPL components.

The October 6 review inspected production npm metadata on Windows and existing
vendored notices. It is not a complete Linux-image or NuGet redistribution audit.
No installed runtime was changed by this repository licensing step.
Release packaging and source/notice verification are tracked in
[#240](https://github.com/EriArk/abyssdeck/issues/240).

## License text provenance

`LICENSE` was obtained from the SPDX license-list-data entry
[AGPL-3.0-only](https://github.com/spdx/license-list-data/blob/main/text/AGPL-3.0-only.txt).
SHA-256 of the committed text:
`d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee`.
The [OSI license page](https://opensource.org/license/agpl-3.0) also reproduces
the license, including section 13 on network interaction.
