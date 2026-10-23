import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { Artifacts } from "../apps/hub/dist/artifacts.js";
import { Store } from "../apps/hub/dist/store.js";
import { storageReport } from "../apps/hub/dist/storage.js";
import { configSchema } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";
import { createSnapshot, verifySnapshot, restoreSnapshot } from "../apps/hub/dist/maintenance.js";

const sharp = createRequire(new URL("../apps/hub/package.json", import.meta.url))("sharp");
const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } })
  .png()
  .toBuffer();
function fixture(t, budget = 20) {
  const root = mkdtempSync(join(tmpdir(), "artifact-expiry-"));
  const store = new Store(join(root, "app.db"));
  const config = configSchema.parse({
    hub: {
      publicBaseUrl: "https://quota.test",
      resultsPath: join(root, "results"),
      databasePath: join(root, "app.db"),
      storage: { artifactBytes: budget, artifactRetention: "oldest" },
    },
    auth: {},
    machines: [],
    projects: [],
  });
  const files = new Artifacts(config.hub.resultsPath, store, budget, "oldest");
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const thread = () => store.createThread("p", String(Math.random()), "Fixture");
  const put = (id, value = "abcdefghij") =>
    files.putFile(id, null, "file.zip", "/source/file.zip", "application/zip", Buffer.from(value));
  return { root: config.hub.resultsPath, base: root, store, files, config, thread, put };
}

test("quota retires oldest result bytes across threads, preserving exact metadata/history and uploads", async (t) => {
  const f = fixture(t),
    a = f.thread(),
    b = f.thread(),
    writer = f.thread();
  const first = f.put(a.id),
    second = f.put(b.id);
  f.store.db
    .prepare("UPDATE artifacts SET createdAt='2000-01-01' WHERE id=?")
    .run(first.artifactId);
  f.store.append(a.id, "user.message", { id: "request", text: "Keep conversation" });
  f.store.result(a.id, null, "old-file", "file", "file.zip", { artifactId: first.artifactId });
  const uploaded = join(f.root, "upload.bin");
  writeFileSync(uploaded, "user upload");
  const newest = f.put(writer.id);
  assert.equal(f.store.db.prepare("SELECT sum(bytes) n FROM artifacts").get().n, 20);
  assert.equal(existsSync(join(f.root, first.artifactId + ".bin")), false);
  assert.throws(() => f.files.get(first.artifactId), { code: "ARTIFACT_EXPIRED", statusCode: 410 });
  assert.equal(f.files.get(second.artifactId).data.toString(), "abcdefghij");
  assert.equal(f.files.get(newest.artifactId).data.toString(), "abcdefghij");
  assert.equal(f.store.history(a.id).messages[0].text, "Keep conversation");
  assert.equal(
    f.store.db.prepare("SELECT count(*) n FROM results WHERE threadId=?").get(a.id).n,
    1,
  );
  assert.equal(readFileSync(uploaded, "utf8"), "user upload");
  assert.equal((await storageReport(f.config, f.store.db)).missingFiles, 0);
});

test("active, uncertain, current-thread and frozen-review files are protected; impossible writes delete nothing", (t) => {
  const f = fixture(t, 40),
    active = f.thread(),
    uncertain = f.thread(),
    review = f.thread(),
    current = f.thread();
  const values = [active, uncertain, review, current].map((row) => f.put(row.id));
  f.store.db
    .prepare("UPDATE threads SET status='running',activeTurnId='turn' WHERE id=?")
    .run(active.id);
  f.store.db.prepare("UPDATE threads SET status='unknown' WHERE id=?").run(uncertain.id);
  f.store.db
    .prepare("INSERT INTO work_reviews VALUES('r','p',?,NULL,'accepted',1,?,1)")
    .run(review.id, JSON.stringify({ artifactId: values[2].artifactId }));
  assert.throws(() => f.put(current.id), { code: "ARTIFACT_STORAGE_FULL" });
  for (const value of values) assert.equal(f.files.get(value.artifactId).data.length, 10);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM artifact_expiry").get().n, 0);
});

test("failed staged transfer never deletes old files; verified stream uses same retention", async (t) => {
  const f = fixture(t, 10),
    old = f.put(f.thread().id),
    writer = f.thread();
  const transfer = async (path) => {
    writeFileSync(path, "1234567890");
    return { bytes: 10, sha256: createHash("sha256").update("1234567890").digest("hex") };
  };
  await assert.rejects(
    f.files.putStream(writer.id, null, "new.zip", "/new.zip", "application/zip", async (path) => {
      await transfer(path);
      throw Error("network loss");
    }),
    /network loss/,
  );
  assert.equal(f.files.get(old.artifactId).data.length, 10);
  const next = await f.files.putStream(
    writer.id,
    null,
    "new.zip",
    "/new.zip",
    "application/zip",
    transfer,
  );
  assert.throws(() => f.files.get(old.artifactId), { code: "ARTIFACT_EXPIRED" });
  assert.equal(f.files.get(next.artifactId).data.toString(), "1234567890");
});

