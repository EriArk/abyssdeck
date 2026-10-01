# MybookOpds reader source

Copied from `D:/Projects/books/src/books_daemon/web` on 2026-10-01.

Pagination, DOM anchors, page index, system voice and finite-page audio playback retain the original algorithms.
Only module exports/default DOM arguments were adapted. PageVoice lookahead is one instead of three to fit the three-clip CodexWeb cache.
The React adapter owns lifecycle, private file chapters and scoped preferences. The speech adapter maps private speech clips to the book player protocol.
No library login, catalog, book-state writes or server credentials are imported.

`book-reader-index.test.mjs` and `book-reader-page-voice.test.mjs` retain the upstream
behavioral regression scenarios, including the finite-WAV iPhone end/pause cases.
The Hub provides page audio without word timings: the adapter reads PCM duration
and follows pages, never estimates word cues. System speech uses native boundaries.
FB2/EPUB currently import text and structure, not book illustrations or external resources.
PDF/DOCX are deliberately outside this reflow reader.

Upstream SHA-256:
- app.js: `e69967516de14fbd2f15a49aed1890e88a0a0c91bbbb887b3151741327f6ad02`
- voice-reader.js: `100b1ac088b3983fa466cc593ef3e3a35e5934005ed38d2ce0db1d51dbf164d0`
- page-voice.js: `afc9c10f419c37815e2c18f6b7e91e0b2131f3f135491e342077ac93dc216fe3`
- styles.css: `4115520979ca3d10b562a0f55a2b3ff0de404245edb7e5673282a553670a5fe3`
