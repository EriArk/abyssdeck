# Chat reading controls — 27 September 2026

Long GitHub reference titles became secondary buttons with a no-wrap label and
an intrinsic flex text width. These buttons widened the entire GPT conversation,
even when they were outside the visible message. The shared reference button now
wraps normally, including unbroken titles, and stays within its message in both
clients. This fixes the content width rather than hiding overflowing content.

Previous/next retains exact public message identity and selects one adjacent
message with a 1px themed inset outline. A fully visible message does not scroll.
An offscreen edge is revealed by the minimum required distance; a message taller
than the viewport stays still while partially visible. Manual scrolling resets
the selection anchor; End clears it and resumes following. Canonical older-page
loading, draft preservation and no-send navigation remain unchanged.

Both composers reserve a small left-column slot above the attachment plus for
the existing loading indicator. Send and text remain unobstructed. The shared
column styling also works when GPT is mounted independently. Help and permanent
layout/agent rules document the owner-requested behavior.

## Verification

Linux TypeScript and web production build. Chromium and WebKit exercise canonical
paging, exact adjacent selections, a single visible outline, stationary movement
between visible messages, End, streaming continuity, preserved drafts and compact
controls across phone, keyboard-constrained, tablet and wide layouts in all four
themes. Loading indicators are checked above the plus and left of the text.
Delayed GPT send/model/history fixtures retain send readiness, queue behavior,
account-local preferences and one exact send.

Wrapping regression covers GPT/Codex in 24 themed layouts per browser, including
long GitHub labels with and without spaces. A private read-only reproduction of
the reported chat also has scrollWidth equal to clientWidth at 390, 393, 430 and
820px in WebKit. Private history is not committed. Actual screenshots are inspected;
physical iPhone acceptance remains pending owner use.

## Separate old uncertain dispatch

One explicitly requested reconciliation of the old paused conversation returned
NATIVE_HISTORY_HEADERS_TIMEOUT. Its exact saved user message matches the receipt;
the private Hub snapshot contains two following public intermediate messages and
no final completion. The native receipt is still running, while Hub polling is
paused after the three-failure cap. This is insufficient evidence to mark the job
completed, cancelled or not sent. No send replay, receipt reset, native response
restart, automatic retry loop or maintenance bypass was performed. Other chats
remain independent. UI publication does not require restarting that native runtime.