test("retirement resumes after unlink interruption and stays expired after restart", (t) => {
  const f = fixture(t, 10),
    old = f.put(f.thread().id);
  f.store.db
    .prepare("INSERT INTO artifact_expiry VALUES(?,10,'pending','2000-01-01')")
    .run(old.artifactId);
  unlinkSync(join(f.root, old.artifactId + ".bin"));
  const restarted = new Artifacts(f.root, f.store, 10, "oldest");
  const next = restarted.putFile(
    f.thread().id,
    null,
    "next",
    "/next",
    "text/plain",
    Buffer.from("abcdefghij"),
  );
  assert.equal(
    f.store.db.prepare("SELECT state FROM artifact_expiry WHERE id=?").get(old.artifactId).state,
    "removed",
  );
  assert.throws(() => restarted.describe(old.artifactId), { code: "ARTIFACT_EXPIRED" });
  assert.equal(restarted.get(next.artifactId).data.length, 10);
});

test("default keep policy still refuses quota without deleting", (t) => {
  const f = fixture(t, 10),
    old = f.put(f.thread().id);
  const conservative = new Artifacts(f.root, f.store, 10);
  assert.throws(
    () =>
      conservative.putFile(f.thread().id, null, "next", "/next", "text/plain", Buffer.from("x")),
    { code: "ARTIFACT_STORAGE_FULL" },
  );
  assert.equal(f.files.get(old.artifactId).data.length, 10);
});

test("retirement never unlinks inside a caller transaction that could roll back its receipt", (t) => {
  const f = fixture(t, 10),
    old = f.put(f.thread().id),
    writer = f.thread();
  f.store.db.exec("BEGIN IMMEDIATE");
  try {
    assert.throws(() => f.put(writer.id), { code: "STORAGE_TRANSACTION_BUSY" });
  } finally {
    f.store.db.exec("ROLLBACK");
  }
  assert.equal(f.files.get(old.artifactId).data.length, 10);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM artifact_expiry").get().n, 0);
});

test("backup and restore retain expiry receipts without requiring intentionally removed bytes", async (t) => {
  const f = fixture(t, 10),
    old = f.put(f.thread().id),
    current = f.put(f.thread().id);
  const snapshot = await createSnapshot(f.config, join(f.base, "backups"));
  await verifySnapshot(snapshot);
  const destination = join(f.base, "restored");
  await restoreSnapshot(snapshot, destination);
  const store = new Store(join(destination, "app.db"));
  try {
    const files = new Artifacts(join(destination, "results"), store, 10, "oldest");
    assert.throws(() => files.get(old.artifactId), { code: "ARTIFACT_EXPIRED" });
    assert.equal(files.get(current.artifactId).data.length, 10);
  } finally {
    store.close();
  }
});

test("native preview and authenticated HTTP status report expiry without recapture or native work", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  const old = f.store.createThread("project", "old-native", "Old");
  const images = f.sessions.catalog.images;
  const image = images.register(old.id, "image", "data:image/png;base64," + png.toString("base64"));
  const saved = await images.get(image.id);
  const artifact = f.store.db
    .prepare("SELECT artifactId FROM native_images WHERE id=?")
    .get(image.id).artifactId;
  const writer = new Artifacts(
    f.sessions.config.hub.resultsPath,
    f.store,
    saved.data.length,
    "oldest",
  );
  writer.putPng(f.thread.id, saved.data.toString("base64"));
  await assert.rejects(images.get(image.id), { code: "ARTIFACT_EXPIRED" });
  for (const path of [`/api/native-images/${image.id}`, `/api/artifacts/${artifact}`]) {
    assert.equal((await f.app.inject({ url: path + "/status" })).statusCode, 401);
    const status = await f.app.inject({ url: path + "/status", headers: f.headers });
    assert.equal(status.statusCode, 200, status.body);
    assert.deepEqual(status.json(), { expired: true });
    const response = await f.app.inject({ url: path, headers: f.headers });
    assert.equal(response.statusCode, 410, response.body);
  }
  assert.equal(f.calls.filter((c) => /turn\/start|thread\/resume/.test(c.method)).length, 0);
});
