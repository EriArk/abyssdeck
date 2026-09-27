import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Artifacts } from "../apps/hub/dist/artifacts.js";
import {
  ResultSnapshotLifetime,
  snapshotGraceMs,
} from "../apps/hub/dist/result-snapshot-lifetime.js";
import {
  createTeamSnapshot,
  restoreTeamSnapshot,
  verifyTeamSnapshot,
} from "../apps/hub/dist/team-maintenance.js";
import { communicationFixture } from "./communication-fixture.mjs";

const ok = (r) => {
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
};
async function fixture(t) {
  const f = await communicationFixture();
  t.after(f.close);
  const db = f.hub.registry.db,
    root = join(f.config.team.root, "space-chat-files", "shared_result");
  const lifetime = new ResultSnapshotLifetime({ db, root });
  const capture = async (text = "exact immutable bytes") => {
    const r = f.runtimes.get("owner"),
      a = new Artifacts(r.sessions.config.hub.resultsPath, r.store);
    const payload = a.putFile(
      r.thread.id,
      null,
      "sample.txt",
      "private/sample.txt",
      "text/plain",
      Buffer.from(text),
    );
    const resultId = r.store.result(r.thread.id, null, randomUUID(), "file", "sample.txt", payload);
    const source = { client: "codex", threadId: r.thread.id, resultId },
      key = randomUUID();
    const snapshot = ok(
      await f.request(f.headers, "POST", "/api/team/result-snapshots", source, key),
    );
    return {
      snapshot,
      source,
      key,
      bytes: Buffer.from(text),
      path: join(root, snapshot.id + ".bin"),
    };
  };
  const age = (id) =>
    db
      .prepare("UPDATE result_snapshot_lifetime SET touchedAt=? WHERE id=?")
      .run(Date.now() - snapshotGraceMs - 10000, id);
  return { ...f, db, root, lifetime, capture, age };
}
test("expired preparation frees bytes, retains exact receipts, survives restart/backup and requires explicit recapture", async (t) => {
  const f = await fixture(t),
    a = await f.capture();
  assert.equal(f.lifetime.sweep().removed, 0);
  f.age(a.snapshot.id);
  const receiptBefore = f.db
    .prepare("SELECT * FROM team_receipts WHERE userId=? AND scope='result.capture' AND key=?")
    .get(f.owner, a.key);
  assert.equal(f.lifetime.sweep().removed, 1);
  assert(!existsSync(a.path));
  assert.deepEqual(
    f.db
      .prepare("SELECT * FROM team_receipts WHERE userId=? AND scope='result.capture' AND key=?")
      .get(f.owner, a.key),
    receiptBefore,
  );
  assert.equal(
    (await f.request(f.headers, "POST", "/api/team/result-snapshots", a.source, a.key)).statusCode,
    410,
  );
  const backup = await createTeamSnapshot(f.config, join(f.root, "backup"));
  await verifyTeamSnapshot(backup);
  const restored = join(f.root, "restored");
  await restoreTeamSnapshot(backup, restored);
  const reopened = new DatabaseSync(join(restored, "team", "team.db"));
  try {
    const rroot = join(restored, "team", "space-chat-files", "shared_result");
    mkdirSync(rroot, { recursive: true });
    const life = new ResultSnapshotLifetime({ db: reopened, root: rroot });
    assert.throws(
      () => life.retained(a.snapshot.id),
      (e) => e.code === "RESULT_COPY_EXPIRED",
    );
    assert.equal(life.sweep().removed, 0);
  } finally {
    reopened.close();
  }
  // Simulate a process exit after exact bytes were written by explicit recapture
  // but before its tombstone was restored; the next explicit retry is safe.
  await writeFile(a.path, a.bytes);
  const newCopy = ok(await f.request(f.headers, "POST", "/api/team/result-snapshots", a.source));
  assert.equal(newCopy.id, a.snapshot.id);
  assert.equal(newCopy.sha256, a.snapshot.sha256);
  assert.deepEqual(await readFile(a.path), a.bytes);
  assert.equal(f.db.prepare("SELECT count(*) n FROM shared_result_files").get().n, 1);
  assert.equal(
    ok(await f.request(f.headers, "POST", "/api/team/result-snapshots", a.source, a.key)).id,
    a.snapshot.id,
  );
});
test("published snapshot outlives its source; revoked access and cancelled pending handoffs collect only after grace", async (t) => {
  const f = await fixture(t),
    a = await f.capture();
  const dm = ok(
    await f.request(f.headers, "POST", "/api/team/conversations", {
      title: "",
      members: [f.friend],
    }),
  );
  const grant = ok(
    await f.request(f.headers, "POST", "/api/team/result-shares", {
      snapshotId: a.snapshot.id,
      destination: { kind: "conversation", id: dm.id },
      publicRoom: false,
    }),
  );
  f.age(a.snapshot.id);
  assert.equal(f.lifetime.sweep().removed, 0);
  const r = f.runtimes.get("owner");
  r.store.db.prepare("DELETE FROM results WHERE id=?").run(a.source.resultId);
  assert.equal(
    (await f.request(f.headers, "POST", "/api/team/result-snapshots", a.source)).statusCode,
    404,
  );
  assert.deepEqual(
    (await f.request(f.friendHeaders, "GET", `/api/team/result-shares/${grant.id}/content`))
      .rawPayload,
    a.bytes,
  );
  ok(await f.request(f.friendHeaders, "DELETE", `/api/team/conversations/${dm.id}`));
  assert.equal(
    (await f.request(f.friendHeaders, "GET", `/api/team/result-shares/${grant.id}/content`))
      .statusCode,
    404,
  );
  const targets = ok(await f.request(f.headers, "GET", "/api/team/result-work-targets")).items;
  const target = targets.find((x) => x.kind === "work" && x.projectId === "owner-project");
  const handoff = ok(
    await f.request(f.headers, "POST", "/api/team/result-work-handoffs", {
      snapshotId: a.snapshot.id,
      destination: { kind: target.kind, projectId: target.projectId },
      binding: target.binding,
    }),
  );
  ok(await f.request(f.headers, "DELETE", `/api/team/result-shares/${grant.id}`));
  f.age(a.snapshot.id);
  assert.equal(f.lifetime.sweep().removed, 0, "pending exact handoff protects bytes");
  const file = ok(
    await f.request(
      f.headers,
      "POST",
      `/api/team/result-work-handoffs/${handoff.id}/attachment`,
      {},
    ),
  ).file;
  f.age(a.snapshot.id);
  assert.equal(f.lifetime.sweep().removed, 0, "copied draft/uncertain send protects source");
  ok(await f.request(f.headers, "DELETE", `/api/team/result-handoffs/${handoff.id}`));
  assert.equal(f.lifetime.sweep().removed, 0, "cancellation starts grace");
  f.age(a.snapshot.id);
  assert.equal(f.lifetime.sweep().removed, 1);
  assert.deepEqual(
    await readFile(join(r.sessions.attachments.root, file.id + ".bin")),
    a.bytes,
    "independent attachment is never collected",
  );
  assert.equal(
    (await f.request(f.headers, "GET", `/api/team/result-shares/${grant.id}/content`)).statusCode,
    410,
  );
  assert.equal(
    (
      await f.request(
        f.headers,
        "POST",
        `/api/team/result-work-handoffs/${handoff.id}/attachment`,
        {},
      )
    ).statusCode,
    404,
  );
  assert.equal(r.nativeCalls.filter((c) => c.method === "turn/start").length, 0);
});
test("bounded cleanup retries unlink failures without releasing quota or deleting an active snapshot", async (t) => {
  const f = await fixture(t),
    a = await f.capture(),
    b = await f.capture("second");
  f.age(a.snapshot.id);
  f.age(b.snapshot.id);
  const saved = a.path + ".saved";
  renameSync(a.path, saved);
  mkdirSync(a.path);
  f.db.prepare("UPDATE result_snapshot_lifetime SET touchedAt=0 WHERE id=?").run(a.snapshot.id);
  assert.deepEqual(f.lifetime.sweep(1), { examined: 1, removed: 0 });
  const marked = f.db
    .prepare("SELECT * FROM result_snapshot_lifetime WHERE id=?")
    .get(a.snapshot.id);
  assert(marked.collectedAt);
  assert.equal(marked.removedAt, null);
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM result_snapshot_lifetime WHERE collectedAt IS NOT NULL")
      .get().n,
    1,
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT sum(f.bytes) n FROM shared_result_files f JOIN result_snapshot_lifetime l ON l.id=f.id WHERE l.removedAt IS NULL",
      )
      .get().n,
    a.bytes.length + b.bytes.length,
  );
  rmdirSync(a.path);
  renameSync(saved, a.path);
  assert.equal(f.lifetime.sweep().removed, 2);
  assert.equal(f.lifetime.sweep().removed, 0);
});
test("cancel during Work attachment staging cannot revive a dismissed handoff", async (t) => {
  const f = await fixture(t),
    a = await f.capture(),
    r = f.runtimes.get("owner");
  const target = ok(await f.request(f.headers, "GET", "/api/team/result-work-targets")).items.find(
    (x) => x.kind === "work" && x.projectId === "owner-project",
  );
  const handoff = ok(
    await f.request(f.headers, "POST", "/api/team/result-work-handoffs", {
      snapshotId: a.snapshot.id,
      destination: { kind: "work", projectId: target.projectId },
      binding: target.binding,
    }),
  );
  const original = r.sessions.attachments.putFile.bind(r.sessions.attachments);
  let release, entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  r.sessions.attachments.putFile = async (...args) => {
    const file = await original(...args);
    entered();
    await new Promise((resolve) => (release = resolve));
    return file;
  };
  const pending = f.request(
    f.headers,
    "POST",
    `/api/team/result-work-handoffs/${handoff.id}/attachment`,
    {},
  );
  await waiting;
  ok(await f.request(f.headers, "DELETE", `/api/team/result-handoffs/${handoff.id}`));
  release();
  assert.equal((await pending).statusCode, 404);
  assert.equal(
    f.db.prepare("SELECT dismissed FROM result_ai_handoffs WHERE id=?").get(handoff.id).dismissed,
    1,
  );
  assert.equal(r.nativeCalls.filter((c) => c.method === "turn/start").length, 0);
});

