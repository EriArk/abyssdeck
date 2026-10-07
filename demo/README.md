# AbyssDeck website demo

**The current distributable is the entire [site](site/) folder.** Its entry point
is [site/index.html](site/index.html). Copy that folder into your website's static
files; it contains the application, fonts, editors, examples and license notices.
It needs a static HTTP server, not an AbyssDeck Hub, account or API. There is no CDN.
Opening this module-based edition through `file://` is not supported.

This edition builds the actual `apps/web/src/main.tsx` React application and theme
styles. Files, Git, viewer/editor, Devices, chat, Results, settings, window controls
and responsive layout are the product components. The website edition supplies
fictional API responses, an English presentation dictionary and demo help content.
Production source files are not modified by the demo build.

## Embed on your own site

For example, copy everything inside `site/` to `public/demos/abyssdeck/`:

```html
<iframe
  src="/demos/abyssdeck/index.html"
  title="Try AbyssDeck"
  loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
  style="display:block;width:100%;height:min(900px,92svh);min-height:520px;border:0;border-radius:16px"
></iframe>
```

Relative module/asset URLs support nested website paths. The iframe's width
selects the real phone/tablet/desktop layout. Keep all assets beside the HTML;
copying only `index.html` will not work. Serve JavaScript with a JavaScript MIME
type and WASM with `application/wasm`. No website build step is required.

`allow-same-origin` is needed for the packaged module assets. This is a trusted
application bundle, not an opaque-origin security sandbox. The demo replaces
application local/session storage and editor draft storage with page-local memory;
it does not read an installed AbyssDeck session or create its IndexedDB database.
No service worker is registered. Source/license links open only when clicked.

## What works in the demo

- The original window, dock, panel and responsive controls.
- Six quick theme finishes in **Demo · Explore**, plus the actual appearance settings.
- Codex/GPT conversations with explicitly scripted local replies.
- File browsing, local text editing with the real editors, sample saves and downloads.
- Notes, tasks and plans backed by in-memory records.
- Image gallery, shared image viewer and public work-summary examples.
- Git diff/history and a simulated commit review/receipt.
- The real terminal surface with sample commands, and the real Remote controls
  driving a labelled simulated desktop.
- An English feature catalogue and help in the original help viewer.

There is no AI inference, GitHub account, remote machine, shared team or server
administration behind this page. Those entry points remain distinguishable from
the local examples; unsupported service operations explain that they require an
installed app. The feature catalogue describes the broader product. It is not a
claim that every server workflow is emulated or every binary format has a sample.
Reloading resets demo data. Do not enter real credentials.

## Build and check

Use the repository's pinned Node/pnpm versions and installed dependencies:

```sh
node demo/build.mjs
node demo/check.mjs
```

The check serves the built package at a nested path inside an iframe, exercises
core flows in Chromium/WebKit, and checks the six finishes at phone, tablet and
desktop widths. Screenshots/report are written under `.local/real-demo-check/`.
`node demo/build.mjs --serve` opens a local development server on port 19998.

Build isolation removes service-worker registration, substitutes editor draft
storage/help data, maps sample media to local blobs and embeds the actual fonts.
The runtime intercepts application API/socket operations before any network call.
Unimplemented mutations return a demo explanation; they never fall through to a
website or production backend. The build collects bundled dependency licenses and
notices into `site/THIRD_PARTY_NOTICES.txt`; retain those files when redistributing.
Application source and build recipes are in this AGPL-3.0-only repository.

## Previous design

The first independent demo is preserved in
[concepts/original/abyssdeck-demo.html](concepts/original/abyssdeck-demo.html), along
with its original sources. See [archive provenance](concepts/README.md). It is
kept for future interface ideas, rather than silently overwritten.

The old `demo/abyssdeck-demo.html` path now redirects to `site/index.html`; use the
whole `site` folder for new embeds.
