import { z } from "zod";
const url = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      !/[\u0000-\u0020\u007f]/.test(value)
    );
  });
export const richReferenceSchema = z.object({
  key: z.string(),
  component: z.enum(["Cite", "AsyncImage", "Entity", "Link"]).optional(),
  status: z.enum(["pending", "resolved", "failed"]),
  sources: z
    .array(
      z.object({
        url,
        title: z.string().optional(),
        label: z.string().optional(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
  images: z
    .array(z.object({ src: url, sourceUrl: url.optional(), alt: z.string().optional() }))
    .optional(),
  url: url.optional(),
  maxWidth: z.string().optional(),
  aspectRatio: z.string().optional(),
});
export function gptRichReferences(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const result = richReferenceSchema.safeParse(item);
        return result.success ? [result.data] : [];
      })
    : [];
}

export function gptRichAnswers(raw: string, answer: string) {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return;
    const messages = value
      .filter(
        (m) =>
          m?.role === "assistant" &&
          m?.channel !== "commentary" &&
          typeof m.id === "string" &&
          typeof m.text === "string",
      )
      .map((m) => ({
        id: m.id,
        text: m.text,
        richReferences: gptRichReferences(m.richReferences),
      }));
    return messages.length && messages.map((m) => m.text).join("\n\n") === answer
      ? messages
      : undefined;
  } catch {
    return;
  }
}
