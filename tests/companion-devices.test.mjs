import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { tokenHash } from "../apps/hub/dist/auth.js";
import { CompanionDevices, registerCompanion } from "../apps/hub/dist/companion-devices.js";
import { MachineEnrollmentStore } from "../apps/hub/dist/machine-enrollment-store.js";
import { Store } from "../apps/hub/dist/store.js";
import { TeamAuth, teamPasswordHash } from "../apps/hub/dist/team-auth.js";
import { TeamStore } from "../apps/hub/dist/team-store.js";
import Fastify from "../apps/hub/node_modules/fastify/fastify.js";
import { configSchema } from "../packages/shared/dist/index.js";

test("native Companion authentication stays scoped, revocable and separate from machine execution", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cw-companion-"));
  const config = configSchema.parse({
    hub: {
      publicBaseUrl: "https://companion.example.test",
      databasePath: join(root, "owner.db"),
      resultsPath: join(root, "results"),
    },
    auth: { username: "owner" },
    team: { enabled: true, root: "/fixture-team", hubTailnetAddress: "100.100.10.1" },
    machines: [],
    projects: [],
  });
  const store = new Store(config.hub.databasePath);
  store.db
    .prepare("INSERT INTO users VALUES(?,?)")
    .run("owner", await teamPasswordHash("fixture-password-only"));
  const token = randomBytes(32).toString("base64url"),
    csrf = randomBytes(32).toString("base64url");
  store.db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(tokenHash(token), csrf, Date.now() + 86400000);
  const registry = new TeamStore(":memory:", config, store),
    enrollments = new MachineEnrollmentStore(registry);
  const app = Fastify();
  new TeamAuth(config, store, registry).install(app);
  const maintenance = [];
  registerCompanion(
    app,
    config,
    new TeamAuth(config, store, registry),
    registry,
    enrollments,
    async (...args) => {
      maintenance.push(args);
      return { state: "waitingIdle", operationId: args[2] };
    },
  );
  for (const path of ["/api/team/users", "/api/auth/session", "/api/projects"])
    app.get(path, () => ({ ok: true }));
  app.setErrorHandler((error, req, reply) =>
    reply
      .code(error.name === "ZodError" ? 400 : (error.status ?? error.statusCode ?? 500))
      .send({ error: { message: error.message } }),
  );
  const hub = { app, registry, enrollments };
  t.after(async () => {
    await app.close();
    registry.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const cookie = {
    cookie: `__Host-codex-session=${token}`,
    "x-csrf-token": csrf,
    origin: config.hub.publicBaseUrl,
  };
  const request = (url, headers, payload) =>
    hub.app.inject({
      url,
      headers,
      method: payload === undefined ? "GET" : "POST",
      ...(payload === undefined ? {} : { payload }),
    });
  const identity = {
    sid: "S-1-5-21-123-456-789-1001",
    machineGuid: randomUUID(),
    computer: "fixture-pc",
    deviceId: "",
  };
  assert.equal(
    (await request("/api/team/companion", { ...cookie, "x-csrf-token": "wrong" }, identity))
      .statusCode,
    403,
  );
  const issued = await request("/api/team/companion", cookie, identity);
  assert.equal(issued.statusCode, 200, issued.body);
  const native = { authorization: `Bearer ${issued.json().token}` };
  const status = await request("/api/companion/status", native);
  assert.equal(status.statusCode, 200, status.body);
  assert.equal(status.json().user.id, hub.registry.ownerId);
  assert.equal(status.json().deviceId, "");
  assert.equal(status.json().originalOwner, true);
  for (const url of [
    "/api/team/users",
    "/api/auth/session",
    "/api/projects",
    "/api/companion/not-a-route",
  ])
    assert.notEqual((await request(url, native)).statusCode, 200, url);
  assert.equal(
    (await request("/api/companion/status", { ...native, cookie: cookie.cookie })).statusCode,
    401,
  );
  assert.equal(
    (await request("/api/companion/status", { ...native, origin: "https://foreign.example.test" }))
      .statusCode,
    401,
  );
  assert.equal((await request("/api/companion/update", cookie)).statusCode, 401);
  const updates = await request("/api/companion/update", native);
  assert.equal(updates.statusCode, 200, updates.body);
  assert.equal(updates.json().available, false);
  assert.equal(
    (await request("/api/companion/update/" + "a".repeat(64) + "/bundle", native)).statusCode,
    404,
  );
  const kit = await request("/api/companion/repair-kit", native);
  assert.equal(kit.statusCode, 200, kit.body);
  assert(kit.json().files.some((f) => f.name === "computer-use/ComputerUse.cs"));
  assert(!kit.json().files.some((f) => /connection\.json|auth\.json|device-session/.test(f.name)));
  const id = randomUUID(),
    enrollmentToken = randomBytes(32).toString("base64url");
  const keys = {
    command: "fixture-private-command",
    terminal: "fixture-private-terminal",
    commandPublic: "fixture-public-command",
    terminalPublic: "fixture-public-terminal",
  };
  hub.enrollments.create(hub.registry.ownerId, identity.computer, keys, {
    id,
    token: enrollmentToken,
  });
  const created = await request("/api/companion/enrollment", native, {
    id,
    token: enrollmentToken,
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().enrollment.id, id);
  assert.equal(
    hub.enrollments.row(id).keys,
    JSON.stringify(keys),
    "uncertain create reuses exact keys",
  );
  const bundle = await request(`/api/companion/enrollment/${id}/bundle`, native, {
    token: enrollmentToken,
  });
  assert.equal(bundle.statusCode, 200, bundle.body);
  assert.equal(
    (
      await request(`/api/companion/enrollment/${id}/bundle`, native, {
        token: randomBytes(32).toString("base64url"),
      })
    ).statusCode,
    404,
  );
  const devices = new CompanionDevices(hub.registry);
  config.machines.push({
    id: "main-windows",
    type: "ssh-windows",
    ssh: { target: "unused" },
    codex: { persistent: true },
  });
  const admitted = devices.issue(tokenHash(token), { ...identity, deviceId: "main-windows" });
  const migrationId = randomUUID(),
    admittedHeaders = { authorization: `Bearer ${admitted.token}` };
  assert.equal(
    (
      await request("/api/companion/maintenance", native, {
        operationId: migrationId,
        action: "acquire",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await request("/api/companion/maintenance", admittedHeaders, {
        operationId: migrationId,
        action: "acquire",
        machineId: "foreign",
      })
    ).statusCode,
    400,
  );
  const admission = await request("/api/companion/maintenance", admittedHeaders, {
    operationId: migrationId,
    action: "acquire",
  });
  assert.equal(admission.statusCode, 200, admission.body);
  assert.deepEqual(maintenance, [[hub.registry.ownerId, "main-windows", migrationId, "acquire"]]);
  hub.registry.revoke(hub.registry.ownerId, tokenHash(token));
  assert.throws(() => devices.read({ headers: native }), /Сессия|Войди/);
  assert.equal((await request("/api/companion/status", native)).statusCode, 401);
  const fresh = hub.registry.issueSession(hub.registry.ownerId);
  const second = devices.issue(tokenHash(fresh.token), identity);
  const secondHeaders = { authorization: `Bearer ${second.token}` };
  assert.equal((await request("/api/companion/logout", secondHeaders, {})).statusCode, 200);
  assert.equal((await request("/api/companion/status", secondHeaders)).statusCode, 401);
  assert(
    hub.registry.session(tokenHash(fresh.token)),
    "Companion logout leaves browser/native accounts intact",
  );
  const invitation = registry.invite(registry.ownerId, "Fixture member");
  const member = registry.accept(
    invitation.token,
    "fixture-member",
    "Fixture member",
    "fixture-digest",
    10,
  );
  const memberSession = registry.issueSession(member.id);
  const memberCookie = {
    cookie: `__Host-codex-session=${memberSession.token}`,
    "x-csrf-token": memberSession.csrf,
    origin: config.hub.publicBaseUrl,
  };
  assert.equal(
    (await request("/api/team/companion", memberCookie, { ...identity, deviceId: "main-windows" }))
      .statusCode,
    409,
    "member cannot label owner PC as their own",
  );
  const memberGrant = devices.issue(tokenHash(memberSession.token), identity);
  const memberHeaders = { authorization: `Bearer ${memberGrant.token}` };
  const memberStatus = await request("/api/companion/status", memberHeaders);
  assert.equal(memberStatus.json().user.role, "member");
  assert.equal(memberStatus.json().originalOwner, false);
  assert.equal(
    (
      await request(`/api/companion/enrollment/${id}/bundle`, memberHeaders, {
        token: enrollmentToken,
      })
    ).statusCode,
    404,
    "owner pairing token is insufficient for another account",
  );
  registry.setRole(registry.ownerId, member.id, "admin", "member");
  const afterRole = await request("/api/companion/status", memberHeaders);
  assert.equal(afterRole.statusCode, 401, "changed role invalidates the old scoped credential");
  const elevatedSession = registry.issueSession(member.id);
  const elevated = devices.issue(tokenHash(elevatedSession.token), identity);
  const elevatedStatus = await request("/api/companion/status", {
    authorization: `Bearer ${elevated.token}`,
  });
  assert.equal(
    elevatedStatus.json().user.role,
    "admin",
    "new role comes from Hub, not local flags",
  );
});
