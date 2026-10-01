import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../apps/hub/dist/app.js";
import { configSchema } from "../packages/shared/dist/index.js";

test("DOCX pages require the current session and CSRF; exact bytes reach worker and logout cancels delivery", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "docx-test-")),
    socket =
      process.platform === "win32"
        ? "\\\\.\\pipe\\docx-" + randomBytes(12).toString("hex")
        : join(root, "documents.sock");
  const old = process.env.HUB_DOCUMENT_SOCKET;
  process.env.HUB_DOCUMENT_SOCKET = socket;
  const payload = Buffer.from("immutable DOCX fixture"),
    pdf = Buffer.from("%PDF-fixture");
  let calls = 0,
    hold,
    release;
  const worker = createServer(async (req, res) => {
    calls++;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    assert.deepEqual(Buffer.concat(chunks), payload);
    if (hold) await hold;
    res.end(pdf);
  });
  worker.listen(socket);
  await once(worker, "listening");
  const config = configSchema.parse({
    hub: {
      publicBaseUrl: "https://docx.test",
      databasePath: join(root, "app.db"),
      resultsPath: join(root, "results"),
    },
    auth: {},
    machines: [],
    projects: [],
  });
  const setupToken = randomBytes(32).toString("base64url");
  const { app } = await createApp(config, { setupToken });
  t.after(async () => {
    release?.();
    await app.close();
    worker.closeAllConnections();
    await new Promise((r) => worker.close(r));
    if (old === undefined) delete process.env.HUB_DOCUMENT_SOCKET;
    else process.env.HUB_DOCUMENT_SOCKET = old;
    await rm(root, { recursive: true, force: true });
  });
  const origin = config.hub.publicBaseUrl;
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    headers: { origin },
    payload: { token: setupToken, password: randomBytes(24).toString("base64url") },
  });
  assert.equal(login.statusCode, 200);
  const headers = {
    origin,
    cookie: login.headers["set-cookie"].split(";")[0],
    "x-csrf-token": login.json().csrf,
    "content-type": "application/octet-stream",
  };
  const send = (h) =>
    app.inject({ method: "POST", url: "/api/previews/docx", headers: h, payload });
  assert.equal((await send({ "content-type": "application/octet-stream" })).statusCode, 401);
  assert.equal((await send({ ...headers, "x-csrf-token": "" })).statusCode, 403);
  assert.equal(calls, 0);
  const result = await send(headers);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Buffer.from(result.json().pdf, "base64"), pdf);
  assert.match(result.headers["cache-control"], /no-store/);
  hold = new Promise((r) => (release = r));
  const pending = send(headers);
  while (calls < 2) await new Promise((r) => setTimeout(r, 10));
  assert.equal((await send(headers)).statusCode, 429);
  const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers });
  assert.equal(logout.statusCode, 200);
  release();
  assert.equal((await pending).statusCode, 401);
});
