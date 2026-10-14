# Background file uploads

## Lifetime and recovery

`ProjectFileUploadHost` lives next to the other authenticated-page working-window
hosts. All Files, edited-copy and archive-extraction launchers use one mounted
session per exact project/checkout. The session retains queued File handles and
operation identities when either the upload dialog or its parent window closes.
Opening another folder changes the destination of newly selected files only.

A started batch acquires its own file-tools grant and checks the returned checkout.
The Files window can relock/revoke its own grant without stopping that batch.
Long transfers renew their grant between requests; completion releases it. Existing
server authorization, root validation, quotas and conflict fingerprints still apply.
Explicit cancellation and private-session termination retain their abort behavior.

`online`, `pageshow` and visible-page recovery retry only transport-interrupted
uploads with retained File handles, using the same persisted upload ID/specification.
A wake arriving before the old request settles is deferred until it settles; it
does not create concurrent writers. Begin reconciles the server receipt; repeated
chunks verify saved bytes, and an already completed import is not repeated. This
does not authorize retries of chat submissions or unrelated mutations.

Metadata stays in account-scoped storage before effects. Binary file contents are
not persisted in browser storage. After full reload/browser termination, the
existing recovery UI checks receipts and requests the original file again when
remaining bytes are needed. Reselected prefix bytes must match the server's copy.

## iPhone boundary

Closing an AbyssDeck window is different from suspending Safari itself. WebKit
documents that iOS tabs are completely suspended when possible:
https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/

The page continues requests while the OS allows execution and reconciles after
return. It cannot guarantee uninterrupted device-to-Hub bytes while iOS suspends
or destroys the page. Already accepted server-side import can finish independently.
Apple's durable background upload mechanism is native background URLSession, not
an API available to this PWA:
https://developer.apple.com/forums/thread/685525

## Regression checks

`tests/project-file-upload.browser.mjs` covers Chromium/WebKit real fixture uploads,
closed upload and Files windows during chunks and commit, wake before a failed
request settles, grant renewal, exact bytes/operation ID, conflicts, lost completion
acknowledgement, reselected prefix integrity, cancellation, logout and retained chat
drafts. Archive extraction and edited-copy suites cover the other shared launchers.
These checks do not establish physical iPhone suspension behavior.
