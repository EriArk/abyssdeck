import assert from "node:assert/strict";
import test from "node:test";
import { handoffFixture } from "./handoff-fixture.mjs";

test("project refresh warnings retain exact machine scope and authentication", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  f.sessions.catalog.refresh = async () => {};
  f.sessions.catalog.errors.set("other-device", "Other device unavailable");
  const r = await f.app.inject({ url: "/api/projects", headers: f.headers });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().machineWarnings, [
    { machineId: "other-device", message: "Other device unavailable" },
  ]);
  assert.equal((await f.app.inject({ url: "/api/projects" })).statusCode, 401);
  f.sessions.catalog.errors.clear();
  assert.deepEqual(
    (await f.app.inject({ url: "/api/projects", headers: f.headers })).json().machineWarnings,
    [],
  );
});
