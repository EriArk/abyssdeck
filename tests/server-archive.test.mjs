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

test("recovery groups stay in server archive until used on the new PC; ordinary empty projects stay visible", async (t) => {
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
  assert.equal(
    publicProject().serverArchived,
    true,
    "recreating a native group is not recovered chat context",
  );
  const old = f.store.createThread(saved.id, "lost-thread", "Saved only");
  f.store.db.prepare("UPDATE threads SET historyMode='saved' WHERE id=?").run(old.id);
  assert.equal(publicProject().serverArchived, true);
  const getDestination = async () =>
    (
      await f.app.inject({ url: "/api/workspace/destinations?id=" + saved.id, headers: f.headers })
    ).json().items;
  const archived = await getDestination();
  assert(
    archived.some((i) => i.ref.id === saved.id && i.ref.kind === "project" && i.serverArchived),
  );
  assert(!archived.some((i) => i.ref.id === saved.id && i.ref.kind === "discuss"));
  const live = f.store.createThread(saved.id, "linux-native-thread", "New Linux chat");
  assert.equal(publicProject().serverArchived, false);
  f.sessions.catalog.library.save("thread", live.codexThreadId, { archived: true });
  assert.equal(
    publicProject().serverArchived,
    false,
    "hiding a native chat does not reclassify a working project",
  );
  assert((await getDestination()).some((i) => i.ref.id === saved.id && i.ref.kind === "discuss"));
  assert.equal(f.store.thread(old.id).historyMode, "saved");
  assert.equal(f.calls.length, 0, "classification performs no native reads or writes");
});

test("completed explicit setup receipts reveal only their exact recovered machine folder", async (t) => {
  const f = await handoffFixture(undefined, undefined, {
    configure(c) {
      c.machines[0].type = "local-linux";
      c.projects[0].workingDirectory = "/Projects";
    },
  });
  t.after(() => f.close());
  const p = {
    id: "recovered",
    machineId: "pc",
    name: "Child",
    workingDirectory: "/Projects/Child",
    enabled: true,
    sourceId: "native",
    recoverySourceId: "old",
  };
  f.store.db
    .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
    .run(p.id, p.machineId, p.sourceId, JSON.stringify(p));
  const write = (state, path, id = p.id, machineId = p.machineId) =>
    f.store.db
      .prepare("INSERT OR REPLACE INTO project_setup_operations VALUES(?,?,?,?,?,?)")
      .run(
        "setup",
        machineId,
        state,
        JSON.stringify({ input: { workingDirectory: path, machineId }, project: { id } }),
        1,
        1,
      );
  for (const [state, path, id, machine] of [
    ["prepared", p.workingDirectory],
    ["unknown", p.workingDirectory],
    ["complete", "D:/Projects/Child"],
    ["complete", "/Projects"],
    ["complete", "/Projects/child"],
    ["complete", p.workingDirectory, "other"],
    ["complete", p.workingDirectory, p.id, "other-machine"],
  ]) {
    write(state, path, id, machine);
    assert.equal(f.sessions.catalog.isServerArchived(p), true);
  }
  write("complete", p.workingDirectory);
  assert.equal(f.sessions.catalog.isServerArchived(p), false);
  assert.equal(f.sessions.catalog.isServerArchived({ ...p, sourceId: undefined }), true);
  assert.equal(f.calls.length, 0);
});
