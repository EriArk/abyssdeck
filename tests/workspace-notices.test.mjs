import assert from "node:assert/strict";
import test from "node:test";
import { ProjectPlans } from "../apps/hub/dist/project-plans.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const request = (f, url, method = "GET", payload) =>
  f.app.inject({ url: "/api/workspace/notices" + url, method, payload, headers: f.headers });
const list = async (f) => (await request(f, "")).json().items;
const complete = (f, turn) => {
  f.store.setStatus(f.thread.id, "completed");
  f.store.append(f.thread.id, "turn.completed", { id: turn, status: "completed" }, turn);
};
test("internal work notices need no push subscription; exact read/version and private source revalidation", async (t) => {
  const f = await handoffFixture(),
    other = await handoffFixture();
  t.after(async () => {
    await f.close();
    await other.close();
  });
  assert.equal((await f.app.inject({ url: "/api/workspace/notices" })).statusCode, 401);
  complete(f, "turn-one");
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM push_subscriptions").get().n, 0);
  let notices = await list(f);
  assert.equal(notices.length, 1);
  assert.equal((await list(other)).length, 0);
  const first = notices[0];
  assert.equal(first.target.threadId, f.thread.id);
  assert.equal(first.target.turnId, "turn-one");
  assert.equal((await request(f, "/open", "POST", { id: first.id })).json().turnId, "turn-one");
  assert.equal((await request(other, "/open", "POST", { id: first.id })).statusCode, 404);
  assert.equal((await request(f, "/read", "POST", { ids: [first.id] })).statusCode, 200);
  assert.equal((await list(f)).length, 0);
  complete(f, "turn-two");
  notices = await list(f);
  assert.equal(notices.length, 1);
  assert.notEqual(notices[0].id, first.id);
  assert.equal((await request(f, "/open", "POST", { id: first.id })).statusCode, 404);
  f.store.db.prepare("UPDATE threads SET archived=1 WHERE id=?").run(f.thread.id);
  assert.equal((await list(f)).length, 0);
  assert.equal((await request(f, "/open", "POST", { id: notices[0].id })).statusCode, 404);
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
});
test("completed plans and GPT jobs remain independent, bounded, and read does not mutate work", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  const plans = new ProjectPlans(f.sessions);
  const input = {
    scope: { client: "codex", projectId: "project", name: "Project" },
    revision: 0,
    title: "Завершённый план",
    description: "",
    status: "done",
    sections: [],
    links: [],
  };
  plans.save("plan", input);
  const now = Date.now();
  f.store.db
    .prepare(
      "INSERT INTO gpt_jobs(id,fingerprint,nativeId,text,files,model,effort,status,answer,assets,createdAt,updatedAt,error) VALUES('job','fingerprint','native','secret','[]','m','e','completed','private answer','[]',?,?,'')",
    )
    .run(now, now);
  let items = await list(f);
  assert.equal(items.length, 2);
  const plan = items.find((n) => n.target.kind === "plan"),
    gpt = items.find((n) => n.target.client === "gpt");
  assert.equal(plan.target.id, "plan");
  assert.equal(gpt.target.id, "native");
  assert.ok(!JSON.stringify(items).includes("private answer"));
  await request(f, "/read", "POST", { ids: items.map((n) => n.id) });
  assert.equal((await list(f)).length, 0);
  assert.equal(plans.get("plan").status, "done");
  plans.save("plan", { ...input, revision: 1, status: "draft" });
  assert.equal((await request(f, "/open", "POST", { id: plan.id })).statusCode, 404);
  f.store.db.prepare("UPDATE gpt_jobs SET status='unknown' WHERE id='job'").run();
  items = await list(f);
  assert.equal(items.length, 1);
  assert.notEqual(items[0].id, gpt.id);
  assert.equal(
    (await request(f, "/read", "POST", { ids: [items[0].id], userId: "other" })).statusCode,
    400,
  );
  assert.equal(f.calls.filter((c) => c.method === "turn/start").length, 0);
});
