import assert from "node:assert/strict";
import test from "node:test";
import { pdfMatches, pdfText, readPdfText } from "../apps/web/src/pdfText.ts";

test("PDF search keeps original UTF-16 offsets, case, literal punctuation and line joins", () => {
  const text = "🙂 Начало\nСТРОКИ [a+b]. İ i";
  assert.deepEqual(pdfMatches(text, "начало строки [a+b].", 7), [{ page: 7, start: 3, end: 23 }]);
  assert.deepEqual(pdfMatches(text, "i", 7), [{ page: 7, start: 26, end: 27 }]);
  assert.equal(pdfMatches("a a a", "a", 1, 2).length, 2);
  assert.deepEqual(pdfMatches("anything", "  ", 1), []);
  assert.equal(
    pdfText({
      items: [
        { str: "first", hasEOL: true },
        { type: "beginMarkedContent" },
        { str: "second", hasEOL: false },
      ],
    }),
    "first\nsecond",
  );
});
test("PDF search abort cancels pending stream and never returns partial text as complete", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const sheet = {
    streamTextContent: () =>
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
  };
  const reading = readPdfText(sheet, controller.signal);
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancelled, true);
});
