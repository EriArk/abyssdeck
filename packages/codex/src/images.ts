import { isNativeImageSource } from "@codex-web/shared";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const blocks = (value: unknown) => (Array.isArray(value) ? value.map(object) : []);

/** Public image outputs in App Server 0.162.1. Never inspect arguments, text JSON or reasoning. */
export function codexImageSources(item: Record<string, unknown>): string[] {
  const sources: unknown[] = [];
  switch (item.type) {
    case "imageView":
      sources.push(item.path);
      break;
    case "imageGeneration":
      // The native result is a PNG payload; prefer it to a mutable machine file.
      if (typeof item.result === "string" && item.result.startsWith("iVBORw0KGgo"))
        sources.push("data:image/png;base64," + item.result);
      else if (typeof item.result === "string" && item.result.startsWith("data:image/"))
        sources.push(item.result);
      else if (!item.failure) sources.push(item.savedPath);
      break;
    case "functionCallOutput":
      for (const block of blocks(item.output))
        if (block.type === "input_image") sources.push(block.image_url);
      break;
    case "dynamicToolCall":
      for (const block of blocks(item.contentItems))
        if (block.type === "inputImage") sources.push(block.imageUrl);
      break;
    case "mcpToolCall":
      for (const block of blocks(object(item.result).content)) {
        if (block.type === "image" && typeof block.data === "string")
          sources.push(`data:${block.mimeType};base64,${block.data}`);
        const resource = object(block.resource);
        if (block.type === "resource" && typeof resource.blob === "string")
          sources.push(`data:${resource.mimeType};base64,${resource.blob}`);
      }
      break;
    case "agentMessage":
      if (typeof item.text === "string")
        for (const match of item.text.matchAll(/!\[[^\]\n]*\]\((?:<([^>\n]+)>|([^\s)]+))\)/g))
          sources.push(match[1] || match[2]);
      break;
  }
  return [
    ...new Set(sources.filter((s): s is string => typeof s === "string" && isNativeImageSource(s))),
  ];
}
