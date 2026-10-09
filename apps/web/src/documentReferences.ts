import { api } from "./api";

export type DocumentFile = { url: string; name: string; mime?: string };
export type DocumentResolver = (href: string) => Promise<DocumentFile>;
export const documentImage = (href: string) =>
  /\.(png|jpe?g|webp|gif|svg|avif)(?:[?#].*)?$/i.test(href);
export const externalDocumentLink = (href: string) => /^https?:\/\//i.test(href);

/** One resolver/cache per mounted source. A filename never identifies another artifact. */
export function documentResolver(source?: string): DocumentResolver {
  const cache = new Map<string, Promise<DocumentFile>>();
  return (href) => {
    const old = cache.get(href);
    if (old) return old;
    const request = (async () => {
      if (externalDocumentLink(href)) {
        const url = new URL(href);
        if (url.username || url.password) throw Error("Недопустимый адрес ссылки.");
        return {
          url: url.href,
          name: decodeURIComponent(url.pathname.split("/").at(-1) || "Файл"),
        };
      }
      const artifact = source?.match(/^\/api\/artifacts\/([a-f0-9-]{36})$/i);
      if (artifact)
        return api<DocumentFile>(`/artifacts/${artifact[1]}/links`, {
          method: "POST",
          body: { href },
          timeoutMs: 180000,
        });
      const project = source?.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/files\/content\?([^#]+)$/);
      if (project) {
        const query = new URLSearchParams(project[2]);
        const parent = query.get("path");
        const value = decodeURIComponent(href.split(/[?#]/)[0]!);
        if (
          query.size !== 1 ||
          !parent ||
          !value ||
          /^[\\/]|^[a-z][a-z\d+.-]*:/i.test(value) ||
          [...value].some((c) => c.charCodeAt(0) < 32)
        )
          throw Error("Недопустимый путь ссылки.");
        const parts = parent.replaceAll("\\", "/").split("/").slice(0, -1);
        for (const part of value.replaceAll("\\", "/").split("/")) {
          if (part === "..") {
            if (!parts.length) throw Error("Ссылка вне проекта.");
            parts.pop();
          } else if (part && part !== ".") parts.push(part);
        }
        if (!parts.length) throw Error("Ссылка не указывает на файл.");
        return {
          name: parts.at(-1)!,
          url: `/api/projects/${project[1]}/files/content?path=${encodeURIComponent(parts.join("/"))}`,
        };
      }
      throw Error(
        "Для этой копии документа исходная папка недоступна. Открой документ из его проекта или сохранённых результатов.",
      );
    })();
    cache.set(href, request);
    void request.catch(() => cache.delete(href));
    return request;
  };
}
