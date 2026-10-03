import { extractArchiveSelection } from "./archiveSelection";
import { readOffice } from "./officePackage";
import { archiveIndex, PACKAGE_LIMIT, readArchiveEntry } from "./packageArchive";

self.onmessage = async (
  event: MessageEvent<{ file: File; entry?: string; selection?: string[] }>,
) => {
  try {
    const { file, entry, selection } = event.data;
    if (file.size > PACKAGE_LIMIT) throw Error("Файл слишком велик для встроенного просмотра.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = file.name.split(".").at(-1)?.toLowerCase();
    if (selection) {
      const batch = extractArchiveSelection(bytes, selection);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const key =
        Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("") +
        JSON.stringify([...selection].sort());
      self.postMessage(
        { batch: { ...batch, key } },
        { transfer: [...batch.entries.map((item) => item.data.buffer), batch.bundle.buffer] },
      );
    } else if (entry !== undefined) {
      const found = archiveIndex(bytes).find((item) => item.name === entry);
      if (!found || found.directory) throw Error("Файл в архиве не найден.");
      const data = readArchiveEntry(bytes, found);
      self.postMessage({ entry: data }, { transfer: [data.buffer] });
    } else if (kind === "docx" || kind === "xlsx")
      self.postMessage({ office: readOffice(bytes, kind) });
    else self.postMessage({ entries: archiveIndex(bytes) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Не удалось прочитать файл.",
    });
  }
};
