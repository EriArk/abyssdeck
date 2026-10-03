import { Zip, ZipPassThrough } from "fflate";
import { archiveIndex, PACKAGE_LIMIT, readArchiveEntry } from "./packageArchive";

export const ARCHIVE_BATCH_FILES = 32; // Same bounded queue as ordinary project uploads.
export function extractArchiveSelection(bytes: Uint8Array, names: string[]) {
  if (!names.length || names.length > ARCHIVE_BATCH_FILES || new Set(names).size !== names.length)
    throw Error("Выбери от 1 до 32 файлов для одной операции.");
  const index = archiveIndex(bytes);
  const selected = names.map((name) => {
    const entry = index.find((item) => item.name === name);
    if (!entry || entry.directory) throw Error("Выбранный файл в архиве не найден.");
    if (entry.blocked) throw Error(entry.blocked);
    return entry;
  });
  if (selected.reduce((sum, entry) => sum + entry.size, 0) > PACKAGE_LIMIT)
    throw Error(
      "Выбранные файлы превышают бюджет распаковки 32 МБ. Выбери меньше файлов; оригинал доступен для скачивания.",
    );
  const entries = selected.map((entry) => ({
    path: entry.name,
    data: readArchiveEntry(bytes, entry),
  }));
  // The streaming writer keeps names as values, including literal "__proto__".
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, data) => {
    if (error) throw error;
    chunks.push(data);
  });
  for (const entry of entries) {
    const member = new ZipPassThrough(entry.path);
    zip.add(member);
    member.push(entry.data, true);
  }
  zip.end();
  const bundle = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bundle.set(chunk, offset);
    offset += chunk.length;
  }
  return { entries, bundle };
}
