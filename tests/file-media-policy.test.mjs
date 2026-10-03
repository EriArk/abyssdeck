import assert from "node:assert/strict";
import test from "node:test";
import { handoffFixture } from "./handoff-fixture.mjs";

test("file media accepts local blobs without broadening script, connection or object sources", async () => {
  const f = await handoffFixture();
  try {
    const response = await f.app.inject({ method: "GET", url: "/" });
    const policy = response.headers["content-security-policy"];
    assert.match(policy, /(?:^|;)media-src 'self' blob:(?:;|$)/);
    assert.match(policy, /(?:^|;)script-src 'self'(?:;|$)/);
    assert.match(policy, /(?:^|;)connect-src 'self'(?:;|$)/);
    assert.match(policy, /(?:^|;)object-src 'none'(?:;|$)/);
  } finally {
    await f.close();
  }
});
