import { LineCapStyle, PDFDocument, PDFHexString, rgb } from "pdf-lib";

export type PdfMark = {
  page: number;
  tool: "pen" | "marker" | "comment";
  points: [number, number][];
  color: string;
  width: number;
  text?: string;
};
export async function annotatePdf(
  bytes: ArrayBuffer,
  marks: PdfMark[],
): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  for (const mark of marks) {
    const page = pdf.getPages()[mark.page - 1];
    if (!page || !mark.points.length) throw Error("Некорректная страница разметки.");
    const colors = [1, 3, 5].map((i) => parseInt(mark.color.slice(i, i + 2), 16) / 255);
    if (mark.tool === "comment") {
      const [x, y] = mark.points[0]!;
      const [x2, y2] = mark.points[1] || [x + 18, y - 18];
      // A native Text annotation retains full Unicode comments in other PDF readers.
      // Explicit appearance also makes the note visible in canvas-only viewers.
      const appearance = pdf.context.flateStream(
        `${colors.join(" ")} rg 0 0 18 18 re f 0 0 0 RG 1 w 3 5 m 15 5 l 3 9 m 15 9 l 3 13 m 12 13 l S`,
        {
          Type: "XObject",
          Subtype: "Form",
          BBox: [0, 0, 18, 18],
          Resources: {},
        },
      );
      const ref = pdf.context.register(
        pdf.context.obj({
          Type: "Annot",
          Subtype: "Text",
          Rect: [Math.min(x, x2), Math.min(y, y2), Math.max(x, x2), Math.max(y, y2)],
          P: page.ref,
          Contents: PDFHexString.fromText(mark.text || ""),
          Name: "Comment",
          C: colors,
          F: 4,
          AP: { N: pdf.context.register(appearance) },
        }),
      );
      page.node.addAnnot(ref);
    } else {
      const points: [number, number][] =
        mark.points.length === 1
          ? [...mark.points, [mark.points[0]![0] + 0.01, mark.points[0]![1]]]
          : mark.points;
      page.drawSvgPath(points.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${-y}`).join(" "), {
        x: 0,
        y: 0,
        borderColor: rgb(colors[0]!, colors[1]!, colors[2]!),
        borderWidth: mark.width,
        borderOpacity: mark.tool === "marker" ? 0.35 : 1,
        borderLineCap: LineCapStyle.Round,
      });
    }
  }
  // Never flatten forms or rasterize original pages. Saving produces a separate copy.
  return new Uint8Array(await pdf.save({ updateFieldAppearances: false }));
}
