import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { Store } from "../apps/hub/dist/store.js";
import { Artifacts } from "../apps/hub/dist/artifacts.js";
import { NativeImages } from "../apps/hub/dist/nativeImages.js";
import { unlinkedTurnWork } from "../apps/hub/dist/codex-results.js";
const sharp = createRequire(new URL("../apps/hub/package.json", import.meta.url))("sharp");

test("existing captured and failed files expose exact source paths in feeds, with thread isolation", (t) => {
  const root = mkdtempSync(join(tmpdir(), "result-source-")),
    store = new Store(":memory:");
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const a = store.createThread("p", "a", "A"),
    b = store.createThread("p", "b", "B");
  const files = new Artifacts(root, store);
  const path = "D:\\Projects\\пример\\file.txt";
  const file = files.putFile(a.id, "turn", "file.txt", path, "text/plain", Buffer.from("x"));
  const id = store.result(a.id, "turn", "file", "artifact", "file.txt", { url: file.url });
  assert.equal(store.resultById(a.id, id).payload.sourcePath, path);
  assert.equal(store.results(a.id).items[0].payload.sourcePath, path);
  assert.equal(store.projectResults("p").items[0].payload.sourcePath, path);
  const wrong = store.result(b.id, "turn", "wrong", "artifact", "file.txt", { url: file.url });
  assert.equal(store.resultById(b.id, wrong).payload.sourcePath, undefined);
  store.db
    .prepare("INSERT INTO artifact_captures VALUES(?,?,?,?,?,?,NULL)")
    .run("capture", a.id, "turn", "/home/user/report.pdf", "report.pdf", "failed");
  const failed = store.result(a.id, "turn", "failed", "artifact", "report.pdf", {
    captureId: "capture",
  });
  assert.equal(store.resultById(a.id, failed).payload.sourcePath, "/home/user/report.pdf");
  for (const sourcePath of [
    "data:image/png;base64,aaaa",
    "/api/artifacts/cache",
    "https://host/image.png",
    "file.txt",
  ]) {
    const bad = store.result(a.id, "turn", sourcePath, "image", "image.png", { sourcePath });
    assert.equal(store.resultById(a.id, bad).payload.sourcePath, undefined);
  }
});

test("image path survives capture and is restored on exact history registration; inline images invent no path", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "image-source-")),
    store = new Store(":memory:");
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const thread = store.createThread("p", "native", "Images");
  const images = new NativeImages({ hub: { resultsPath: join(root, "results") } }, store, () => ({
    type: "local-linux",
  }));
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const path = join(root, "picture.png");
  writeFileSync(path, bytes);
  const image = images.register(thread.id, "message", path);
  const id = store.result(thread.id, "turn", "image:" + image.id, "image", "picture.png", {
    url: image.url,
  });
  await images.get(image.id);
  assert.equal(store.resultById(thread.id, id).payload.sourcePath, path);
  assert.equal(unlinkedTurnWork(store.db, thread.id, "turn").items[0].payload.sourcePath, path);
  store.db.prepare("UPDATE native_images SET source='' WHERE id=?").run(image.id);
  assert.equal(store.resultById(thread.id, id).payload.sourcePath, undefined);
  assert.equal(images.register(thread.id, "message", path).id, image.id);
  assert.equal(store.resultById(thread.id, id).payload.sourcePath, path);
  const inline = images.register(
    thread.id,
    "inline",
    "data:image/png;base64," + bytes.toString("base64"),
  );
  const inlineId = store.result(thread.id, "turn", "image:" + inline.id, "image", "Image", {
    url: inline.url,
  });
  await images.get(inline.id);
  assert.equal(store.resultById(thread.id, inlineId).payload.sourcePath, undefined);
  assert.equal(
    store.db.prepare("SELECT source FROM native_images WHERE id=?").get(inline.id).source,
    "",
  );
});