test("cancel during GPT staging preserves receipt and does not return the cancelled attachment", async (t) => {
  const f = await fixture(t),
    a = await f.capture(),
    r = f.runtimes.get("owner"),
    native = randomUUID();
  r.gpt.library.save("thread", native, { name: "Own GPT" });
  const handoff = ok(
    await f.request(f.headers, "POST", "/api/team/result-handoffs", {
      snapshotId: a.snapshot.id,
      threadId: native,
    }),
  );
  let release, entered;
  const waiting = new Promise((resolve) => (entered = resolve));
  r.gpt.putFile = async (name, bytes, id) => {
    entered();
    await new Promise((resolve) => (release = resolve));
    return { id, name, bytes: bytes.length, mime: "text/plain", url: "/api/gpt/uploads/" + id };
  };
  const pending = f.request(
    f.headers,
    "POST",
    `/api/team/result-handoffs/${handoff.id}/attachment`,
    {},
  );
  await waiting;
  ok(await f.request(f.headers, "DELETE", `/api/team/result-handoffs/${handoff.id}`));
  release();
  assert.equal((await pending).statusCode, 404);
  assert.equal(
    f.db.prepare("SELECT dismissed FROM result_ai_handoffs WHERE id=?").get(handoff.id).dismissed,
    1,
  );
  assert(
    f.db
      .prepare("SELECT 1 FROM team_receipts WHERE scope='result.ai.handoff' AND key=?")
      .get(handoff.id),
  );
});
