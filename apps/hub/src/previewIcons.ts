import { readFileSync } from "node:fs";

// The visualization host supplies Lucide even when the fragment has no script tag.
// Bundle the pinned package locally so saved demos need no CDN connection.
let runtime: string | undefined;
export function previewIcons(html: string) {
  if (!/data-lucide\s*=|\blucide\s*\./i.test(html)) return { before: "", after: "" };
  runtime ??= readFileSync(
    new URL(import.meta.resolve("lucide/dist/umd/lucide.min.js")),
    "utf8",
  ).replace(/<\/script/gi, "<\\/script");
  return {
    before: `<script>${runtime}</script>`,
    after: "<script>lucide.createIcons({attrs:{width:16,height:16}});</script>",
  };
}
