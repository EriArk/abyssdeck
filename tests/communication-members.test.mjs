import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createTeamSnapshot, restoreTeamSnapshot } from "../apps/hub/dist/team-maintenance.js";
import { communicationFixture } from "./communication-fixture.mjs";

const ok = (r) => {
  assert.equal(r.statusCode, 200, r.body);
  return r.json();
};
async function setup(t) {
  const f = await communicationFixture();
  t.after(f.close);
  const group = ok(
    await f.request(f.headers, "POST", "/api/team/conversations", {
      kind: "group",
      title: "Membership",
      members: [f.friend],
    }),
  );
  const path = `/api/team/conversations/${group.id}`;
  const detail = async (headers = f.headers) => ok(await f.request(headers, "GET", path));
  const change = async (action, userId, headers = f.headers, key = randomUUID(), version) =>
    f.request(
      headers,
      "POST",
      path + "/members",
      { action, userId, version: version ?? (await detail(headers)).membersVersion },
      key,
    );
  const pending = async (headers = f.thirdHeaders) =>
    ok(await f.request(headers, "GET", "/api/team/conversations")).invitations;
  const answer = (id, accept, key = randomUUID(), headers = f.thirdHeaders) =>
    f.request(headers, "POST", `/api/team/conversation-invitations/${id}`, { accept }, key);
  return { ...f, group, path, detail, change, pending, answer };
}

test("group invitations preserve private history until accepted and removed members lose all server access", async (t) => {
  const f = await setup(t);
  const chat = f.path + "/chat";
  const file = ok(
    await f.hub.app.inject({
      method: "POST",
      url: chat + "/files?name=private.txt&mime=text/plain",
      headers: { ...f.headers, "content-type": "application/octet-stream" },
      payload: Buffer.from("private bytes"),
    }),
  );
  ok(await f.request(f.headers, "POST", chat, { text: "Group history", files: [file.id] }));
  assert.equal((await f.change("invite", f.third, f.friendHeaders)).statusCode, 403);
  const inviteKey = randomUUID(),
    version = (await f.detail()).membersVersion;
  ok(await f.change("invite", f.third, f.headers, inviteKey, version));
  ok(await f.change("invite", f.third, f.headers, inviteKey, version));
  const [invitation] = await f.pending();
  assert.ok(invitation);
  assert.equal((await f.pending()).length, 1);
  assert.equal((await f.detail(f.friendHeaders)).invitations.length, 0);
  for (const path of [f.path, chat, chat + "/files/" + file.id])
    assert.equal((await f.request(f.thirdHeaders, "GET", path)).statusCode, 404);
  assert.equal(
    (await f.answer(invitation.id, true, randomUUID(), f.friendHeaders)).statusCode,
    404,
  );
  const answerKey = randomUUID();
  ok(await f.answer(invitation.id, true, answerKey));
  ok(await f.answer(invitation.id, true, answerKey));
  assert.equal((await f.detail(f.thirdHeaders)).members.length, 3);
  assert.equal(ok(await f.request(f.thirdHeaders, "GET", chat)).messages[0].text, "Group history");
  assert.equal(
    (await f.request(f.thirdHeaders, "GET", chat + "/files/" + file.id)).body,
    "private bytes",
  );
  ok(await f.change("remove", f.third));
  // Replaying an accepted receipt reports completion, never reactivates access.
  ok(await f.answer(invitation.id, true, answerKey));
  assert.equal((await f.answer(invitation.id, true)).statusCode, 409);
  for (const path of [f.path, chat, chat + "/files/" + file.id])
    assert.equal((await f.request(f.thirdHeaders, "GET", path)).statusCode, 404);
  assert.equal(
    (await f.request(f.thirdHeaders, "POST", chat, { text: "No access", files: [] })).statusCode,
    404,
  );
  ok(await f.change("invite", f.third));
  const [newInvitation] = await f.pending();
  assert.notEqual(newInvitation.id, invitation.id);
  assert.equal((await f.answer(invitation.id, true, answerKey)).statusCode, 404);
  ok(await f.answer(newInvitation.id, true));
  assert.equal((await f.detail(f.thirdHeaders)).members.length, 3);
});

test("membership revisions, invitation rejection/revocation, ownership transfer and last-owner exit", async (t) => {
  const f = await setup(t);
  ok(await f.change("invite", f.third));
  const [first] = await f.pending();
  ok(await f.answer(first.id, false));
  assert.equal((await f.pending()).length, 0);
  ok(await f.change("invite", f.third));
  const [second] = await f.pending();
  ok(await f.change("revoke", f.third));
  assert.equal((await f.answer(second.id, true)).statusCode, 409);
  const stale = (await f.detail()).membersVersion;
  ok(await f.change("invite", f.third));
  assert.equal(
    (await f.change("remove", f.friend, f.headers, randomUUID(), stale)).statusCode,
    409,
  );
  assert.equal((await f.request(f.headers, "DELETE", f.path)).statusCode, 409);
  const transferKey = randomUUID(),
    version = (await f.detail()).membersVersion;
  ok(await f.change("transfer", f.friend, f.headers, transferKey, version));
  ok(await f.change("transfer", f.friend, f.headers, transferKey, version));
  assert.equal((await f.pending()).length, 0);
  assert.equal((await f.detail()).ownerId, f.friend);
  assert.equal((await f.change("remove", f.friend)).statusCode, 403);
  ok(await f.request(f.headers, "DELETE", f.path));
  ok(await f.change("invite", f.third, f.friendHeaders));
  const [last] = await f.pending();
  ok(await f.request(f.friendHeaders, "DELETE", f.path));
  assert.equal((await f.pending()).length, 0);
  assert.equal((await f.answer(last.id, true)).statusCode, 409);
});

test("direct conversations and inactive accounts cannot acquire group-management capabilities", async (t) => {
  const f = await setup(t);
  const dm = ok(
    await f.request(f.headers, "POST", "/api/team/conversations", {
      kind: "direct",
      title: "",
      members: [f.friend],
    }),
  );
  assert.equal(
    (
      await f.request(f.headers, "POST", `/api/team/conversations/${dm.id}/members`, {
        action: "invite",
        userId: f.third,
        version: 0,
      })
    ).statusCode,
    403,
  );
  assert.equal((await f.change("remove", f.owner)).statusCode, 400);
  const r = await f.request(f.headers, "POST", f.path + "/members", {
    action: "invite",
    userId: f.third,
    version: -1,
  });
  assert.equal(r.statusCode, 400);
  ok(await f.change("invite", f.third));
  const [invitation] = await f.pending();
  f.hub.registry.db.prepare("UPDATE team_users SET state='disabled' WHERE id=?").run(f.third);
  assert.notEqual((await f.answer(invitation.id, true)).statusCode, 200);
  assert.equal((await f.detail()).members.length, 2);
});

test("group membership versions, invitation epochs and receipts survive backup and restore", async (t) => {
  const f = await setup(t);
  ok(await f.change("invite", f.third));
  const snapshot = await createTeamSnapshot(f.config, join(f.root, "backups"));
  const restored = join(f.root, "restored-members");
  await restoreTeamSnapshot(snapshot, restored);
  const db = new DatabaseSync(join(restored, "team", "team.db"), { readOnly: true });
  try {
    for (const table of [
      "human_members",
      "human_group_versions",
      "human_group_invitations",
      "team_receipts",
    ])
      assert.deepEqual(
        db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        f.hub.registry.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      );
  } finally {
    db.close();
  }
});
