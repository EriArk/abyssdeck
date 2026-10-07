import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Artifacts } from "../apps/hub/dist/artifacts.js";
import { Previews } from "../apps/hub/dist/previews.js";
import { Store } from "../apps/hub/dist/store.js";

test("Gallery images exceed old per-file and bundle limits without inflating HTML; exact copies survive source changes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gallery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new Store(":memory:");
  t.after(() => store.close());
  const thread = store.createThread("p", "native", "Gallery");
  const project = join(root, "project"),
    exports = join(root, "outside-export");
  await mkdir(project);
  await mkdir(exports);
  let target = { machine: { type: "local-linux", id: "pc" }, root: project };
  const images = Array.from(
    { length: 70 },
    (_, i) => `<a href="${i}.png" target="_blank"><img src="${i}.png"></a>`,
  ).join("");
  const artifacts = new Artifacts(join(root, "artifacts"), store, 128 * 1024 ** 2);
  const previews = new Previews(
    join(root, "previews"),
    store,
    () => target,
    async () => Buffer.from(images),
    artifacts,
  );
  const [result] = previews.observe(thread, "turn", {
    id: "answer",
    type: "agentMessage",
    text: `[Gallery](${join(exports, "index.html")})`,
  });
  const id = store.resultById(thread.id, result).payload.url.split("/").at(-1);
  const html = await previews.document(id, true);
  assert(html.length < 50_000);
  assert.equal((html.match(/data-abyss-image=/g) ?? []).length, 140);
  assert(!html.includes(exports));
  assert(!html.includes('target="_blank"'));
  const manifest = JSON.parse(
    await readFile(join(root, "previews", id + ".interactive.json"), "utf8"),
  );
  assert.equal(Object.keys(manifest.paths).length, 70);
  // No eager transfer: even missing off-screen images cannot break the document.
  const data = Buffer.alloc(20 * 1024 ** 2, 17);
  const path = join(exports, "0.png"),
    key = createHash("sha256").update(path).digest("hex");
  await writeFile(path, data);
  const [one, two] = await Promise.all([previews.image(id, key), previews.image(id, key)]);
  assert.deepEqual(one, two);
  const artifact = artifacts.get(one.url.split("/").at(-1));
  assert.deepEqual(artifact.data, data);
  assert.equal(store.db.prepare("SELECT count(*) n FROM artifacts").get().n, 1);
  await writeFile(path, "changed");
  assert.deepEqual(await previews.image(id, key), one);
  assert.deepEqual(artifacts.get(one.url.split("/").at(-1)).data, data);
  await assert.rejects(previews.image(id, "f".repeat(64)), { code: "PREVIEW_IMAGE_NOT_FOUND" });
  target = { ...target, root: root };
  await assert.rejects(previews.image(id, key), { code: "PREVIEW_SOURCE_CHANGED" });
});
