import type { posix } from "node:path";
import { HubError } from "@codex-web/shared";
import remarkParse from "remark-parse";
import { unified } from "unified";

type MarkdownNode = { type: string; url?: string; identifier?: string; children?: MarkdownNode[] };

/** Actual Markdown links only: code, raw HTML and arbitrary browser paths grant nothing. */
export function documentLinks(text: string): string[] {
  const tree = unified().use(remarkParse).parse(text);
  const definitions = new Map<string, string>();
  const references: string[] = [];
  const links = new Set<string>();
  const walk = (node: MarkdownNode) => {
    if (
      node.type === "definition" &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    )
      definitions.set(node.identifier, node.url);
    if ((node.type === "link" || node.type === "image") && node.url) links.add(node.url);
    if ((node.type === "linkReference" || node.type === "imageReference") && node.identifier)
      references.push(node.identifier);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  for (const id of references) if (definitions.has(id)) links.add(definitions.get(id)!);
  return [...links];
}

export function documentRelativePath(
  paths: typeof posix,
  root: string,
  parent: string,
  href: string,
) {
  const fail = () =>
    new HubError(400, "DOCUMENT_LINK_PATH", "Ссылка не относится к файлам этого документа.");
  let value: string;
  try {
    value = decodeURIComponent(href.split(/[?#]/)[0]!);
  } catch {
    throw fail();
  }
  if (
    !value ||
    [...value].some((c) => c.charCodeAt(0) < 32) ||
    /^[a-z][a-z\d+.-]*:|^[\\/]/i.test(value)
  )
    throw fail();
  const within = (base: string, path: string) => {
    const rel = paths.relative(base, path);
    return !!rel && rel !== ".." && !rel.startsWith(".." + paths.sep) && !paths.isAbsolute(rel);
  };
  // Checkout documents can link to sibling directories. Explicit exports outside
  // the checkout retain their own directory; never substitute the current project.
  const base = within(root, parent) ? root : paths.dirname(parent);
  const path = paths.resolve(paths.dirname(parent), value);
  if (!within(base, path)) throw fail();
  return path;
}
