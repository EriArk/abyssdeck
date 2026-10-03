export type Point = { x: number; y: number };
export type Mark = {
  tool: "pen" | "marker" | "arrow" | "rectangle" | "text";
  points: Point[];
  color: string;
  width: number;
  text?: string;
};
export type ImageEdits = {
  marks: Mark[];
  crop: { x: number; y: number; width: number; height: number };
  rotation: number;
};
export function animatedRaster(bytes: Uint8Array) {
  const tag = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (tag(0, 3) === "GIF") return true;
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (tag(1, 3) === "PNG") {
    for (let at = 8; at + 12 <= bytes.length; ) {
      if (tag(at + 4, 4) === "acTL") return true;
      const size = data.getUint32(at);
      if (size > bytes.length - at - 12) break;
      at += size + 12;
    }
  }
  if (tag(0, 4) === "RIFF" && tag(8, 4) === "WEBP") {
    for (let at = 12; at + 8 <= bytes.length; ) {
      if (tag(at, 4) === "ANIM" || tag(at, 4) === "ANMF") return true;
      const size = data.getUint32(at + 4, true);
      if (size > bytes.length - at - 8) break;
      at += 8 + size + (size % 2);
    }
  }
  return tag(4, 4) === "ftyp" && tag(8, Math.min(64, bytes.length - 8)).includes("avis");
}
export function imageTransform(edits: ImageEdits) {
  const c = edits.crop,
    r = edits.rotation;
  return `${r === 90 ? `translate(${c.height} 0)` : r === 180 ? `translate(${c.width} ${c.height})` : r === 270 ? `translate(0 ${c.width})` : ""} rotate(${r}) translate(${-c.x} ${-c.y})`;
}
export function imageSize(edits: ImageEdits) {
  return edits.rotation % 180
    ? { width: edits.crop.height, height: edits.crop.width }
    : { width: edits.crop.width, height: edits.crop.height };
}
export function markPath(mark: Mark) {
  const a = mark.points[0]!,
    b = mark.points.at(-1)!;
  if (mark.tool === "rectangle") return `M${a.x} ${a.y}H${b.x}V${b.y}H${a.x}Z`;
  let d = mark.points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  if (mark.tool === "arrow") {
    const angle = Math.atan2(b.y - a.y, b.x - a.x),
      length = Math.max(12, mark.width * 4);
    d = `M${a.x} ${a.y}L${b.x} ${b.y}`;
    for (const side of [-0.5, 0.5])
      d += `M${b.x} ${b.y}L${b.x - length * Math.cos(angle + side)} ${b.y - length * Math.sin(angle + side)}`;
  }
  // A tap is a real dot, not an invisible zero-length path.
  if (mark.points.length === 1) d += `l0.01 0`;
  return d;
}
export function renderImageCopy(base: HTMLImageElement, edits: ImageEdits, jpeg = false) {
  const size = imageSize(edits),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(size.width));
  canvas.height = Math.max(1, Math.round(size.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Не удалось подготовить изображение.");
  if (jpeg) {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const c = edits.crop;
  if (edits.rotation === 90) ctx.translate(c.height, 0);
  if (edits.rotation === 180) ctx.translate(c.width, c.height);
  if (edits.rotation === 270) ctx.translate(0, c.width);
  ctx.rotate((edits.rotation * Math.PI) / 180);
  ctx.translate(-c.x, -c.y);
  ctx.drawImage(base, 0, 0);
  for (const mark of edits.marks) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = mark.color;
    ctx.lineWidth = mark.width;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.globalAlpha = mark.tool === "marker" ? 0.35 : 1;
    if (mark.tool === "text") {
      ctx.font = `${Math.max(12, mark.width * 5)}px sans-serif`;
      ctx.fillText(mark.text || "", mark.points[0]!.x, mark.points[0]!.y);
    } else ctx.stroke(new Path2D(markPath(mark)));
    ctx.restore();
  }
  return canvas;
}
