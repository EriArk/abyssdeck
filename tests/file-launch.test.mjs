import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { fileLaunchFixture } from "./file-launch-fixture.mjs";

const { target } = createRequire(import.meta.url)("../ops/windows/FileLaunchWorker.cjs");
const call = (f, method, url, payload) =>
  f.app.inject({ method, url: "/api/file-launches" + url, payload, headers: f.headers });
const prepare = async (f) => {
  const r = await call(f, "POST", "/prepare", { source: f.source });
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
};
test("fixed Windows handlers reject traversal, ADS, links supplied as commands and batch expansion", () => {
  for (const [name, handler] of [
    ["dist/app.exe", "exe"],
    ["run.cmd", "cmd"],
    ["run.bat", "cmd"],
    ["run.ps1", "ps1"],
  ])
    assert.equal(target("C:/Project", name).handler, handler);
  for (const path of [
    "../other.exe",
    "C:/app.exe",
    "foo.exe:ads",
    "a//app.exe",
    "x./app.exe",
    "app.exe & whoami",
    "run%PATH%.cmd",
    "run!.bat",
    "readme.md",
    "./run.exe",
    "x\\run.exe",
  ])
    assert.throws(() => target("C:/Project", path));
  assert.throws(() => target("\\\\server/share", "run.exe"));
});
test("Result preparation never launches; explicit operation is exact-once across lost ack and reopen", async (t) => {
  const f = await fileLaunchFixture();
  t.after(() => f.close());
  const p = await prepare(f);
  assert.equal(p.path, "dist/Demo.exe");
  assert.equal(p.changed, false);
  assert.equal(p.unverified, false);
  assert.equal(f.launches.filter((x) => x.q.op === "start").length, 0);
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/file-launches/prepare",
        payload: { source: f.source },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await call(f, "PUT", "/" + randomUUID(), { preparedId: p.id, command: "evil" })).statusCode,
    400,
  );
  const id = randomUUID();
  f.lose();
  const r = await call(f, "PUT", "/" + id, { preparedId: p.id });
  assert.equal(r.statusCode, 202);
  assert.equal(r.json().state, "unknown");
  await call(f, "PUT", "/" + id, { preparedId: p.id });
  const checked = await call(f, "GET", "/" + id);
  assert.equal(checked.json().state, "running");
  assert.equal(checked.json().pid, 321);
  assert.equal(checked.json().code, undefined);
  assert.equal(f.launches.filter((x) => x.q.op === "start").length, 1);
  const p2 = await prepare(f);
  assert.equal((await call(f, "PUT", "/" + id, { preparedId: p2.id })).statusCode, 409);
  assert.equal(f.calls.filter((x) => x.method === "turn/start").length, 0);
  f.records.set(id, { id, state: "exited", pid: 321, exitCode: 7 });
  assert.equal((await call(f, "GET", "/" + id)).json().exitCode, 7);
});
test("changed/unproven/outside sources do not acquire launch authority; exact Files source can be prepared", async (t) => {
  const f = await fileLaunchFixture();
  t.after(() => f.close());
  for (const source of [
    "C:/Project/app.exe",
    "https://host/app.exe",
    "/api/projects/project/files/content?path=../app.exe",
    "/api/projects/project/files/content?path=run.exe&version=index",
    "/api/projects/another/files/content?path=Demo.exe",
  ])
    assert.notEqual((await call(f, "POST", "/prepare", { source })).statusCode, 200);
  f.store.db
    .prepare("UPDATE artifact_files SET sha256=? WHERE id=?")
    .run("0".repeat(64), f.artifactId);
  let p = await prepare(f);
  assert(p.changed);
  assert.equal((await call(f, "PUT", "/" + randomUUID(), { preparedId: p.id })).statusCode, 409);
  f.store.db.prepare("DELETE FROM artifact_source_bindings").run();
  p = await prepare(f);
  assert(p.unverified);
  f.store.db
    .prepare("UPDATE artifact_files SET sourcePath='C:/Other/Demo.exe' WHERE id=?")
    .run(f.artifactId);
  assert.equal((await call(f, "POST", "/prepare", { source: f.source })).statusCode, 409);
  const q = await call(f, "POST", "/prepare", {
    source: "/api/projects/project/files/content?path=dist%2FDemo.exe",
  });
  assert.equal(q.statusCode, 200);
  assert.equal(q.json().changed, false);
  assert.equal(q.json().unverified, false);
  assert.equal(f.launches.filter((x) => x.q.op === "start").length, 0);
});
test("in-flight repeated launches coalesce and changed authorization never permits a subsequent launch", async (t) => {
  const f = await fileLaunchFixture();
  t.after(() => f.close());
  const p = await prepare(f),
    id = randomUUID();
  f.hold();
  const a = call(f, "PUT", "/" + id, { preparedId: p.id });
  await new Promise((r) => setTimeout(r, 30));
  const b = call(f, "PUT", "/" + id, { preparedId: p.id });
  await new Promise((r) => setTimeout(r, 20));
  f.finish();
  await Promise.all([a, b]);
  assert.equal(f.launches.filter((x) => x.q.op === "start").length, 1);
  f.sessions.authorizeExecution = () => {
    throw Error("Access revoked");
  };
  assert.notEqual((await call(f, "PUT", "/" + randomUUID(), { preparedId: p.id })).statusCode, 202);
  assert.notEqual((await call(f, "GET", "/" + id)).statusCode, 200);
  assert.equal(f.launches.filter((x) => x.q.op === "start").length, 1);
});
test("preparations expire; source deletion and project binding changes block dispatch", async (t) => {
  const f = await fileLaunchFixture();
  t.after(() => f.close());
  const p = await prepare(f);
  const row = f.store.db.prepare("SELECT value FROM file_launch_preparations WHERE id=?").get(p.id),
    v = JSON.parse(row.value);
  v.expiresAt = 1;
  f.store.db
    .prepare("UPDATE file_launch_preparations SET value=? WHERE id=?")
    .run(JSON.stringify(v), p.id);
  assert.equal((await call(f, "PUT", "/" + randomUUID(), { preparedId: p.id })).statusCode, 409);
  const fresh = await prepare(f);
  f.store.db.prepare("DELETE FROM artifact_files WHERE id=?").run(f.artifactId);
  assert.equal(
    (await call(f, "PUT", "/" + randomUUID(), { preparedId: fresh.id })).statusCode,
    409,
  );
  assert.equal(f.launches.filter((x) => x.q.op === "start").length, 0);
});

test("private runtimes cannot borrow preparations or receipts; changed project binding blocks launch", async (t) => {
  const f = await fileLaunchFixture(),
    other = await fileLaunchFixture();
  t.after(() => f.close());
  t.after(() => other.close());
  const p = await prepare(f),
    id = randomUUID();
  assert.equal((await call(other, "PUT", "/" + id, { preparedId: p.id })).statusCode, 409);
  assert.equal(other.launches.length, 0);
  f.sessions.config.projects[0].workingDirectory = "C:/Another";
  assert.equal((await call(f, "PUT", "/" + id, { preparedId: p.id })).statusCode, 409);
  assert.equal(f.launches.filter((x) => x.q.op === "start").length, 0);
});
