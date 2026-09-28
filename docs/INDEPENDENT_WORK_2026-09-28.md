# Independent work, Results search and backlog reconciliation

The owner's six-item pass completes related changes together. Installer/wizard
work and the previously paused GPT send are outside this pass.

## Behavior

- Linux terminal canonical, no-echo input to a child foreground process is a
  response, not another future shell command. The probe binds exact Bash PID/birth,
  reads flags without reading input, and validates activity revision before writing
  once. Socket closure discards pending input. Typeahead, background jobs and
  unknown activity still prevent maintenance. This fixes the reproduced accounting
  defect; it does not prove the cause of the owner's already closed old terminal.
- GitHub writer queues are per actor/repository. Projects for the same repository
  retain one lane; different repositories progress independently. Changed bindings,
  numeric identities, expected heads and uncertain receipts keep their guards.
  The installed PC worker already locks by repository; its contract is unchanged.
- Issue Drawer reserves exact package/items. Other drafts can be collected,
  edited, removed or reordered during preparation/publication. Slow completion
  preserves concurrent reordering. All active packages remain in the selector;
  approval and at-most-once publication remain separate.
- Results search offers individual selection and selection of loaded matches.
  Selection survives query/category/page changes and uses the existing immutable
  ZIP/share/download flow. Every match resolves an authorized Result identity;
  names and paths do not grant capture access. The existing 100-item package
  budget is unchanged. Nested sharing preserves selection and the parent draft.
- GPT canonical history hashes each full response. Identical HTTP 200 responses
  reuse the parsed graph and public projection even without ETag. Old edits and
  branch changes invalidate reuse. Upstream transfer remains a full GET; #188
  stays partial at that boundary.

## Verification

65 Linux checks cover terminal admission/accounting, a real Bash PTY with a
no-echo foreground child, independent repository writers, package receipts,
concurrent editing/reordering, and native history reuse/old edits. TypeScript Hub
and web pass. Results Chromium/WebKit checks cover exact source preparation,
selection, nested sharing, retained drafts, four themes and phone/keyboard/tablet
layouts. Screenshots are reviewed; physical iPhone acceptance remains separate.
Installed revisions and deployment evidence are tracked in CURRENT_STATUS and
private server verification files.

## Issue reconciliation

Closed on GitHub after reconciling the prior audit and installed follow-ups:
#149, #150, #151, #153, #154, #156, #160, #165, #169, #171, #172, #174, #175,
#177, #181, #186, #187, #191, #192, #193, #200, #201, #208, #210, #211, #212,
#214, #218, #221, #222, #223, #224, #225, #226, #227.

Evidence: [original audit](ISSUE_AUDIT_2026-09-26.md),
[project entry/runtime](PROJECT_ENTRY_RUNTIME_2026-09-27.md),
[navigation](WORKSPACE_NAVIGATION_2026-09-27.md),
[comfort](COMFORT_ATTENTION_2026-09-27.md), and
[project search](PROJECT_SEARCH_2026-09-28.md).
Closure does not claim physical-device or offline-member acceptance. Broader
trackers #10, #166, #170, #198, #228 and #229 retain their remaining scope.
#188 is not closed as a delta transport implementation. Historical stage
proposals are not the active queue.
