import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { archiveIndex, readArchiveEntry } from "../packageArchive";

export type ReadingDocument = {
  id: string;
  titles: string[];
  chapter(index: number): Promise<string>;
};
export const escapeText = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const elements = (node: ParentNode, name: string) =>
  Array.from(node.querySelectorAll("*")).filter((e) => e.localName === name);
function xml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("Документ содержит неподдерживаемое объявление XML.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw Error("Не удалось прочитать XML книги.");
  return doc;
}
function decode(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const encoding = new TextDecoder()
    .decode(bytes.subarray(0, 200))
    .match(/encoding=["']([^"']+)/i)?.[1];
  return new TextDecoder(encoding || "utf-8").decode(bytes);
}
// Rebuild document content, never execute imported markup, styles, URLs or book scripts.
function content(node: Node, fb2 = false): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent || "");
  if (!(node instanceof Element)) return "";
  const name = node.localName.toLowerCase();
  if (["script", "style", "iframe", "object", "svg", "binary", "form", "head"].includes(name))
    return "";
  if (name === "img" || name === "image")
    return node.getAttribute("alt") ? `<p>${escapeText(node.getAttribute("alt")!)}</p>` : "";
  const inner = Array.from(node.childNodes, (child) => content(child, fb2)).join("");
  const mapped: Record<string, string> = {
    title: "h2",
    subtitle: "h3",
    emphasis: "em",
    poem: "blockquote",
    stanza: "div",
    v: "p",
    "text-author": "p",
    "empty-line": "br",
  };
  const tag = (fb2 ? mapped[name] : undefined) || name;
  if (tag === "br" || tag === "hr") return `<${tag}>`;
  return /^(p|h[1-6]|blockquote|div|section|strong|b|em|i|u|s|sup|sub|ul|ol|li|pre|code|table|thead|tbody|tr|th|td)$/.test(
    tag,
  )
    ? `<${tag}>${inner}</${tag}>`
    : inner;
}
function groups(parts: string[], maximum = 24000) {
  const result: string[] = [];
  let current = "";
  for (const part of parts) {
    if (current && current.length + part.length > maximum) {
      result.push(current);
      current = "";
    }
    current += part;
  }
  if (current || !result.length) result.push(current);
  return result;
}
function htmlDocument(id: string, chapters: string[]): ReadingDocument {
  return {
    id,
    titles: chapters.map((html, i) => {
      const dom = new DOMParser().parseFromString(html, "text/html");
      return dom.querySelector("h1,h2,h3")?.textContent?.slice(0, 120) || `Раздел ${i + 1}`;
    }),
    chapter: async (index) => chapters[index] || "",
  };
}
export async function readingDocument(file: File): Promise<ReadingDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const format = file.name.match(/\.(md|markdown|fb2|epub)$/i)?.[1]?.toLowerCase() || "text";
  const id = `${format}:${digest}`;
  if (/\.epub$/i.test(file.name)) {
    const entries = archiveIndex(bytes),
      byName = new Map(entries.map((e) => [e.name, e]));
    let expanded = 0;
    const read = (name: string) => {
      const entry = byName.get(name);
      if (!entry) throw Error("В EPUB отсутствует часть книги.");
      expanded += entry.size;
      if (expanded > 64 * 1024 * 1024) throw Error("Книга слишком сложна для встроенного разбора.");
      return decode(readArchiveEntry(bytes, entry));
    };
    const container = xml(read("META-INF/container.xml"));
    const root = elements(container, "rootfile")[0]?.getAttribute("full-path");
    if (!root) throw Error("Не найдено оглавление EPUB.");
    const packageXml = xml(read(root));
    const paths = new Map(
      elements(packageXml, "item").map((e) => [e.getAttribute("id"), e.getAttribute("href")]),
    );
    const chapterPaths = elements(packageXml, "itemref").map((e) => {
      const href = paths.get(e.getAttribute("idref"));
      if (!href || /^[a-z]+:|^\/|\\/i.test(href)) throw Error("Некорректный путь EPUB.");
      const url = new URL(href, "https://book.invalid/" + root);
      if (url.origin !== "https://book.invalid") throw Error("Некорректный путь EPUB.");
      return decodeURIComponent(url.pathname.slice(1));
    });
    if (!chapterPaths.length) throw Error("В книге нет разделов.");
    const chapters = chapterPaths.flatMap((path) => {
      const doc = new DOMParser().parseFromString(read(path), "text/html");
      return groups(Array.from(doc.body.children, (child) => content(child)));
    });
    return htmlDocument(id, chapters);
  }
  const text = decode(bytes);
  if (text.includes("\0")) throw Error("Этот файл содержит двоичные данные.");
  if (/\.fb2$/i.test(file.name)) {
    const doc = xml(text),
      bodies = elements(doc, "body");
    if (!bodies.length) throw Error("В FB2 нет текста книги.");
    // Flatten section containers only; keep each paragraph/list/poem intact.
    const flatten = (element: Element): string[] =>
      element.localName === "section" || element.localName === "body"
        ? Array.from(element.children).flatMap(flatten)
        : [content(element, true)];
    return htmlDocument(id, groups(bodies.flatMap(flatten)));
  }
  if (/\.(md|markdown)$/i.test(file.name)) {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(text);
    const definitions = tree.children
      .filter((node) => node.type === "definition")
      .map((node) => text.slice(node.position!.start.offset, node.position!.end.offset))
      .join("\n");
    const sections = groups(
      tree.children
        .filter((node) => node.type !== "definition")
        .map((node) => text.slice(node.position!.start.offset, node.position!.end.offset) + "\n\n"),
    );
    return {
      id,
      titles: sections.map(
        (part, i) => part.match(/^#{1,6}\s+(.+)/m)?.[1]?.slice(0, 120) || `Раздел ${i + 1}`,
      ),
      chapter: async (index) =>
        renderToStaticMarkup(
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            disallowedElements={["img"]}
            components={{ a: ({ children }) => <span>{children}</span> }}
          >
            {sections[index] + "\n" + definitions}
          </ReactMarkdown>,
        ),
    };
  }
  return htmlDocument(
    id,
    groups(
      text.split(/(?<=\n)/).map((line) => `<div class="reader-plain">${escapeText(line)}</div>`),
    ),
  );
}
