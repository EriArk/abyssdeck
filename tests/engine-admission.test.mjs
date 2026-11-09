import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { engineAdmissionPending } from "../apps/hub/dist/engine-admission.js";
import { ExternalActivity } from "../apps/hub/dist/externalActivity.js";
import { Store } from "../apps/hub/dist/store.js";

test("candidate admission freezes native discovery until installation completes, preserving exact checkpoint identities", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "engine-admission-"));
  const previous = Object.fromEntries(
    ["HUB_ROLE", "HUB_REVISION", "HUB_RELEASE_ROOT"].map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, {
    HUB_ROLE: "engine",
    HUB_REVISION: "abcdef01",
    HUB_RELEASE_ROOT: dir,
  });
  const store = new Store(":memory:");
  let discoveries = 0;
  const observer = new ExternalActivity(
    { machines: [{ id: "pc", codex: { activityNode: "node" } }] },
    store,
    {
      projects: () => [{ id: "p", machineId: "pc" }],
      syncThreads: async () => {
        discoveries++;
        if (!store.threadByCodex("new-native")) store.createThread("p", "new-native", "Discovered");
      },
    },
    async () => "/home/test",
    async () => false,
    () => {},
    async () => [],
  );
  t.after(async () => {
    await observer.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  assert.equal(engineAdmissionPending(), false);
  const status = (state) =>
    writeFileSync(
      join(dir, "maintenance.json"),
      JSON.stringify({ kind: "engine", revision: "abcdef01", state }),
    );
  status("installing");
  assert.equal(engineAdmissionPending(), true);
  await observer.refresh();
  assert.equal(discoveries, 0);
  assert.equal(store.db.prepare("SELECT count(*) n FROM threads").get().n, 0);
  status("installed");
  await observer.refresh();
  assert.equal(discoveries, 1);
  assert(store.threadByCodex("new-native"));
  status("waiting");
  assert.equal(engineAdmissionPending(), false);
  status("installing");
  process.env.HUB_REVISION = "previous";
  assert.equal(engineAdmissionPending(), false);
  process.env.HUB_REVISION = "abcdef01";
  writeFileSync(join(dir, "maintenance.json"), "{");
  assert.equal(engineAdmissionPending(), true);
});
