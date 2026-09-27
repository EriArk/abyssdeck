# Commands, recent places and personal shortcuts — 2026-09-27

Implements the connected #221 / #223 / #177 stage on top of the completed runtime/entry stage. These are navigation actions, not a second assistant or shell command runner.

## Available behavior

- One touch entry above both clients’ project lists and the shared physical-key action registry. Ctrl/Command+K opens search; Ctrl/Command+Alt+G switches Codex/GPT by default. F1 uses the same registry and opens contextual help.
- Current-context actions reuse existing Home, Work, Discuss, new chat, Results, Files, Git, Notes, Tasks, content search, Remote and Settings callbacks. Availability follows the active client/project. Opening the palette sends no prompt or GitHub mutation.
- Bounded metadata providers search saved Codex/GPT projects and chats. Current project/client comes first; explicit broadening includes accessible Spaces, their Activity, Brainstorm and existing human conversations, plus the existing saved-content provider for messages/notes/tasks/plans. Files and GitHub are reachable via integrated actions; this release does not claim a filesystem/full-history/native-inactive-chat crawler or complete file/Results-name index.
- Arrow/Enter selection, Esc/Close, focus restoration, independent provider failures, aborted stale query results and keyboard-height/theme layouts. Workspace navigation shortcuts do not cross another open tool modal, and editors/Remote/terminal retain their keys.
- Recent/Pinned contains stable destinations only. Up to 32 recent and 16 pinned references persist in each actor’s private engine preferences; up to eight are displayed. Names are not persisted with these references: current authorized catalogs provide them. Opening a stored destination rechecks it; removed/archived sources are omitted. No native polling or read/unread mutation is performed by the private metadata provider. Shared catalogs retain their existing bounded page; an older shared destination outside that catalog can be absent until available through its ordinary navigation.
- Meaningful explicit visits update recents. Refresh/render/restored selection do not create synthetic visits. Collapse is device-local; references, pins and shortcuts are account-local server state. Existing material pins, library pins, shared state and unread counters are separate.
- Settings → Appearance → Keyboard shortcuts records physical codes, supports removal/reset and rejects duplicates/reserved browser/editor keys on both client and server. Unknown obsolete bindings fail closed with an explicit reset path. IME, repeats, AltGraph and non-primary/unmodified navigation are ignored. Capturing is cancelled when its settings section closes; hidden forms never trap keys. An OS-owned shortcut may be intercepted before JavaScript.
- Help’s current binding list uses the same action registry and preferences. Default examples are labelled as defaults.

## Data and compatibility

No schema change (29), Windows helper contract change, new credentials or native retry policy. Routes execute behind existing authentication/Origin protections in the actor’s engine. `PATCH /workspace/navigation` applies narrow atomic visits/pins/clear or validated shortcut replacement; it never accepts cached labels, scripts or arbitrary URLs. Requests use the existing private account API namespace. Frontend late callbacks retain the immutable page/account binding.

The Hub/UI release must be installed together. The previous verified persistent Companion remains installed side by side; there is no reason to replace or restart it for these changes. Existing native GPT isolation installation and uncertain receipts are unchanged.

## Focused evidence

- `tests/workspace-navigation.test.mjs`: policy normalization/reservation/collisions, authentication, two independent actor stores, bounded/deduplicated title-free state, saved old references, Unicode/literal metadata queries, archived/deleted filtering, no native writer/probes, obsolete overrides fail closed.
- `tests/workspace-navigation.browser.mjs`: real app/Hub fixture, command navigation to Home, draft/client switching, physical Russian-key event, ignored repeated/IME/remote keys, reserved/duplicate recording, override/reload persistence, pin/removal and sixteen themed phone/keyboard/tablet/desktop layouts. Chromium and WebKit runs are recorded with release evidence.
- Existing content-search and help-content checks; categorized settings in both engines; contextual help in WebKit. Actual rendered phone, keyboard and wide screenshots inspected. These are browser automation checks, not physical iPhone/iPad acceptance.

Next proposed stage: personal interface/text scale and message-to-message navigation (#175, remaining #186), Medium (`medium`), after owner continuation.
