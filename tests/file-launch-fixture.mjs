import { createHash } from "node:crypto";
import { handoffFixture } from "./handoff-fixture.mjs";
export async function fileLaunchFixture(origin = "https://handoff.test") {
  const launches = [],
    records = new Map(),
    bytes = Buffer.from("MZ fixture exact executable"),
    digest = createHash("sha256").update(bytes).digest("hex");
  let lose = false,
    pause,
    release;
  const f = await handoffFixture(origin, undefined, {
    configure(config) {
      config.machines[0].remote = { provider: "vnc", port: 5900, password: "FixtureOnly" };
    },
    fileLaunchProbe: async (machine, root, q) => {
      launches.push({ machine: machine.id, root, q });
      if (q.op === "prepare")
        return {
          path: q.path,
          handler: q.path.endsWith(".ps1") ? "ps1" : /\.(bat|cmd)$/.test(q.path) ? "cmd" : "exe",
          sha256: digest,
          bytes: bytes.length,
        };
      if (q.op === "start") {
        if (pause) await pause;
        const value = { id: q.id, state: "running", pid: 321 };
        records.set(q.id, value);
        if (lose) {
          lose = false;
          throw Error("Lost acknowledgement");
        }
        return value;
      }
      const value = records.get(q.id);
      if (!value) throw Error("Missing");
      return value;
    },
  });
  const artifactId = "ae16ccbe-b444-4b4f-9a86-fc61f8980ba9";
  f.store.db
    .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?)")
    .run(
      artifactId,
      f.thread.id,
      "application/octet-stream",
      bytes.length,
      new Date().toISOString(),
    );
  f.store.db
    .prepare("INSERT INTO artifact_files VALUES(?,?,?,?,?)")
    .run(artifactId, "Demo.exe", digest, "C:/Project/dist/Demo.exe", null);
  f.store.db.prepare("INSERT INTO artifact_source_bindings VALUES(?,?,?)").run(
    artifactId,
    "C:/Project",
    createHash("sha256")
      .update(JSON.stringify(f.sessions.catalog.machine("pc")))
      .digest("hex"),
  );
  const source = "/api/artifacts/" + artifactId;
  const result = f.store.result(f.thread.id, null, "fixture-launch", "artifact", "Demo.exe", {
    url: source,
    bytes: bytes.length,
    mime: "application/octet-stream",
  });
  return Object.assign(f, {
    launches,
    records,
    source,
    result,
    artifactId,
    digest,
    lose() {
      lose = true;
    },
    hold() {
      pause = new Promise((r) => {
        release = r;
      });
    },
    finish() {
      release?.();
      pause = undefined;
    },
  });
}
