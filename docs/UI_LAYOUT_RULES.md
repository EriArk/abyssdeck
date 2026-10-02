# Window and action layout

Owner correction, 3 October 2026: side panels extend the continuous workspace
body, rather than adding a second case or an unrelated recessed box. Animate
explicit wide-layout disclosure, never drag/keyboard/viewport sizing. Keep mounted
state and make collapsed controls inert only in the wide layout. Use a short grip
and local focus feedback instead of a full-height colored separator. Respect
reduced motion. Window motion must not distort saved geometry, replay input or
replace the owning window's dirty/terminal/close lifecycle.

Owner correction, 2 October 2026: working windows share `useWindowGeometry` through
an explicit stable tool key. Drag only the free heading area; resize from edges and
corners. Save committed geometry per account/browser, independently of panel widths.
Never save viewport clamps, cancellation, a heading tap, phone layout or expanded
viewer geometry over the preferred wide layout. Respect visualViewport bounds and
keep Close reachable. Keyboard heading arrows move, Shift+arrows resize, Home resets;
the southeast handle reverses move/resize via Alt. Escape during a drag cancels that
gesture; native dialog close/dirty/terminal lifecycle remains with the tool.
Compact confirmations, menus and drawers do not acquire desktop window controls.
File lists stay relatively narrow; names use single-line ellipsis and a full title,
while the preview receives the larger default pane. Container queries must handle
a narrow desktop window as well as a narrow screen. Viewer internals follow after Git.

Owner correction, 23 September 2026: Activity actions had accidental wrapping and unequal widths; the Intake launcher crowded its title and the mobile dialog was offset. These rules apply to subsequent interface work as well as these windows.

- **Give each row one purpose.** Activity has an exact-source action, a pair of assistant actions, then a separated reaction/discussion group. Use grid columns and consistent gaps, not inline buttons with individual margins. Align peer actions; short visible labels may have fuller accessible names.
- **Protect the heading.** Reserve the header for the title, compact context and stable icon controls. Give text `min-width: 0`; truncate a long project name with its full title available. Keep the close target at least 44×44 CSS pixels. Do not insert a large labeled tool button between the title and Close.
- **Size the whole window deliberately.** Account for native dialog max-width, box sizing, both horizontal insets, safe areas and the actual keyboard viewport. Phone dialogs need symmetric gutters. Keep the heading and composer reachable; scroll the content independently. Suppress a decorative focus outline on a programmatically focused dialog itself, retaining visible keyboard focus on its controls.
- **Use existing theme materials.** Keep semantic screen, casing, key and text tokens. No hard-coded substitute palette or separate theme implementation. Reactions are a quiet secondary group, not another row of competing primary actions.
- **Keep navigation reversible.** Nested inspection leaves its parent mounted. A source-specific Intake draft belongs to that notification/event, including its edited references and pending send receipt. It must not mix with the ordinary project draft or another incoming task.
- **Verify what a person sees.** Check phone, keyboard-constrained phone, compact tablet and wide tablet in all four themes. Include long titles, multiple action labels and active content. Test alignment, touch targets and overlap, then inspect screenshots; a window fitting inside the viewport is insufficient by itself.

Owner addition, 23 September: the file viewer is a universal file workspace, not a small attachment popup. Give it a large central viewport, a compact format toolbar, collapsible properties and a separate file-action rail. Use the shared window materials. Future conversion actions belong on that file-action rail; do not add disabled converter placeholders before the converter exists. Keep all formats in this common shell and preserve the parent context.

Brainstorm application, 24 September: protect the room heading with a two-line limit and a stable Close target. Put room presence/voice/settings on a compact context row, room tabs on one equal-width row, and board actions on another. Reuse `workspace-window.css` shell/screen/key tokens and `primary`/`secondary` controls; a new class name alone does not inherit all themed key styles. Keep desktop spatial cards readable as a single phone list, and leave board/chat mounted behind personal GPT and nested file/project windows.

Board organization: keep search/group controls behind one compact toolbar key; show filtered matches in a readable grid without overwriting spatial positions. Draw links around card edges and provide the same relationships as touchable exact-target references on phones. Put group/link editing in one collapsible section; the label supplies the checkbox's 44px touch target while the checkbox glyph stays compact.

Board gestures: position cards directly by their visible title/grip on tablet and desktop, never through X/Y inputs. A dedicated connection pin supports dragging a wire or selecting two cards. Input surfaces own their touch gesture before movement begins: use an HTML drawing surface, scoped `touch-action` and non-passive touch cancellation for Safari, primary-pointer tracking and capture. Do not disable scrolling on the entire board/editor; blank board and areas outside drawing remain scrollable. Preview locally and persist one exact-revision edit on drop/stroke completion. Cancellation restores a moved card without a write; interrupted drawing retains collected points. Keep the drop visible during acknowledgement and preserve card order after edits.

