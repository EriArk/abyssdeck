import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { cellChange, detectDelimiter, parseDelimited } from "../apps/web/src/delimitedText.ts";
import { annotatePdf } from "../apps/web/src/pdfAnnotations.ts";

const { PDFDocument, PDFName, PDFHexString, degrees, StandardFonts } = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
)("pdf-lib");
test("CSV edits preserve BOM, untouched lexemes, CRLF, embedded newlines, quoted empties and precision", () => {
  const text =
    '\ufeffname;value;note\r\n"Лазарь";900719925474099312345;"line 1\r\nline 2"\r\n"";0001;"a""b"\r\n';
  assert.equal(detectDelimiter(text, "table.csv"), ";");
  const rows = parseDelimited(text, ";");
  assert.equal(rows.length, 3);
  assert.equal(rows[2].cells[2].value, 'a"b');
  const change = cellChange(rows[1].cells[0], "Имя; другое", ";");
  assert.equal(
    text.slice(0, change.from) + change.insert + text.slice(change.to),
    text.replace('"Лазарь"', '"Имя; другое"'),
  );
  assert.equal(rows[1].cells[2].value, "line 1\r\nline 2");
});
test("CSV parser handles empty/trailing fields, blank records and all newline styles without rewriting", () => {
  for (const ending of ["\n", "\r\n", "\r"]) {
    const rows = parseDelimited(`a,b,${ending}${ending}x,""`, ",");
    assert.deepEqual(
      rows.map((r) => r.cells.map((c) => c.value)),
      [["a", "b", ""], [""], ["x", ""]],
    );
  }
  assert.deepEqual(parseDelimited("", ","), []);
  assert.deepEqual(
    parseDelimited("a,", ",")[0].cells.map((c) => c.value),
    ["a", ""],
  );
  assert.equal(detectDelimiter("a\tb\n1\t2", "x.tsv"), "\t");
  assert.throws(() => parseDelimited('a,"unclosed', ","));
  assert.throws(() => parseDelimited('a,"done"oops', ","));
  assert.equal(cellChange({ from: 0, to: 2, quoted: false }, 'a"b\nc', ",").insert, '"a""b\nc"');
});
test("PDF export retains original pages, rotation, crop, text resources, existing annotations and Unicode comments", async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const rotation of [0, 90, 180, 270]) {
    const p = pdf.addPage([400, 300]);
    p.setRotation(degrees(rotation));
    p.setCropBox(20, 30, 340, 240);
    p.drawText("Original searchable text", { font, x: 40, y: 200 });
    p.node.addAnnot(
      pdf.context.register(
        pdf.context.obj({
          Type: "Annot",
          Subtype: "Text",
          Rect: [40, 40, 58, 58],
          Contents: PDFHexString.fromText("Existing note"),
        }),
      ),
    );
  }
  const bytes = await pdf.save(),
    original = Buffer.from(bytes),
    marks = [];
  for (let page = 1; page <= 4; page++)
    marks.push(
      {
        page,
        tool: "marker",
        points: [
          [40, 100],
          [180, 100],
        ],
        width: 10,
        color: "#ffcc00",
      },
      {
        page,
        tool: "comment",
        points: [
          [70, 160],
          [88, 142],
        ],
        width: 2,
        color: "#ffcc00",
        text: "Проверить 🙂\nстроку",
      },
    );
  const out = await annotatePdf(bytes.buffer, marks),
    copy = await PDFDocument.load(out);
  assert.deepEqual(Buffer.from(bytes), original);
  assert.equal(copy.getPageCount(), 4);
  for (let i = 0; i < 4; i++) {
    const p = copy.getPage(i);
    assert.equal(p.getRotation().angle, i * 90);
    assert.deepEqual(p.getCropBox(), { x: 20, y: 30, width: 340, height: 240 });
    assert.ok(p.node.Resources().get(PDFName.of("Font")));
    assert.equal(p.node.Annots().size(), 2);
    const annotation = copy.context.lookup(p.node.Annots().get(1));
    assert.equal(annotation.lookup(PDFName.of("Contents")).decodeText(), "Проверить 🙂\nстроку");
    assert.ok(p.node.Contents().size() >= 2);
    assert.equal(p.node.Resources().lookup(PDFName.of("XObject"))?.keys().length ?? 0, 0);
  }
});
