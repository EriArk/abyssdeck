import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { settings } from "./handoff-fixture.mjs";
import { usageFixture } from "./usage-resets-fixture.mjs";

test("exhausted included limits with a credit balance still dispatch once through native Codex, without consuming a reset", async (t) => {
  const f = await usageFixture();
  t.after(() => f.close());
  f.store.setPreferences({ machineClients: { pc: "web" } });
  f.state.raw.rateLimits.primary.usedPercent = 100;
  f.state.raw.rateLimits.secondary.usedPercent = 100;
  const snapshot = await f.read();
  assert(snapshot.groups[0].windows.every((w) => w.remainingPercent === 0));
  assert.equal(snapshot.groups[0].credits.balance, "125.50");
  const key = randomUUID(),
    body = { text: "Continue using available credits", settings, attachments: [] };
  const sent = await f.send(key, body);
  assert.equal(sent.statusCode, 200, sent.body);
  assert.deepEqual((await f.send(key, body)).json(), sent.json());
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 1);
  assert.deepEqual(f.state.consumes, []);
  assert.equal(f.state.raw.rateLimitResetCredits.availableCount, 2);
});