Project preparation: keep source selection, document editing, and final publication confirmation distinct. Use collapsible file/Issue sections, equal-width footer actions, and side-by-side old/new text on tablets with a vertical comparison on phones. Restore drafts only to their exact package/revision; nested GitHub inspection retains the preparation window. Center the window explicitly within visualViewport height, including software-keyboard constraints.

Communication: use one lower “Общение” shortcut with unread count in both clients; remove Reports from that row. Keep the Space chat header shortcut separate. On tablets use conversation list plus chat; on phones show the selected conversation with an explicit return control. Preserve drafts under nested viewers. The Result destination picker has a compact protected title, bounded searchable choices, explicit public-room audience acknowledgement and aligned footer actions.

Messenger follow-up: use quiet avatar/title/preview/time rows, separate Chats/People, one-tap personal conversations and explicit group creation. On phones the list gets the full content viewport until a conversation or group form is selected. Keep conversation settings out of the message area; preserve drafts during list/group/nested-view navigation. Message bubbles distinguish own/incoming sides with semantic theme surfaces, without invented presence indicators.

Communication reading (28 September): search temporarily uses the message area,
with its own scrolling results and a compact input/close row. Keep the composer
mounted and reachable at keyboard height. Exact jumps select one message with a
thin themed frame; they never mark the entire history read. Availability may show
only the coarse current foreground-web heartbeat, not invented activity or a
last-seen timeline. Group naming belongs in the existing settings window.

Results direct viewing (24 September): a file title and image thumbnail are the
primary open targets. Open the universal viewer immediately above the mounted
feed, retaining its category and scroll. Do not add an action-only detail screen,
a Preview tab, or a duplicate Preview button. Sharing/downloading stay together
as equal-width actions on the original card. Long filenames wrap without changing
peer control widths; keep keyboard-accessible open buttons and existing exact
source navigation from messages.

Results search (28 September): one magnifier belongs in the feed heading.
Keep query, two equal filter/sort controls, independently scrolling filename
rows and a compact count/refresh footer in one themed window. Opening a file
leaves that list mounted. File sequence and source navigation have their own
44px rail below the viewer heading; do not crowd the filename or Close. A
refreshed feed must not repeat a previous explicit focus scroll.

Codex schedules: one clock in the chat header opens a protected-title window.
Keep message, recurrence, timezone/date/time and equal-width footer actions in
explicit rows. The editor scrolls independently while Save and Close remain
reachable at keyboard height. Keep its draft separate from the normal composer;
management stays bound to the originating chat role without a Project picker.

Project profiles: put optional advanced settings behind one disclosure in
creation. Reuse one editor in Overview and Project GPT; show four primary
choices, with workflow/priorities and exact file preview in disclosures. Use
two aligned field columns on wide screens and one on phones. Protect the title
and Close control, keep comparison/apply actions in an equal-width footer and
retain the draft beneath nested windows. Selects need a visible theme-colored
arrow; removing native appearance must not remove their selection affordance.

Manual editing: all text viewers lead to the same CodeMirror workspace. Keep
Save As destination fields and download/project actions in explicit equal-width
rows. GitHub files use a protected title, branch row, independently scrolling
file body and separate review footer. Give workspace-specific modal geometry
higher specificity than generic theme/mobile dialog rules, including when loaded
from a lazy viewer. Restore nested recovery dialogs after the parent reaches the
native top layer, so the parent never covers their controls.

GitHub branch/PR editing: keep the destination choice and branch name in an
explicit two-column row (one column on phones). PR base, title and description
form a single aligned column; retain the protected heading, scrollable body and
fixed equal-width confirmation footer. Show only controls for the current step.
The resulting PR opens over the mounted review in the integrated viewer.

GitHub file management: group Edit/Rename/Delete in an explicit action grid;
Edit spans the phone row and the two management peers share the next row. Put
new-path fields in a separate inset form with equal-width Cancel/Continue keys.
Use short visible labels with full accessible names so phone button text never
spills into a neighbor. The common commit review lists every affected path and
keeps deletion/addition labels aligned; a rename is one reviewed operation.


## Multiline fields (24 September)

All product textareas use `AutoTextarea`: 4 visual lines initially, one-line growth
through 8, then inner scrolling. A hidden measuring twin preserves the live input's
selection and surrounding scroll. Controlled draft restores, hidden-to-visible
windows, responsive width and loaded fonts trigger remeasurement. CodeMirror is a
full document editor and keeps its workspace-sized viewport.

