import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { Artifacts } from "../apps/hub/dist/artifacts.js";
import { communicationFixture } from "./communication-fixture.mjs";

const ok = (r, code = 200) => {
  assert.equal(r.statusCode, code, r.body);
  return r.json();
};
test("Results stage exact private bytes into Work and Intake, without sends; retries and changed bindings", async (t) => {
  const f = await communicationFixture();
  t.after(f.close);
  const r = f.runtimes.get("owner"),
    root = "/api/team/result-work-handoffs";
  const bytes = Buffer.from("# Exact source\r\nПривет\n\n");
  const artifact = new Artifacts(r.sessions.config.hub.resultsPath, r.store).putFile(
    r.thread.id,
    null,
    "source.md",
    "private/source.md",
    "text/markdown",
    bytes,
  );
  const resultId = r.store.result(r.thread.id, null, "forward-test", "file", "source.md", artifact);
  const snapshot = ok(
    await f.request(f.headers, "POST", "/api/team/result-snapshots", {
      client: "codex",
      threadId: r.thread.id,
      resultId,
    }),
  );
  const targets = ok(await f.request(f.headers, "GET", "/api/team/result-work-targets")).items;
  assert.equal(r.nativeCalls.filter((c) => /^(thread|turn)\/start$/.test(c.method)).length, 0);
  assert(!JSON.stringify(targets).includes(f.root));
  const prepared = {};
  for (const kind of ["work", "intake"]) {
    const target = targets.find((d) => d.kind === kind && d.projectId === "owner-project");
    assert(target);
    const input = {
      snapshotId: snapshot.id,
      destination: { kind, projectId: target.projectId },
      binding: target.binding,
    };
    const key = randomUUID(),
      receipt = ok(await f.request(f.headers, "POST", root, input, key));
    assert.deepEqual(ok(await f.request(f.headers, "POST", root, input, key)), receipt);
    assert.equal((await f.request(f.friendHeaders, "POST", root, input)).statusCode, 404);
    assert.equal(
      (await f.request(f.headers, "POST", root, { ...input, binding: "0".repeat(64) })).statusCode,
      409,
    );
    assert.equal(r.nativeCalls.filter((c) => c.method === "turn/start").length, 0);
    const query = kind === "work" ? "threadId=" + target.threadId : "projectId=" + target.projectId;
    assert.equal(ok(await f.request(f.headers, "GET", root + "?" + query)).items[0].id, receipt.id);
    const attached = ok(await f.request(f.headers, "POST", root + `/${receipt.id}/attachment`, {}));
    assert.equal(attached.sha256, snapshot.sha256);
    assert.equal(attached.file.id, receipt.id);
    assert.deepEqual(
      await readFile(join(r.sessions.attachments.root, attached.file.id + ".bin")),
      bytes,
    );
    assert.deepEqual(
      ok(await f.request(f.headers, "POST", root + `/${receipt.id}/attachment`, {})),
      attached,
    );
    assert.equal(
      (await f.request(f.friendHeaders, "POST", root + `/${receipt.id}/attachment`, {})).statusCode,
      404,
    );
    assert.deepEqual(ok(await f.request(f.headers, "GET", root + "?" + query)).items, []);
    assert.equal(r.nativeCalls.filter((c) => c.method === "turn/start").length, 0);
    prepared[kind] = { input, attached, receipt };
  }
  assert.notEqual(prepared.intake.attached.file.threadId, r.thread.id);
  assert.equal(r.store.thread(prepared.intake.attached.file.threadId).diagnostic, 1);
  assert.equal(r.nativeCalls.filter((c) => c.method === "thread/start").length, 1);
  const replacement = r.store.createThread("owner-project", randomUUID(), "Replacement");
  r.projectWork.context.rotate(
    { client: "codex", projectId: "owner-project", name: "Altar" },
    r.thread.id,
    replacement.id,
  );
  assert.equal((await f.request(f.headers, "POST", root, prepared.work.input)).statusCode, 409);
  assert.equal(
    (await f.request(f.headers, "POST", root + `/${prepared.work.receipt.id}/attachment`, {}))
      .statusCode,
    409,
  );
  assert.deepEqual(
    ok(await f.request(f.headers, "GET", root + "?threadId=" + replacement.id)).items,
    [],
  );
  const before = r.sessions.attachments.pending(prepared.intake.attached.file.threadId).length;
  const binding = r.store.db
    .prepare(
      "SELECT id FROM ai_conversation_bindings WHERE role='intake' AND scopeId='owner-project'",
    )
    .get();
  r.store.db
    .prepare("UPDATE ai_conversation_bindings SET revision=revision+1 WHERE id=?")
    .run(binding.id);
  assert.equal(
    (await f.request(f.headers, "POST", root + `/${prepared.intake.receipt.id}/attachment`, {}))
      .statusCode,
    409,
  );
  assert.equal(
    r.sessions.attachments.pending(prepared.intake.attached.file.threadId).length,
    before,
  );
});
