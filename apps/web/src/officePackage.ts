import { XMLParser, XMLValidator } from "fast-xml-parser";
import { archiveIndex, readArchiveEntry } from "./packageArchive";

type Xml = { name: string; attrs: Record<string, string>; children: Xml[]; value: string };
export type OfficeRun = { text: string; bold?: boolean; italic?: boolean };
export type OfficeBlock =
  | { kind: "paragraph"; runs: OfficeRun[]; heading?: boolean }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; media: number };
export type OfficePage = {
  name: string;
  path?: string;
  protected?: boolean;
  reserved?: string[];
  blocks: OfficeBlock[];
  rows?: {
    number: number;
    cells: { column: number; value: string; formula?: string; type?: string }[];
  }[];
  columns?: number;
};
export type OfficeDocument = {
  kind: "docx" | "xlsx";
  readOnlyReason?: string;
  pages: OfficePage[];
  media: { bytes: Uint8Array<ArrayBuffer>; type: string }[];
  truncated: boolean;
};
const named = (node: Xml, name: string) => node.children.filter((v) => v.name === name);
const first = (node: Xml, name: string) => named(node, name)[0];
function descendants(node: Xml, name: string): Xml[] {
  return node.children.flatMap((child) =>
    child.name === name ? [child] : descendants(child, name),
  );
}
function text(node?: Xml): string {
  return node ? node.value + node.children.map(text).join("") : "";
}
function spreadsheetText(value: string): string {
  return value.replace(/_x([0-9a-f]{4})_/gi, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}
function xml(bytes: Uint8Array): Xml {
  const input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(input) || bytes.length > 8 * 1024 * 1024)
    throw Error("XML документа не поддерживается.");
  let depth = 0,
    nodes = 0;
  for (const tag of input.matchAll(/<[^>]*>/g)) {
    if (++nodes > 150000) throw Error("Слишком сложный документ для просмотра.");
    if (tag[0].startsWith("</")) depth--;
    else if (!/^<[!?]/.test(tag[0]) && !tag[0].endsWith("/>")) depth++;
    if (depth > 80) throw Error("Слишком сложная структура документа.");
  }
  if (XMLValidator.validate(input) !== true) throw Error("Документ содержит повреждённый XML.");
  const raw = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
  }).parse(input) as Record<string, unknown>[];
  const convert = (items: Record<string, unknown>[]): Xml[] =>
    items.flatMap((item) => {
      const name = Object.keys(item).find((k) => k !== ":@");
      if (!name || name.startsWith("?")) return [];
      if (name === "#text") return [{ name, value: String(item[name]), attrs: {}, children: [] }];
      return [
        {
          name: name.split(":").at(-1)!,
          value: "",
          attrs: Object.fromEntries(
            Object.entries((item[":@"] ?? {}) as Record<string, string>).flatMap(([key, value]) => [
              [key, value],
              [key.split(":").at(-1)!, value],
            ]),
          ),
          children: convert(
            Array.isArray(item[name]) ? (item[name] as Record<string, unknown>[]) : [],
          ),
        },
      ];
    });
  return { name: "root", value: "", attrs: {}, children: convert(raw) };
}
function targetPath(part: string, target: string) {
  if (/[\\:?#]/.test(target) || [...target].some((c) => c.charCodeAt(0) < 32)) return "";
  const parts = target.startsWith("/") ? [] : part.split("/").slice(0, -1);
  for (const item of target.split("/")) {
    if (item === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else if (item && item !== ".") parts.push(item);
  }
  return parts.join("/");
}
export function readOffice(bytes: Uint8Array, kind: OfficeDocument["kind"]): OfficeDocument {
  const entries = archiveIndex(bytes),
    byName = new Map(entries.map((e) => [e.name, e]));
  const doc: OfficeDocument = { kind, pages: [], media: [], truncated: false };
  let expanded = 0,
    blockCount = 0,
    cellCount = 0;
  const get = (path: string, limit = 8 * 1024 * 1024) => {
    const entry = byName.get(path);
    if (!entry) throw Error("В документе отсутствует необходимая часть.");
    expanded += entry.size;
    if (expanded > 64 * 1024 * 1024)
      throw Error("Документ слишком велик для встроенного просмотра.");
    return readArchiveEntry(bytes, entry, limit);
  };
  const getXml = (path: string) => xml(get(path));
  const relationships = (part: string) => {
    const bits = part.split("/"),
      file = bits.pop(),
      relPath = [...bits, "_rels", file + ".rels"].join("/");
    const result = new Map<string, string>();
    if (byName.has(relPath))
      for (const rel of descendants(getXml(relPath), "Relationship")) {
        if (rel.attrs.TargetMode?.toLowerCase() === "external") continue;
        const path = targetPath(part, rel.attrs.Target ?? "");
        if (path) result.set(rel.attrs.Id ?? "", path);
      }
    return result;
  };
  const mediaIds = new Map<string, number>();
  const addImage = (path: string): OfficeBlock[] => {
    if (!path || !byName.has(path)) return [];
    let id = mediaIds.get(path);
    if (id === undefined) {
      if (doc.media.length >= 100) {
        doc.truncated = true;
        return [];
      }
      const content = get(path, 8 * 1024 * 1024);
      const type =
        content[0] === 137 && content[1] === 80 && content[2] === 78 && content[3] === 71
          ? "image/png"
          : content[0] === 255 && content[1] === 216 && content[2] === 255
            ? "image/jpeg"
            : "";
      if (!type) return [];
      id = doc.media.length;
      doc.media.push({ bytes: content, type });
      mediaIds.set(path, id);
    }
    return [{ kind: "image", media: id }];
  };
  const paragraph = (node: Xml): OfficeBlock => {
    const runs: OfficeRun[] = [];
    for (const run of descendants(node, "r")) {
      const props = first(run, "rPr");
      const enabled = (name: string) => {
        const v = props && first(props, name);
        return !!v && !["0", "false", "off"].includes(v.attrs.val ?? "1");
      };
      let value = "";
      for (const part of run.children) {
        if (part.name === "t") value += text(part);
        if (part.name === "tab") value += "\t";
        if (part.name === "br" || part.name === "cr") value += "\n";
      }
      if (value)
        runs.push({
          text: value,
          bold: enabled("b") || props?.attrs.b === "1",
          italic: enabled("i") || props?.attrs.i === "1",
        });
    }
    const style = first(node, "pPr"),
      heading = style && /^(heading|title)/i.test(first(style, "pStyle")?.attrs.val ?? "");
    return { kind: "paragraph", runs, heading: !!heading };
  };
  const blocks = (node: Xml, rels: Map<string, string>): OfficeBlock[] => {
    const result: OfficeBlock[] = [];
    const visit = (item: Xml) => {
      if (++blockCount > 15000) {
        doc.truncated = true;
        return;
      }
      if (item.name === "p") {
        result.push(paragraph(item));
        for (const img of descendants(item, "blip"))
          result.push(
            ...addImage(
              rels.get(
                Object.entries(img.attrs).find(([key]) => key.endsWith(":embed"))?.[1] ?? "",
              ) ?? "",
            ),
          );
      } else if (item.name === "tbl") {
        if (
          named(item, "tr").length > 100 ||
          named(item, "tr").some((row) => named(row, "tc").length > 50)
        )
          doc.truncated = true;
        const rows = named(item, "tr")
          .slice(0, 100)
          .map((row) =>
            named(row, "tc")
              .slice(0, 50)
              .map((cell) =>
                descendants(cell, "p")
                  .map((p) => descendants(p, "t").map(text).join(""))
                  .join("\n"),
              ),
          );
        result.push({ kind: "table", rows });
      } else if (item.name === "pic") {
        for (const img of descendants(item, "blip"))
          result.push(
            ...addImage(
              rels.get(
                Object.entries(img.attrs).find(([key]) => key.endsWith(":embed"))?.[1] ?? "",
              ) ?? "",
            ),
          );
      } else for (const child of item.children) visit(child);
    };
    visit(node);
    return result;
  };
  if (kind === "docx") {
    const part = "word/document.xml";
    doc.pages.push({ name: "Документ", blocks: blocks(getXml(part), relationships(part)) });
  } else {
    if (entries.some((e) => e.name.startsWith("_xmlsignatures/")))
      doc.readOnlyReason = "Подписанная книга доступна только для просмотра.";
    const part = "xl/workbook.xml",
      book = getXml(part),
      rels = relationships(part);
    const shared = byName.has("xl/sharedStrings.xml")
      ? descendants(getXml("xl/sharedStrings.xml"), "si")
      : [];
    const sheets = descendants(book, "sheet");
    if (sheets.length > 100) doc.truncated = true;
    for (const sheet of sheets.slice(0, 100)) {
      const path = rels.get(
        Object.entries(sheet.attrs).find(([key]) => key.endsWith(":id"))?.[1] ?? "",
      );
      if (!path) throw Error("Ссылка на лист повреждена.");
      const page: OfficePage = {
        name: sheet.attrs.name ?? "Лист",
        path,
        blocks: [],
        rows: [],
        columns: 0,
      };
      const sheetXml = getXml(path);
      page.protected = descendants(sheetXml, "sheetProtection").length > 0;
      page.reserved = [
        ...descendants(sheetXml, "mergeCell").map((c) => c.attrs.ref ?? ""),
        ...descendants(sheetXml, "f").map((c) => c.attrs.ref ?? ""),
      ].filter(Boolean);
      const sheetRels = relationships(path);
      for (const table of descendants(sheetXml, "tablePart")) {
        const target = sheetRels.get(table.attrs["r:id"] ?? table.attrs.id ?? "");
        if (target)
          page.reserved.push(...descendants(getXml(target), "table").map((t) => t.attrs.ref ?? ""));
      }
      for (const row of descendants(sheetXml, "row")) {
        const cells: NonNullable<OfficePage["rows"]>[number]["cells"] = [];
        if (page.rows!.length >= 5000 || cellCount >= 50000) {
          doc.truncated = true;
          break;
        }
        for (const cell of named(row, "c")) {
          if (++cellCount > 50000) {
            doc.truncated = true;
            break;
          }
          const ref = cell.attrs.r?.match(/^([A-Z]{1,3})([1-9][0-9]{0,6})$/);
          const column = ref
            ? [...ref[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
            : cells.length + 1;
          if (column > 256) {
            doc.truncated = true;
            continue;
          }
          let value = text(first(cell, "v"));
          const sharedNode = cell.attrs.t === "s" ? shared[Number(value)] : undefined;
          if (cell.attrs.t === "s")
            value = spreadsheetText(
              sharedNode ? descendants(sharedNode, "t").map(text).join("") : "",
            );
          if (cell.attrs.t === "inlineStr")
            value = spreadsheetText(descendants(cell, "t").map(text).join(""));
          if (cell.attrs.t === "b") value = value === "1" ? "TRUE" : "FALSE";
          const formula = first(cell, "f");
          if (
            cell.attrs.cm ||
            cell.attrs.vm ||
            descendants(cell, "r").length ||
            (sharedNode && descendants(sharedNode, "r").length)
          )
            page.reserved.push(cell.attrs.r ?? "");
          cells.push({
            column,
            value,
            formula: formula ? text(formula) : undefined,
            type: cell.attrs.t ?? "n",
          });
          page.columns = Math.max(page.columns ?? 0, column);
        }
        page.rows!.push({ number: Number(row.attrs.r) || page.rows!.length + 1, cells });
      }
      doc.pages.push(page);
    }
  }
  if (!doc.pages.length) throw Error("Документ не содержит доступных страниц.");
  return doc;
}
