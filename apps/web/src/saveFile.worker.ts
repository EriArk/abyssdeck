// Preparation uses browser storage, not an array containing the entire download.
// Sync access handles run in a worker and support Safari versions before createWritable.
type SyncFile = {
  write(data: Uint8Array, options: { at: number }): number;
  flush(): void;
  close(): void;
};
type WritableFile = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<SyncFile>;
};
const controller = new AbortController();
let release: (() => void) | undefined;
let started = false;
const entry = crypto.randomUUID();
const lockName = (name: string) => `abyssdeck-save:${name}`;
self.onmessage = (event: MessageEvent<{ source?: string; cancel?: boolean }>) => {
  if (event.data.cancel) {
    controller.abort();
    release?.();
    return;
  }
  if (started || !event.data.source) return;
  started = true;
  const source = event.data.source;
  if (navigator.locks) void navigator.locks.request(lockName(entry), () => prepare(source));
  else void prepare(source);
};
async function prepare(source: string) {
  let directory: FileSystemDirectoryHandle | undefined;
  let output: SyncFile | undefined;
  try {
    if (!navigator.storage?.getDirectory) throw Error("STORAGE_UNAVAILABLE");
    const root = await navigator.storage.getDirectory();
    directory = await root.getDirectoryHandle("abyssdeck-save-temporary", { create: true });
    // A tab crash can leave a temporary file. Active saves in other tabs keep their
    // browser-owned lock, so cleanup never removes another mounted share's bytes.
    if (navigator.locks) {
      const entries = directory as FileSystemDirectoryHandle & {
        keys(): AsyncIterable<string>;
      };
      for await (const name of entries.keys()) {
        if (!/^[a-f0-9-]{36}$/.test(name)) continue;
        await navigator.locks.request(lockName(name), { ifAvailable: true }, async (lock) => {
          if (lock) await directory?.removeEntry(name).catch(() => {});
        });
      }
    }
    const handle = (await directory.getFileHandle(entry, { create: true })) as WritableFile;
    output = await handle.createSyncAccessHandle();
    controller.signal.throwIfAborted();
    const response = await fetch(source, {
      credentials: "same-origin",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw Error(`HTTP_${response.status}`);
    const reader = response.body.getReader();
    const total = Number(response.headers.get("content-length")) || 0;
    let received = 0;
    let lastProgress = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        controller.signal.throwIfAborted();
        let offset = 0;
        while (offset < part.value.length) {
          const written = output.write(part.value.subarray(offset), { at: received });
          if (!written) throw Error("STORAGE_WRITE_FAILED");
          received += written;
          offset += written;
        }
        if (performance.now() - lastProgress > 200) {
          self.postMessage({ progress: { received, total } });
          lastProgress = performance.now();
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    output.flush();
    output.close();
    output = undefined;
    controller.signal.throwIfAborted();
    const file = await handle.getFile();
    controller.signal.throwIfAborted();
    self.postMessage({
      file,
      type: response.headers.get("content-type")?.split(";")[0],
      disposition: response.headers.get("content-disposition"),
    });
    // Keep the backing file until its save window (or system share) releases it.
    await new Promise<void>((resolve) => {
      release = resolve;
      if (controller.signal.aborted) resolve();
    });
  } catch (error) {
    if (!controller.signal.aborted)
      self.postMessage({ error: error instanceof Error ? error.message : "SAVE_FAILED" });
  } finally {
    output?.close();
    await directory?.removeEntry(entry).catch(() => {});
    self.postMessage({ released: true });
    self.close();
  }
}

export {};
