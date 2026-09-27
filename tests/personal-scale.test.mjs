import assert from "node:assert/strict";
import test from "node:test";
import { handoffFixture } from "./handoff-fixture.mjs";

test("personal scale validates authenticated writes and stays in the actor store", async (t) => {
  const a = await handoffFixture(),
    b = await handoffFixture();
  t.after(async () => {
    await a.close();
    await b.close();
  });
  const url = "/api/preferences";
  assert.equal(
    (await a.app.inject({ method: "PATCH", url, payload: { textScale: 1.25 } })).statusCode,
    401,
  );
  const patch = (f, body) =>
    f.app.inject({ method: "PATCH", url, headers: f.headers, payload: body });
  assert.equal((await patch(a, { textScale: 1.4, uiScale: 0.9 })).statusCode, 200);
  assert.equal((await patch(b, { textScale: 0.9, uiScale: 1.2 })).statusCode, 200);
  await patch(a, { theme: "organizer" });
  assert.equal(a.store.preferences().textScale, 1.4);
  assert.equal(a.store.preferences().uiScale, 0.9);
  assert.equal(b.store.preferences().textScale, 0.9);
  assert.equal(b.store.preferences().uiScale, 1.2);
  for (const body of [
    { textScale: 0 },
    { uiScale: 99 },
    { textScale: "1" },
    { userId: "other", textScale: 1 },
  ])
    assert.equal((await patch(a, body)).statusCode, 400);
  assert.equal(a.calls.filter((c) => c.method === "turn/start").length, 0);
});
