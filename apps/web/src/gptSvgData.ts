export const svgTags = new Set([
  "svg",
  "g",
  "defs",
  "path",
  "rect",
  "line",
  "circle",
  "ellipse",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "use",
]);
// Presentation data only: no event handlers, scripts, external resources or foreignObject.
export const svgAttributes = new Set([
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "fillOpacity",
  "fillRule",
  "stroke",
  "strokeWidth",
  "strokeOpacity",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeDasharray",
  "strokeDashoffset",
  "opacity",
  "transform",
  "preserveAspectRatio",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "textAnchor",
  "dominantBaseline",
  "dx",
  "dy",
  "id",
  "href",
  "offset",
  "stopColor",
  "stopOpacity",
  "gradientUnits",
  "gradientTransform",
  "clipPath",
  "clipPathUnits",
  "mask",
  "maskUnits",
  "vectorEffect",
  "role",
  "aria-label",
]);
export function svgProps(attrs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attrs).flatMap(([name, value]) => {
      const key = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      const normalized = name === "aria-label" ? name : key;
      if (!svgAttributes.has(normalized)) return [];
      if (normalized === "href" && !/^#[A-Za-z_][\w:.-]*$/.test(value)) return [];
      if (/url\s*\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value)) return [];
      if (/javascript:|data:|https?:|[<>]/i.test(value)) return [];
      return [[normalized, value]];
    }),
  );
}
