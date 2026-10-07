# AbyssDeck interactive website demo

**[abyssdeck-demo.html](abyssdeck-demo.html)** is the distributable file. Copy it
into your website's own static files. It includes all CSS, icons, SVG illustrations,
fictional data and JavaScript. There are no CDN assets, API requests, external
fonts, analytics, service workers or server dependencies. It also opens directly
as a local file. All demo UI and examples are in English.

## Embed it in your site

For example, put the file at `public/demos/abyssdeck-demo.html` in the website
project. Use that site's own URL, not a separate demo server:

```html
<iframe
  src="/demos/abyssdeck-demo.html"
  title="Try AbyssDeck"
  loading="lazy"
  sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
  style="display:block;width:100%;height:820px;height:min(900px,92svh);min-height:520px;border:0;border-radius:16px"
></iframe>
```

Use `./demos/abyssdeck-demo.html` instead if the website lives under a subpath.
No special hosting, backend route, credentials or build step is required on the
website. The iframe adapts to its own width. A 390 px iframe gives the phone
layout; a wide iframe gives the desktop workspace.

The sandbox deliberately omits `allow-same-origin`: the demo works without access
to the parent site's storage or DOM. In that mode preferences last only for the
visit. Open the HTML as a separate page to retain demo theme/window geometry in
its own namespaced local storage. `allow-forms` enables local form submit events; the embedded CSP still blocks actual form navigation. Downloads require `allow-downloads`; explicit
license/source links use the popup permissions. Nothing is loaded from those links
until the visitor clicks them. There is no iframe messaging protocol to configure.

If your host adds a restrictive CSP, serve this file with a policy compatible with
its inline script/style. Its own CSP blocks network connections, remote assets,
form submissions and base-URL changes. Do not paste the file's markup into a CMS
that strips scripts: upload it as a static file and embed that file.

## What a visitor can try

The **Explore features** button opens a searchable map of 54 feature areas,
including less visible project, collaboration and maintenance workflows.

| Area | Demo coverage |
| --- | --- |
| Assistants | Codex/GPT examples, local send with explicitly scripted replies, attachment example, Work/Plan and effort selectors, history/pins, schedules, behavior profiles, conversation handoff, dictation transcript |
| Files/results | Folder browsing/search, new files/folders, local text import, rename, text/Markdown editing, retained drafts, original/downloaded copies, image gallery/markup/PNG export, editable CSV values, result selection/export, sharing review, public task summaries with nested work cards |
| Format inventory | Text/code, Markdown/books, PDF/DOCX, CSV/TSV/XLSX, images, ZIP, audio/video, DXF/CAD/3D; each explains its product capability and the demo's actual boundary |
| Git/delivery | Staging, example commit/history/branches, issue creation, PR review, delivery confirmation, engineering intake, issue drawer, activity |
| Organization | Project creation, Core, notes, tasks, plans/review, reports, quick capture, Prepare for Codex, search |
| Collaboration | Spaces, member roles/invitations, discussions, brainstorm ideas/voting, project consultations, Bridge coordination, checkout synchronization, separate workspace/GPT notifications |
| Devices | Machine/session selection, sample terminal commands, interactive illustrated desktop/browser/app preview, text paste, Computer Use receipt, Companion setup checklist, personal Linux readiness explanation |
| Settings | Six theme finishes, panels, usage/credits examples, connections, history/backups, updates, Doctor, account, users/access, searchable guide |
| Windows | Moving/resizing on wide layouts, minimize/restore dock, mounted drafts, phone-sized windows, panel dividers with pointer and keyboard input |

This is a **standalone product demonstration**, not a second production client or
a public instance of the Hub. It reuses the production theme materials and icon
paths, with its own small English presentation/state layer. The product's React
components, real editors, document/CAD parsers, media engines and native adapters
are not bundled. Text editing uses a textarea; binary-format pages are labeled
illustrations/inventory, not fake file processors. No real AI or remote computer
is available. Scripted operation receipts explicitly say what was simulated.

The personal Linux section records the independent-environment direction and its
remaining readiness boundary rather than presenting an unverified hosting service.
Likewise, the long-term global Assistant and clean-host guided installer are not
advertised as working features. See the actual product status and open issues for
installation/release availability.

Sample edits stay in memory and reset on reload. Only demo theme/geometry can be
persisted, under `abyssdeck-public-demo-v1:`. Reset removes only that namespace.
Local text imports are read in the visitor's browser and are never uploaded. The
demo caps these at 2 MB to stay lightweight; this is not a product transfer limit.

## Maintain the artifact

Edit `catalog.js`, `demo.js`, `demo.css` and `index.template.html`, then run:

```sh
node demo/build.mjs
```

The builder reads the project's current theme CSS and `icons.tsx`, then writes the
single HTML. Commit the source and rebuilt HTML together. It does not build or
change the production application. There are no new npm dependencies or Actions.

The focused optional browser check uses the existing Playwright installation:

```sh
node demo/check.mjs
```

It serves a disposable local iframe host, checks the feature map and representative
interactions in Chromium/WebKit, and writes screenshots/results to the ignored
`.local/public-demo-check/`. This is responsive browser evidence, not a claim of
physical iPhone/iPad testing or native-provider acceptance.

The demo and original inline illustrations use the repository's
[AGPL-3.0-only license](../LICENSE). The source link remains available through
About → License & source. Keep that link and applicable license information when
redistributing; this demo does not bundle third-party font or library binaries.
