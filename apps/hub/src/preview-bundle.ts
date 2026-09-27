import { HubError } from "@codex-web/shared";
import { parse as imports, init } from "es-module-lexer/minimal";
import { parse, parseFragment, serialize, type DefaultTreeAdapterTypes as Tree } from "parse5";
import postcss from "postcss";
import values from "postcss-value-parser";

// Automatic preview budgets, unrelated to original file upload/download limits.
export const PREVIEW_BUNDLE_BYTES = 16 * 1024 ** 2;
const origin = "https://preview.invalid/";
const mime: Record<string, string> = {
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};
const type = (path: string) => mime[path.split(".").pop()!.toLowerCase()];
const dataUrl = (type: string, bytes: Buffer | string) =>
  `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
const failure = () =>
  new HubError(
    413,
    "PREVIEW_BUNDLE_LIMIT",
    "Связанные файлы демо превышают бюджет просмотра. Оригиналы остаются доступны в файлах.",
  );

/** Freeze only explicitly referenced static assets, never a directory or an external URL.
 * Result is portable HTML: no Hub URL, account cookie or filesystem path escapes into it.
 */
export async function bundlePreview(
  html: string,
  entry: string,
  read: (path: string) => Promise<Buffer>,
) {
  const base = new URL(
    entry.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/"),
    origin,
  ).href;
  const bytes = new Map<string, Buffer>(),
    modules = new Map<string, string>(),
    moduleData: Record<string, string> = {};
  let total = Buffer.byteLength(html),
    packed = 0;
  const deadline = Date.now() + 30000;
  const resolve = (ref: string, from: string) => {
    if (!ref || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(ref)) return null;
    const url = new URL(ref, from);
    if (url.origin !== new URL(origin).origin) return null;
    const path = decodeURIComponent(url.pathname.slice(1));
    if (!type(path) || path.split(/[\\/]/).some((p) => p.startsWith("."))) return null;
    return { url: url.origin + url.pathname, fragment: url.hash, path };
  };
  const load = async (url: string) => {
    if (bytes.has(url)) return bytes.get(url)!;
    if (bytes.size >= 64 || Date.now() > deadline) throw failure();
    // Reserve before awaiting; traversal is sequential and bounded.
    bytes.set(url, Buffer.alloc(0));
    const value = await read(decodeURIComponent(new URL(url).pathname.slice(1)));
    total += value.length;
    if (total > PREVIEW_BUNDLE_BYTES || Date.now() > deadline) throw failure();
    bytes.set(url, value);
    return value;
  };
  const text = (b: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(b);
  const resource = async (ref: string, from: string, stack: string[] = []): Promise<string> => {
    const found = resolve(ref, from);
    if (!found) return ref;
    if (stack.includes(found.url) || stack.length >= 16) return "data:text/css,";
    const content = await load(found.url),
      media = type(found.path)!;
    const data =
      dataUrl(
        media,
        media === "text/css" ? await css(text(content), found.url, [...stack, found.url]) : content,
      ) + found.fragment;
    packed += data.length;
    if (packed > PREVIEW_BUNDLE_BYTES * 2) throw failure();
    return data;
  };
  const css = async (source: string, from: string, stack: string[] = []): Promise<string> => {
    const tree = postcss.parse(source),
      work: { value: string; set: (v: string) => void; importRule: boolean }[] = [];
    tree.walkDecls((d) => {
      work.push({
        value: d.value,
        set: (v) => {
          d.value = v;
        },
        importRule: false,
      });
    });
    tree.walkAtRules((r) => {
      work.push({
        value: r.params,
        set: (v) => {
          r.params = v;
        },
        importRule: r.name.toLowerCase() === "import",
      });
    });
    for (const item of work) {
      const parsed = values(item.value),
        refs: { value: string; set: (v: string) => void }[] = [];
      parsed.walk((node) => {
        if (node.type === "function" && node.value.toLowerCase() === "url") {
          const child = node.nodes[0];
          if (child && (child.type === "word" || child.type === "string"))
            refs.push({
              value: child.value,
              set: (v) => {
                node.nodes = [
                  { type: "string", quote: '"', value: v, sourceIndex: 0, sourceEndIndex: 0 },
                ];
              },
            });
          return false;
        }
      });
      const first = parsed.nodes.find((n) => n.type !== "space" && n.type !== "comment");
      if (item.importRule && first?.type === "string")
        refs.push({
          value: first.value,
          set: (v) => {
            first.value = v;
          },
        });
      for (const ref of refs) ref.set(await resource(ref.value, from, stack));
      item.set(parsed.toString());
    }
    return tree.toString();
  };
  await init();
  const js = async (source: string, from: string): Promise<string> => {
    const [refs] = imports(source);
    const edits: { s: number; e: number; value: string }[] = [];
    for (const ref of refs) {
      if (!ref.n || ref.d === -2) continue;
      // Bare packages and computed imports require a built application, not filesystem guessing.
      if (!ref.n.startsWith(".") && !ref.n.startsWith("/")) continue;
      const found = resolve(ref.n, from);
      if (!found || !/\.(m?js|json)$/i.test(found.path)) continue;
      let key = modules.get(found.url);
      if (!key) {
        key = "cw-preview-module-" + modules.size;
        modules.set(found.url, key);
        const content = await load(found.url);
        moduleData[key] = dataUrl(
          type(found.path)!,
          /\.json$/i.test(found.path) ? content : await js(text(content), found.url),
        );
      }
      edits.push({ s: ref.s, e: ref.e, value: ref.d >= 0 ? JSON.stringify(key) : key });
    }
    for (const edit of edits.sort((a, b) => b.s - a.s))
      source = source.slice(0, edit.s) + edit.value + source.slice(edit.e);
    return source;
  };
  const tree = parse(html);
  const visit = async (node: Tree.Node) => {
    if ("tagName" in node) {
      const attr = (name: string) => node.attrs.find((a) => a.name === name);
      const src = attr("src");
      if (
        node.tagName === "script" &&
        /^(?:|module|(?:text|application)\/(?:java|ecma)script)$/i.test(attr("type")?.value ?? "")
      ) {
        const found = src && resolve(src.value, base);
        if (found && /\.m?js$/i.test(found.path)) {
          src!.value = dataUrl("text/javascript", await js(text(await load(found.url)), found.url));
          node.attrs = node.attrs.filter((a) => a.name !== "integrity" && a.name !== "crossorigin");
        } else if (!src)
          for (const child of node.childNodes)
            if ("value" in child) child.value = await js(child.value, base);
      } else {
        for (const name of [
          "src",
          "poster",
          ...(node.tagName === "link" && /^(stylesheet|icon)$/i.test(attr("rel")?.value ?? "")
            ? ["href"]
            : []),
        ]) {
          const a = attr(name);
          if (a && node.tagName !== "iframe") a.value = await resource(a.value, base);
        }
        if (node.tagName === "link")
          node.attrs = node.attrs.filter((a) => a.name !== "integrity" && a.name !== "crossorigin");
      }
      // The frozen src is reliable on every viewport; original responsive alternatives cannot leak requests.
      if (attr("src")?.value.startsWith("data:"))
        node.attrs = node.attrs.filter((a) => a.name !== "srcset");
      const style = attr("style");
      if (style) style.value = (await css(`x{${style.value}}`, base)).slice(2, -1);
      if (node.tagName === "style")
        for (const child of node.childNodes)
          if ("value" in child) child.value = await css(child.value, base);
    }
    if ("childNodes" in node) for (const child of node.childNodes) await visit(child);
  };
  await visit(tree);
  // One import map handles shared dependencies and cycles without duplicating module evaluation.
  if (modules.size) {
    const root = tree.childNodes.find(
      (n): n is Tree.Element => "tagName" in n && n.tagName === "html",
    )!;
    const head = root.childNodes.find(
      (n): n is Tree.Element => "tagName" in n && n.tagName === "head",
    )!;
    const map = parseFragment(
      `<script type="importmap">${JSON.stringify({ imports: moduleData }).replace(/</g, "\\u003c")}</script>`,
    ).childNodes[0]!;
    map.parentNode = head;
    head.childNodes.unshift(map);
  }
  const output = serialize(tree);
  if (Buffer.byteLength(output) > PREVIEW_BUNDLE_BYTES * 2) throw failure();
  return output;
}
