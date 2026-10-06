# Third-party notices

AbyssDeck's AGPL-3.0-only license applies to its own covered material. It does not
replace third-party licenses or remove their notices. This is an index of known
license boundaries, not a complete license bundle for every distributable image.

| Component/material | License and retained notice |
| --- | --- |
| Vendored Apache Guacamole client | [Apache-2.0](apps/web/public/vendor/LICENSE-guacamole.txt) and [upstream NOTICE](apps/web/public/vendor/NOTICE-guacamole.txt) |
| DejaVu font | [Upstream font notices](apps/web/public/fonts/DejaVuSans-LICENSE.txt) |
| occt-import-js 0.0.23 / OpenCascade-based conversion | [Retained LGPL-2.1 text](docs/licenses/occt-import-js-LICENSE.md); inspect the complete native/WASM dependency sources and notices when packaging |
| dxf-viewer 1.0.49 npm dependency | MPL-2.0, as recorded by the installed package; [upstream project](https://github.com/vagran/dxf-viewer) |
| DXF measurement behavior imported from EriArk's separate DXF Viewer | [Retained MIT notice](docs/licenses/DXF-Viewer-MIT.txt), [source project](https://github.com/EriArk/-DXF-Viewer); this is distinct from the npm dxf-viewer library above |
| web-push 3.6.7 | MPL-2.0; [upstream project](https://github.com/web-push-libs/web-push) |
| DOMPurify 3.4.15 | Package offers MPL-2.0 OR Apache-2.0; retain the applicable upstream notices |
| sharp / bundled native image libraries | The inspected Windows sharp package declares Apache-2.0 AND LGPL-3.0-or-later; inspect each target platform's native payload separately |

React, Three.js, Monaco, CodeMirror and many other dependencies carry their own
permissive licenses. Additional transitive packages include Apache-2.0, BSD, ISC,
BlueOak-1.0.0, Zlib and 0BSD terms. A package-manager license field helps inventory
them but does not replace the actual license/notice files or source obligations.

To inspect the installed production npm dependency set:

```sh
pnpm install --frozen-lockfile
pnpm licenses list --prod --json
```

That output includes absolute local package paths; remove them before publishing
an inventory. The installed dependency set can vary by platform. Inspect the
Windows Companion's NuGet packages and each optional worker/container separately.
Fonts, native binaries and provider applications are not fully inventoried by pnpm.

When distributing a build, retain the applicable licenses and attribution, provide
required source/build materials, and verify each copyleft component's conditions.
Do not label the entire distribution exclusively AGPL or claim that an upstream
URL alone satisfies every redistribution requirement. See [licensing](docs/LICENSING.md).
