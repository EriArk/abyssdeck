import { zipSync } from "fflate";
import { type OfficeDocument, type OfficePage, readOffice } from "./officePackage";
import { archiveIndex, readArchiveEntry } from "./packageArchive";

export type CellEdit = {
  sheet: number;
  ref: string;
  value: string;
  type: "text" | "number" | "boolean" | "blank";
};
export function columnName(n: number): string {
  return n > 0
    ? columnName(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26))
    : "";
}
export function coordinate(ref: string): [number, number] | null {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(ref.toUpperCase());
  if (!match) return null;
  const col = [...match[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0),
    row = Number(match[2]);
  return col <= 16384 && row <= 1048576 ? [col, row] : null;
}
export function range(ref: string): [number, number, number, number] | null {
  const pieces = ref.toUpperCase().split(":");
  if (pieces.length > 2) return null;
  const a = coordinate(pieces[0]!),
    b = coordinate(pieces[1] ?? pieces[0]!);
  return a && b
    ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
    : null;
}
export function cellAt(page: OfficePage, ref: string) {
  const point = coordinate(ref);
  return (
    point && page.rows?.find((r) => r.number === point[1])?.cells.find((c) => c.column === point[0])
  );
}
export function editReason(page: OfficePage, ref: string): string {
  const point = coordinate(ref);
  if (!point || !page.rows?.some((r) => r.number === point[1]) || point[0] > (page.columns ?? 0))
    return "Выбери ячейку в показанной области листа.";
  if (page.protected) return "Лист защищён. Доступны просмотр и копирование.";
  if (cellAt(page, ref)?.formula !== undefined)
    return "Формула доступна для просмотра; правка формул пока не поддерживается.";
  for (const area of page.reserved ?? []) {
    const box = range(area);
    if (box && point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3])
      return "Эта область содержит объединение, формулы, структурированную таблицу или специальное оформление. Доступен просмотр.";
  }
  return "";
}
export function validateEdit(edit: CellEdit) {
  if (
    !coordinate(edit.ref) ||
    !Number.isInteger(edit.sheet) ||
    edit.sheet < 0 ||
    typeof edit.value !== "string"
  )
    throw Error("Некорректная ячейка.");
  if (!["text", "number", "boolean", "blank"].includes(edit.type))
    throw Error("Некорректный тип ячейки.");
  if (
    edit.value.length > 32767 ||
    [...edit.value].some((c) => {
      const n = c.codePointAt(0)!;
      return (
        (n < 32 && ![9, 10, 13].includes(n)) ||
        n === 65534 ||
        n === 65535 ||
        (n >= 0xd800 && n <= 0xdfff)
      );
    })
  )
    throw Error("Значение не поддерживается форматом XLSX.");
  if (
    edit.type === "number" &&
    (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(edit.value) ||
      !Number.isFinite(Number(edit.value)))
  )
    throw Error("Введи число с точкой в качестве десятичного разделителя.");
  if (edit.type === "boolean" && !/^(true|false|0|1)$/i.test(edit.value))
    throw Error("Логическое значение: TRUE, FALSE, 1 или 0.");
}
export function visibleValue(edit: CellEdit) {
  return edit.type === "blank"
    ? ""
    : edit.type === "boolean" && /^(true|1)$/i.test(edit.value)
      ? "TRUE"
      : edit.type === "boolean" && /^(false|0)$/i.test(edit.value)
        ? "FALSE"
        : edit.value;
}
export function editedValues(edits: CellEdit[]) {
  return new Map(edits.map((e) => [`${e.sheet}:${e.ref}`, e]));
}
export function copyRange(page: OfficePage, sheet: number, ref: string, edits: CellEdit[]): string {
  const box = range(ref);
  if (!box || (box[2] - box[0] + 1) * (box[3] - box[1] + 1) > 50000)
    throw Error("Выбери диапазон до 50 000 ячеек.");
  if (
    box[2] > (page.columns ?? 0) ||
    box[3] > Math.max(0, ...(page.rows ?? []).map((r) => r.number))
  )
    throw Error("Диапазон выходит за прочитанную область листа.");
  const values = editedValues(edits),
    rows = new Map(page.rows?.map((r) => [r.number, new Map(r.cells.map((c) => [c.column, c]))]));
  return Array.from({ length: box[3] - box[1] + 1 }, (_, i) =>
    Array.from({ length: box[2] - box[0] + 1 }, (_, j) => {
      const r = box[1] + i,
        c = box[0] + j,
        edit = values.get(`${sheet}:${columnName(c)}${r}`);
      const value = edit ? visibleValue(edit) : (rows.get(r)?.get(c)?.value ?? "");
      return /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    }).join("\t"),
  ).join("\r\n");
}
function parse(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || bytes.length > 8 * 1024 * 1024)
    throw Error("XML книги не поддерживается.");
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw Error("XML книги повреждён.");
  return xml;
}
const children = (node: Element, name: string) =>
  [...node.children].filter((c) => c.localName === name && c.namespaceURI === node.namespaceURI);