Activity/Notifications: review details live in a quiet expandable section of the
existing PR card, with a visible chevron and a 44px summary target. Use the same
source action to inspect the PR internally. Notifications have a compact GitHub
heading/refresh key and equal-width Open/Read actions. Preserve cached cards and
the last observed scroll position during refresh and parent-window transitions;
do not measure a scroller after its parent layout has already collapsed.

Archive/Office viewing: keep folder/sheet navigation, search and text scale in an
explicit toolbar grid. File rows have a stable icon/name/chevron layout; metadata
is secondary. Preserve the parent archive beneath a nested viewer. Render dense
spreadsheet grids in their own horizontal/vertical scroller and paginate long
content; never let cell widths stretch the surrounding dialog. Hide unused page
navigation for a single page. Keep format caveats in one quiet disclosure.

Contextual help: use a compact question-mark key in Settings/file headers and a
single shared dialog. Keep topic selection and the keyboard reference in two
explicit tabs, with a independently scrolling body and a fixed reachable Close.
Preserve the parent window, focus and draft. Modal geometry must override general
workspace-window theme/mobile rules. No automatic tours, banners or setup gates.

Folder merge review: show exact source/destination paths on each entry. Keep the
alternate-name form on its own row and equal-width Replace/Skip or Merge/Skip
choices beneath it. Keep progress and continuation within the existing operation
window, retain a fixed reachable footer/Close at keyboard height, and paginate
large plans instead of mounting thousands of cards. Cleanup describes empty-folder
removal; retained folders must not be displayed as deleted.

Full help: use a protected title/Close row and a compact catalog/keys/search toolbar.
The wide catalog and article scroll independently. Phone layouts show one at a
time with explicit catalog/back navigation. Categories expand into subcategories
and readable touch entries; section links and related articles remain inside the
same guide. Preserve the parent window and reading position. Opening the catalog
must not raise the software keyboard; search receives focus only when requested.


## Project entry and nested context (27 September)

Project Home presents existing state as Now, Next and Project. Work/Discuss are
paired primary actions; task analysis/Create Issue are paired secondary actions.
Show real pending/recent material; do not manufacture empty dashboard sections.
Advanced context/settings use a disclosure. Create-project starts from new work,
an existing folder, GitHub or an idea; infrastructure details remain available.

Use WindowScope/WindowHeading for related tools: short title, exact source context,
compact icon actions, an anchored Close and a Back when nested. Equal actions use
an explicit grid. Keep the source window mounted under material inspection; close
it only when the user actually navigates to a different workspace/chat/result.
Native dialog top-layer order must survive lazy editor loading and theme changes.

## Command navigation

Keep a single compact touch search entry above project navigation in both clients. Recent/Pinned uses quiet single-row destinations, equal 44px pin controls and a collapsible bounded area. The palette is a centered content-sized window with a capped scrolling results list, reachable Close, symmetric phone gutters and explicit keyboard-height geometry; it must not inherit the generic fullscreen-window offset while retaining a centering transform. Shortcut recording belongs to personal settings, never to each feature's separate keyboard listener. Hidden settings sections must release capture.


Personal scale: use the shared text/UI multipliers and semantic touch/spacing
primitives. Relative typography inherits once; never add page zoom or transforms.
Keep form text at least 16px and important targets at least 44px. Canvas/model/
Remote coordinates and terminal metrics remain owned by their respective viewer.
Message navigation is one compact three-key overlay within the reading viewport,
above the composer; preserve exact message identity and canonical paged history.

Owner correction, 27 September: message Previous/Next/End controls share the task-progress row on its right in Codex and GPT. Use compact 36px visible keys with 44px hit areas, no separate framed floating strip or reserved message-space gap. Truncate collapsed progress labels within the available width; expanded public details retain the full row width.

Chat reading controls (27 September): previous/next selects one public message with
an inset 1px themed outline; keep visible content stationary and reveal only the
nearest offscreen edge. Oversized visible answers do not jump. End clears the
selection and resumes following. Keep the loading ring in a reserved 18px slot
above the 44px attachment button in the left composer column in both clients.
Long embedded reference buttons are content: their labels must wrap, including
unbroken names, without widening the message or its scroller.

Chat status alignment (27 September): the progress panel and navigation keys have
the same 36px visible height and aligned top/bottom edges. Transparent vertical
hit extensions preserve 44px touch access for progress and stop controls.

Exact file launch: use a compact centered, content-height window with protected
filename and Close, one project/PC context line, wrapping relative path, and equal
action columns (one column on phone). Files and Remote open above the mounted
source. Do not stretch the launch confirmation into an empty full-height viewer.
