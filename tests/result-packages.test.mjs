import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Artifacts } from "../apps/hub/dist/artifacts.js";
import { unzipSync } from "../apps/hub/node_modules/fflate/esm/index.mjs";
import { communicationFixture } from "./communication-fixture.mjs";

test("Results packages preserve collisions and exact bytes; immutable receipts and private access", async (t) => {
  const f = await communicationFixture();
  t.after(f.close);
  const runtime = f.runtimes.get("owner"),
    sources = [],
    expected = [];
  for (let index = 0; index < 12; index++) {
    const bytes = Buffer.from(`file ${index}\r\nПривет\n`);
    expected.push(bytes);
    const artifact = new Artifacts(runtime.sessions.config.hub.resultsPath, runtime.store).putFile(
      runtime.thread.id,
      null,
      "source.md",
      `private/${index}.md`,
      "text/markdown",
      bytes,
    );
    const resultId = runtime.store.result(
      runtime.thread.id,
      null,
      "package-" + index,
      "file",
      "source.md",
      artifact,
    );
    sources.push({ client: "codex", threadId: runtime.thread.id, resultId });
  }
  const key = randomUUID(),
    input = { sources };
  const prepare = () => f.request(f.headers, "POST", "/api/team/result-packages", input, key);
  const [a, b] = await Promise.all([prepare(), prepare()]);
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(b.statusCode, 200, b.body);
  assert.deepEqual(a.json(), b.json());
  const url = `/api/team/result-snapshots/${a.json().id}/content`;
  const content = await f.request(f.headers, "GET", url);
  assert.equal(content.statusCode, 200, content.body);
  const files = unzipSync(content.rawPayload);
  assert.equal(Object.keys(files).length, 13);
  assert.deepEqual(Buffer.from(files["source.md"]), expected[0]);
  assert.deepEqual(Buffer.from(files["source (12).md"]), expected[11]);
  const manifest = JSON.parse(Buffer.from(files["sources.json"]).toString());
  assert.equal(manifest.length, 12);
  assert.deepEqual(
    manifest.map((file) => file.source),
    sources,
  );
  assert.equal((await f.request(f.friendHeaders, "GET", url)).statusCode, 404);
  assert.equal(
    (await f.request(f.friendHeaders, "POST", "/api/team/result-packages", input)).statusCode,
    404,
  );
  const again = await prepare();
  assert.deepEqual(again.json(), a.json());
  const changed = await f.request(
    f.headers,
    "POST",
    "/api/team/result-packages",
    { sources: sources.slice(1) },
    key,
  );
  assert.equal(changed.statusCode, 409);
});

test("Results packages reject unknown sources, duplicates and partial archives", async (t) => {
  const f = await communicationFixture();
  t.after(f.close);
  const r = f.runtimes.get("owner");
  const source = { client: "codex", threadId: r.thread.id, resultId: "missing" };
  for (const sources of [
    [source],
    [source, source],
    [{ ...source, client: "package" }],
    [{ ...source, path: "/private" }],
  ]) {
    const response = await f.request(f.headers, "POST", "/api/team/result-packages", { sources });
    assert(response.statusCode >= 400 && response.statusCode < 500, response.body);
  }
  assert.equal(
    f.hub.registry.db
      .prepare("SELECT count(*) n FROM team_receipts WHERE scope='result.package'")
      .get().n,
    0,
  );
});
