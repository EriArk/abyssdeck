import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubReference } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

test("GitHub source URL parser keeps repository and exact object; unrelated URLs stay external", () => {
  for (const kind of ["issues", "pull", "commit"]) {
    const id = kind === "commit" ? "a".repeat(40) : "123";
    const p = parseGitHubReference(`https://github.com/owner/repo/${kind}/${id}#issuecomment-7`);
    assert(p);
    assert.equal(p.repository, "owner/repo");
    assert.equal(p.url, `https://github.com/owner/repo/${kind}/${id}`);
  }
  for (const url of [
    "https://github.com.evil/owner/repo/issues/1",
    "https://github.com@evil/owner/repo/issues/1",
    "https://u@github.com/owner/repo/issues/1",
    "https://github.com/owner/repo/issues/1?token=secret",
    "https://github.com/owner/repo/commit/123",
    "https://github.com/owner/repo/issues/0",
    "https://github.com/owner/repo/blob/main/a.ts",
  ])
    assert.equal(parseGitHubReference(url), null, url);
});
test("reference resolution rejects another repo before object read, resolves commits and revalidates authority", async (t) => {
  const f = await handoffFixture();
  t.after(() => f.close());
  let probes = 0;
  f.intake.inspect = async () => ({ remote: { url: "git@github.com:owner/repo.git" } });
  f.intake.probe = async (_m, _cwd, q) => {
    probes++;
    return {
      repository: "owner/repo",
      repositoryId: 42,
      access: "write",
      evidence: { source: q.query.source },
      record: { type: q.query.type, number: q.query.number, title: "Exact" },
    };
  };
  await assert.rejects(() =>
    f.intake.reference("project", "https://github.com/other/repo/issues/12"),
  );
  assert.equal(probes, 0);
  const commit = await f.intake.reference(
    "project",
    "https://github.com/owner/repo/commit/" + "a".repeat(40),
  );
  assert.equal(commit.source.key, "commit:" + "a".repeat(40));
  assert.equal(commit.repositoryId, 42);
  const issue = await f.intake.reference(
    "project",
    "https://github.com/owner/repo/issues/12#issuecomment-4",
  );
  assert.equal(issue.source.number, 12);
  assert.equal(issue.source.url, "https://github.com/owner/repo/issues/12");
  f.sessions.authorizeExecution = () => {
    throw Error("revoked");
  };
  await assert.rejects(() =>
    f.intake.reference("project", "https://github.com/owner/repo/issues/12"),
  );
  assert.equal(probes, 2);
});
