/** Short-lived presentation metadata, shared by all viewers of one native client.
 * Canonical history and mutation admission never use this cache. */
export class NativeMetadataCache {
  private entries = new Map<string, { value: unknown; until: number; bytes: number }>();
  private firstPage = new Map<boolean, string>();
  generation = 0;
  constructor(private now = Date.now) {}
  ttl(input: Record<string, unknown>) {
    if (input.operation === "readCatalog") return Number(input.offset ?? 0) > 0 ? 120000 : 30000;
    return ["readPins", "readProjects"].includes(String(input.operation)) ? 30000 : 0;
  }
  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.until <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }
  clear() {
    this.generation++;
    this.entries.clear();
    this.firstPage.clear();
  }
  save(input: Record<string, unknown>, key: string, value: unknown, generation: number) {
    const ttl = this.ttl(input);
    if (!ttl || generation !== this.generation) return;
    const serialized = JSON.stringify(value);
    const bytes = serialized.length * 2;
    if (bytes > 4 * 1024 ** 2) return;
    if (input.operation === "readCatalog" && Number(input.offset ?? 0) === 0) {
      const archived = input.archived === true;
      const previous = this.firstPage.get(archived);
      if (previous !== undefined && previous !== serialized) {
        // Offset pages must be rebased after additions, deletions or reordering.
        // Detach in-flight pages too; they cannot repopulate the older prefix.
        this.generation++;
        this.entries.clear();
      }
      this.firstPage.set(archived, serialized);
    }
    this.entries.delete(key);
    this.entries.set(key, { value: structuredClone(value), until: this.now() + ttl, bytes });
    let total = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    for (const [id, entry] of this.entries) {
      if (this.entries.size <= 64 && total <= 4 * 1024 ** 2) break;
      this.entries.delete(id);
      total -= entry.bytes;
    }
  }
}
