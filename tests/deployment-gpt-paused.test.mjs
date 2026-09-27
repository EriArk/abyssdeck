import assert from "node:assert/strict";
import test from "node:test";
import { deploymentBlockers } from "../apps/hub/dist/deployment-status.js";
import { NativeGptJobs } from "../apps/hub/dist/gpt-native-jobs.js";
import { Store } from "../apps/hub/dist/store.js";

test("paused native delivery survives maintenance and worker restart without blocking Hub or resending", () => {
  const store = new Store(":memory:");
  try {
    const worker = () => new NativeGptJobs(store, {}, () => {}, new Set());
    worker();
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS gpt_job_providers(jobId TEXT PRIMARY KEY, provider TEXT NOT NULL)",
    );
    store.db
      .prepare(
        "INSERT INTO gpt_jobs(id,fingerprint,nativeId,text,files,model,effort,status,answer,assets,error,createdAt,updatedAt) VALUES('job','proof','chat','saved prompt','[]','latest','1','unknown','partial answer','[]','NATIVE_CHAT_PAUSED',1,1)",
      )
      .run();
    store.db.exec(
      "INSERT INTO gpt_job_providers VALUES('job','native'); INSERT INTO gpt_native_read_health VALUES('job',3,1,0); INSERT INTO gpt_native_receipts(jobId,payload,messages) VALUES('job','{\"exact\":true}','[]')",
    );
    const saved = () =>
      JSON.stringify({
        job: store.db.prepare("SELECT * FROM gpt_jobs").all(),
        receipt: store.db.prepare("SELECT * FROM gpt_native_receipts").all(),
        health: store.db.prepare("SELECT * FROM gpt_native_read_health").all(),
      });
    const before = saved();
    const blocked = () =>
      deploymentBlockers(store, { busy: 0, unknown: 0 }).some((b) => b.kind === "gpt");
    assert.equal(blocked(), false);
    assert.equal(worker().canPoll("job"), false);
    assert.equal(saved(), before);
    for (const state of ["queued", "preparing", "running"]) {
      store.db.prepare("UPDATE gpt_jobs SET status=?").run(state);
      assert.equal(blocked(), true, state);
    }
    store.db.exec(
      "UPDATE gpt_jobs SET status='unknown'; UPDATE gpt_native_read_health SET paused=0",
    );
    assert.equal(blocked(), true);
    store.db.exec("UPDATE gpt_native_read_health SET paused=1,failures=2");
    assert.equal(blocked(), true);
    store.db.exec(
      "UPDATE gpt_native_read_health SET failures=3; UPDATE gpt_job_providers SET provider='browser'",
    );
    assert.equal(blocked(), true);
    store.db.exec(
      "UPDATE gpt_job_providers SET provider='native'; UPDATE gpt_jobs SET error='NATIVE_RECONCILE_REQUIRED'",
    );
    assert.equal(blocked(), true);
    store.db.exec(
      "UPDATE gpt_jobs SET error='NATIVE_CHAT_PAUSED'; DELETE FROM gpt_native_receipts",
    );
    assert.equal(blocked(), true);
    store.db.exec("DROP TABLE gpt_native_read_health");
    assert.equal(blocked(), true, "legacy/missing evidence fails closed");
  } finally {
    store.close();
  }
});
