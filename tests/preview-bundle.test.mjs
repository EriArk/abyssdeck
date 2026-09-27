import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bundlePreview } from "../apps/hub/dist/preview-bundle.js";
import { Previews } from "../apps/hub/dist/previews.js";
import { Store } from "../apps/hub/dist/store.js";
import { previewAssetPath, readMachinePreviewAsset } from "../packages/machines/dist/preview.js";

test("bundle captures recursive CSS/images/modules once, including cycles; never discovers secrets or external URLs", async () => {
  const files = {
    "demo/site.css": '@import "./colors.css";body{background:url(./tiny.svg)}',
    "demo/colors.css": '@import "site.css";button{color:rgb(0, 128, 0)}',
    "demo/tiny.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
    "demo/main.js": 'import {v} from "./dep.js";import("./dep.js");document.body.dataset.value=v;',
    "demo/dep.js": 'import "./main.js";export const v="exact";',
  };
  const seen = [];
  const output = await bundlePreview(
    '<link rel="stylesheet" href="site.css"><img src="tiny.svg"><img src="../.env"><img src="https://example.org/test.png"><script type="module" src="main.js"></script>',
    "demo/index.html",
    async (path) => {
      seen.push(path);
      assert(path in files, path);
      return Buffer.from(files[path]);
    },
  );
  assert.equal(new Set(seen).size, seen.length);
  assert.equal(seen.length, 5);
  assert.match(output, /data:text\/css;base64/);
  assert.match(output, /data:image\/svg\+xml;base64/);
  assert.match(output, /type="importmap"/);
  assert(!output.includes("preview.invalid"));
});

test("bounded bundle fails atomically; cached complete HTML retains old sidecar bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bundle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new Store(":memory:");
  t.after(() => store.close());
  const machine = { type: "local-linux" },
    thread = store.createThread("p", "native", "Demo"),
    previews = new Previews(join(root, "saved"), store, () => ({ machine, root }));
  const html = '<link rel="stylesheet" href="style.css"><button>Original</button>';
  await writeFile(join(root, "index.html"), html);
  const [result] = previews.observe(thread, "turn", {
    id: "a",
    type: "agentMessage",
    text: "[Demo](index.html)",
  });
  const id = store.resultById(thread.id, result).payload.url.split("/").pop();
  await assert.rejects(previews.document(id));
  await assert.rejects(readFile(join(root, "saved", id + ".html")));
  await writeFile(join(root, "style.css"), "button{color:green}");
  const captured = await previews.document(id);
  await writeFile(join(root, "style.css"), "button{color:red}");
  assert.equal(await previews.document(id), captured);
  await mkdir(join(root, "project"));
  await symlink(join(root, "style.css"), join(root, "project", "escape.css"));
  await assert.rejects(readMachinePreviewAsset(machine, join(root, "project"), "escape.css"));
  for (const path of ["../outside.js", ".git/a.js", ".env", "C:\\other\\a.js", "x.js:stream"])
    assert.throws(() => previewAssetPath({ type: "ssh-windows" }, "C:\\Project", path));
  const many = Array.from({ length: 65 }, (_, i) => `<img src="${i}.svg">`).join("");
  await assert.rejects(
    bundlePreview(many, "index.html", async () => Buffer.from("svg")),
    { code: "PREVIEW_BUNDLE_LIMIT" },
  );
});
