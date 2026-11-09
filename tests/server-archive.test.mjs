import assert from "node:assert/strict";
import test from "node:test";
import { handoffFixture } from "./handoff-fixture.mjs";

test("saved histories stay separately bounded and never count as live work or unread completions", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  for (let n = 0; n < 205; n++) {
    const old = f.store.createThread("project", "lost-" + n, "Saved " + n);
    f.store.db
      .prepare(
        "UPDATE threads SET historyMode='saved',status='running',completedSeq=10,seenSeq=0 WHERE id=?",
      )
      .run(old.id);
  }
  const nav = f.store.navigation(["project"]);
  assert.equal(nav.threads.filter((thread) => thread.historyMode === "saved").length, 200);
  assert(nav.threads.some((thread) => thread.id === f.thread.id));
  assert.equal(nav.projects[0].active, 0);
  assert.equal(nav.projects[0].unread, 0);
  assert.equal(f.sessions.catalog.publicProjects().find((p) => p.id === "project").threadCount, 1);
  assert.equal(
    f.store.db.prepare("SELECT COUNT(*) AS count FROM threads WHERE projectId='project'").get()
      .count,
    206,
    "identities and runtime receipts remain intact",
  );
});

test("only unrebound recovery projects enter server archive; ordinary cached projects stay visible", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  const saved = {
    id: "lost-project",
    name: "Saved project",
    machineId: "pc",
    workingDirectory: "C:/Lost",
    enabled: true,
    recoverySourceId: "old-project",
  };
  f.store.db
    .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
    .run(saved.id, "pc", "old-project", JSON.stringify(saved));
  const publicProject = () => f.sessions.catalog.publicProjects().find((p) => p.id === saved.id);
  assert.equal(publicProject().serverArchived, true);
  assert.equal(
    f.sessions.catalog.publicProjects().find((p) => p.id === "project").serverArchived,
    false,
  );
  f.store.db
    .prepare("UPDATE catalog_projects SET value=? WHERE id=?")
    .run(JSON.stringify({ ...saved, sourceId: "restored-native-project" }), saved.id);
  assert.equal(publicProject().serverArchived, false);
  assert.equal(f.calls.length, 0, "classification performs no native reads or writes");
});