const all = (doc: Document, name: string) => [
  ...doc.getElementsByTagNameNS(doc.documentElement.namespaceURI, name),
];
function element(parent: Element, name: string) {
  return parent.ownerDocument.createElementNS(
    parent.namespaceURI,
    parent.prefix ? `${parent.prefix}:${name}` : name,
  );
}
const encode = (xml: Document) =>
  new TextEncoder().encode(new XMLSerializer().serializeToString(xml));

/** Rewrites only edited worksheet parts and calculation flags. Other OPC parts retain exact bytes. */
export function exportWorkbook(
  bytes: Uint8Array,
  edits: CellEdit[],
  doc?: OfficeDocument,
): Uint8Array<ArrayBuffer> {
  if (!edits.length) return new Uint8Array(bytes);
  const original = doc ?? readOffice(bytes, "xlsx"),
    entries = archiveIndex(bytes);
  if (original.truncated) throw Error("Книга показана частично. Правка требует полного чтения.");
  if (original.readOnlyReason) throw Error(original.readOnlyReason);
  if (entries.some((e) => e.name.startsWith("_xmlsignatures/")))
    throw Error("Подписанная книга доступна только для просмотра.");
  if (entries.reduce((n, e) => n + e.size, 0) > 64 * 1024 * 1024)
    throw Error("Книга слишком велика для встроенной записи.");
  const parts: Record<string, Uint8Array> = Object.create(null);
  for (const entry of entries) parts[entry.name] = readArchiveEntry(bytes, entry);
  const worksheets = new Map<string, Document>();
  for (const edit of editedValues(edits).values()) {
    validateEdit(edit);
    const page = original.pages[edit.sheet];
    if (!page?.path) throw Error("Лист не найден.");
    const reason = editReason(page, edit.ref);
    if (reason) throw Error(reason);
    let xml = worksheets.get(page.path);
    if (!xml) {
      xml = parse(parts[page.path]!);
      worksheets.set(page.path, xml);
    }
    const point = coordinate(edit.ref)!;
    const row = all(xml, "row").find((r) => Number(r.getAttribute("r")) === point[1]);
    if (!row) throw Error("Строка не найдена.");
    let cell = children(row, "c").find((c) => c.getAttribute("r") === edit.ref);
    if (!cell) {
      cell = element(row, "c");
      cell.setAttribute("r", edit.ref);
      row.insertBefore(
        cell,
        children(row, "c").find(
          (c) => (coordinate(c.getAttribute("r") ?? "")?.[0] ?? 0) > point[0],
        ) ?? null,
      );
    }
    if (children(cell, "f").length || cell.hasAttribute("cm") || cell.hasAttribute("vm"))
      throw Error("Ячейка содержит формулу или специальные метаданные.");
    for (const child of [...children(cell, "v"), ...children(cell, "is")]) child.remove();
    cell.removeAttribute("t");
    if (edit.type === "text") {
      cell.setAttribute("t", "inlineStr");
      const inline = element(cell, "is"),
        text = element(cell, "t");
      text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
      // SpreadsheetML escapes literal _xNNNN_ sequences; never interpret user text as a formula.
      text.textContent = edit.value
        .replace(/_x[0-9a-f]{4}_/gi, (v) => `_x005F_${v.slice(1)}`)
        .replaceAll("\r", "_x000D_");
      inline.append(text);
      cell.insertBefore(inline, cell.firstChild);
    } else if (edit.type !== "blank") {
      if (edit.type === "boolean") cell.setAttribute("t", "b");
      const value = element(cell, "v");
      value.textContent =
        edit.type === "boolean" ? (/^(true|1)$/i.test(edit.value) ? "1" : "0") : edit.value;
      cell.insertBefore(value, cell.firstChild);
    }
  }
  for (const [path, xml] of worksheets) parts[path] = encode(xml);
  const book = parse(parts["xl/workbook.xml"]!),
    root = book.documentElement;
  let calc = all(book, "calcPr")[0];
  if (!calc) {
    calc = element(root, "calcPr");
    root.insertBefore(
      calc,
      [...root.children].find((e) =>
        [
          "oleSize",
          "customWorkbookViews",
          "pivotCaches",
          "smartTagPr",
          "smartTagTypes",
          "webPublishing",
          "fileRecoveryPr",
          "webPublishObjects",
          "extLst",
        ].includes(e.localName),
      ) ?? null,
    );
  }
  calc.setAttribute("fullCalcOnLoad", "1");
  calc.setAttribute("forceFullCalc", "1");
  parts["xl/workbook.xml"] = encode(book);
  return new Uint8Array(zipSync(parts, { level: 6 }));
}
