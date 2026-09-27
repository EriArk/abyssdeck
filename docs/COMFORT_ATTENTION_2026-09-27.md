# Personal scale, message navigation and directed GitHub attention

The owner requested three further stages together on High (`high`). This packet
implements #175, the remaining message navigation in #186, and the old assigned /
personally requested review gap from #205. It does not claim the entire original
Inbox issue or all historical GitHub events are complete.

## Personal appearance

Settings → Appearance exposes independent text (90–140%) and interface (90–120%)
presets with live application and Reset. Values use the existing private actor's
`/preferences` store; no installation-global singleton is introduced. The browser
keeps an account-local startup hint and refreshes from the server at login. Invalid
stored numbers clamp/fall back, invalid writes fail validation. A failed save
restores the preceding value and uses the existing inline error convention.

`scaleStyles.ts` is a small build-time PostCSS pass over app-owned CSS typography:
absolute font sizes use one shared text multiplier, relative sizes inherit once.
It does not transform the page or depend on browser zoom. Common chrome uses
separate density/touch tokens; targets retain a 44px minimum. Form text retains a
16px floor to avoid focus zoom on iOS. Remote geometry, terminal pixels and CAD /
drawing coordinates are not rescaled. Document format zoom still composes with
its inherited text size. AutoTextarea remeasures its existing four-to-eight-line
policy when scale changes. Drafts, selection and mounted workspaces remain intact;
readers away from the bottom retain their message anchor during reflow.

## Conversation navigation

One `MessageNavigation` component serves Codex, standalone GPT, Project GPT and
room GPT. A compact overlay above the composer moves to Previous / Next public
message or End. It uses stable message IDs, skips technical/commentary records,
and remembers an intentional target where browser scroll clamping would otherwise
make repeated taps oscillate. User scrolling releases that target. Empty chats do
not show a useless disabled toolbar.

Previous at the loaded boundary invokes the existing canonical pagination and
lands after the original scroll anchor is restored. Failure or branch replacement
does not guess a different message. End restores bottom following, including the
existing path back from a context/history fragment. Neither navigation nor scale
submits messages, changes model settings, takes a native writer or clears receipts.
Completion-position locking yields to an explicit navigation action.

## Directed GitHub attention

The installed fixed Windows GitHub probe augments recent Activity with separate
bounded reads: up to 20 open assigned Issues/PRs and 20 personally requested PR
reviews per repository. Unrelated recent traffic therefore does not determine
whether an older directed source can be found. Candidate PRs/Issues are fetched
again through fixed repository endpoints with at most two concurrent reads.
Numeric account identity and current open/draft/assignment/reviewer state decide
attention. Search results cannot supply arbitrary endpoints or repository scope.
Account and repository identity/access are rechecked after collection.

Stale search hits, removed assignments and closed PRs do not grant attention.
Local read marks retain their exact user/repository/source/version binding and
never write to GitHub. The bounded 200-object Hub index retains current directed
sources before older ambient activity, then displays chronology normally.
Existing recent-PR check/review budgets remain unchanged. Team review requests,
arbitrary older authored-PR checks and a complete GitHub archive remain outside
this packet. GitHub search can have indexing delay.

Endpoint semantics: [repository Issues and assignee filtering](https://docs.github.com/en/rest/issues/issues)
and [GitHub issue/PR search qualifiers](https://github.com/github/docs/blob/main/content/search-github/searching-on-github/searching-issues-and-pull-requests.md).

## Verification and delivery

- `personal-scale.test.mjs`: authentication, range/type/unknown-field rejection,
  separate private stores and preserving independent preferences.
- `comfort.browser.mjs`: real Hub/app fixture, public-message adjacency, skipped
  commentary, paged Codex/GPT navigation, text/control independence, min/max/reset,
  reload and draft continuity; themed phone, keyboard, tablet and wide screenshots.
- `github-work-probe.test.mjs`: old assignments and requested reviews outside
  recent windows, cross-repository search contamination, stale search results,
  changed numeric recipients, closed PRs and no native writes; existing exact-head
  checks and helper mutation protections stay covered.
- Existing Space Activity, help, settings and completion-position checks cover
  the affected integration. Build and heavy tests run on Linux.
- Windows `CodexWebDelivery` is updated only while Ready with no unanswered
  requests. Installed helper hash and backup are verified, then the actual
  Hub → SSH → Scheduled Task read is exercised. Private state/configuration and
  Companion/native conversations remain unchanged.

No schema change (29). Hub/UI use the ordinary guarded release path. Browser
WebKit/screenshots are not physical iPhone/iPad acceptance. Runtime evidence and
the exact installed/pending revision are recorded outside Git with the release.

Next proposed packet: remaining Result forwarding into Work/Intake and multi-file
HTML previews (#213), then the related resource lifetime cleanup. High (`high`),
after owner continuation, because exact immutable source grants and isolated
preview resources need to remain correct across recipients and nested viewers.
