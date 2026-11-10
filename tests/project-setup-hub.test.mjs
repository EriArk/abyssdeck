import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { agentTemplate, HubError } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const input = {
  machineId: "pc",
  name: "Wizard",
  workingDirectory: "C:/Wizard",
  createDirectory: true,
  repository: { mode: "none", owner: "", name: "", description: "", visibility: "private" },
};
const inspection = {
  exists: false,
  empty: true,
  git: false,
  branch: "",
  head: "",
  origin: "",
  dirty: false,
  steps: ["create-directory", "register-project"],
  fingerprint: "a".repeat(64),
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (await fn()) return;
    await tick();
  }
  assert.fail("Operation did not settle");
}
test("project setup requires auth and review, serializes exact retries and only registers confirmed files", async (t) => {
  let applies = 0,
    inspections = 0,
    release;
  const gate = new Promise((resolve) => (release = resolve));
  const f = await handoffFixture(undefined, undefined, {
    projectSetupProbe: async (_m, r) => {
      if (r.op === "inspect") {
        inspections++;
        return inspection;
      }
      if (r.op === "status") return null;
      applies++;
      await gate;
      return { id: r.id, state: "complete", phase: "register-project" };
    },
  });
  t.after(() => f.close());
  const registrations = [];
  f.sessions.catalog.refresh = async () => {};
  f.sessions.catalog.createProject = async (...args) => {
    registrations.push(args);
    return { id: "created", name: "Wizard", machineId: "pc", workingDirectory: "C:/Wizard" };
  };
  const id = randomUUID(),
    request = {
      method: "POST",
      url: "/api/project-setup/prepare",
      headers: { ...f.headers, "idempotency-key": id },
      payload: input,
    };
  assert.equal((await f.app.inject({ ...request, headers: {} })).statusCode, 401);
  const [a, b] = await Promise.all([f.app.inject(request), f.app.inject(request)]);
  assert.equal(a.statusCode, 200);
  assert.deepEqual(a.json(), b.json());
  assert.equal(inspections, 1);
  assert.equal(applies, 0);
  assert.equal(
    (await f.app.inject({ ...request, payload: { ...input, name: "Other" } })).statusCode,
    409,
  );
  const execute = {
    method: "POST",
    url: `/api/project-setup/${id}/execute`,
    headers: f.headers,
    payload: {},
  };
  await Promise.all([f.app.inject(execute), f.app.inject(execute)]);
  assert.equal(applies, 1);
  assert.equal(registrations.length, 0);
  const second = randomUUID();
  await f.app.inject({ ...request, headers: { ...request.headers, "idempotency-key": second } });
  assert.equal(
    (await f.app.inject({ ...execute, url: `/api/project-setup/${second}/execute` })).statusCode,
    409,
  );
  release();
  await until(
    async () =>
      (await f.app.inject({ url: `/api/project-setup/${id}`, headers: f.headers })).json().state ===
      "complete",
  );
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0][4], id);
  assert.equal((await f.app.inject(execute)).json().state, "complete");
  assert.equal(applies, 1);
  assert.equal(f.calls.filter((c) => ["thread/resume", "turn/start"].includes(c.method)).length, 0);
});
test("unknown setup and lost native registration acknowledgements recover by identity without duplicate projects", async (t) => {
  let confirmed = false,
    registrations = 0;
  const f = await handoffFixture(undefined, undefined, {
    projectSetupProbe: async (_m, r) =>
      r.op === "inspect"
        ? inspection
        : {
            id: r.id,
            state: confirmed ? "complete" : "unknown",
            phase: "register-project",
            error: "SETUP_UNAVAILABLE",
          },
  });
  t.after(() => f.close());
  const projects = f.sessions.config.projects;
  f.sessions.catalog.refresh = async () => {};
  f.sessions.catalog.createProject = async () => {
    registrations++;
    projects.push({
      id: "created",
      name: "Wizard",
      machineId: "pc",
      workingDirectory: "C:/Wizard",
      enabled: true,
    });
    throw Error("native acknowledgement lost");
  };
  const id = randomUUID();
  await f.app.inject({
    method: "POST",
    url: "/api/project-setup/prepare",
    headers: { ...f.headers, "idempotency-key": id },
    payload: input,
  });
  const execute = () =>
    f.app.inject({
      method: "POST",
      url: `/api/project-setup/${id}/execute`,
      headers: f.headers,
      payload: {},
    });
  const read = async () =>
    (await f.app.inject({ url: `/api/project-setup/${id}`, headers: f.headers })).json();
  await execute();
  await until(async () => (await read()).state === "unknown");
  assert.equal(registrations, 0);
  confirmed = true;
  await execute();
  await until(async () => (await read()).state === "unknown");
  assert.equal(registrations, 1);
  await execute();
  await until(async () => (await read()).state === "complete");
  assert.equal(registrations, 1);
  assert.equal((await read()).project.id, "created");
});
test("late setup status cannot roll a completed Hub operation back to running", async (t) => {
  let finishApply, finishRead;
  const f = await handoffFixture(undefined, undefined, {
    projectSetupProbe: async (_m, r) => {
      if (r.op === "inspect") return inspection;
      if (r.op === "status")
        return await new Promise(
          (resolve) => (finishRead = () => resolve({ id: r.id, state: "running", phase: "clone" })),
        );
      return await new Promise(
        (resolve) =>
          (finishApply = () => resolve({ id: r.id, state: "complete", phase: "register-project" })),
      );
    },
  });
  t.after(() => f.close());
  f.sessions.catalog.refresh = async () => {};
  f.sessions.catalog.createProject = async () => ({ id: "created", ...input });
  const id = randomUUID();
  await f.app.inject({
    method: "POST",
    url: "/api/project-setup/prepare",
    headers: { ...f.headers, "idempotency-key": id },
    payload: input,
  });
  await f.app.inject({
    method: "POST",
    url: `/api/project-setup/${id}/execute`,
    headers: f.headers,
    payload: {},
  });
  const read = f.app.inject({ url: `/api/project-setup/${id}`, headers: f.headers });
  await until(() => finishRead);
  finishApply();
  await until(
    () =>
      f.store.db.prepare("SELECT state FROM project_setup_operations WHERE id=?").get(id).state ===
      "complete",
  );
  finishRead();
  assert.equal((await read).json().state, "complete");
});

test("advanced setup keeps helper contract unchanged and applies profile once after registration", async (t) => {
  const seen = [];
  const f = await handoffFixture(undefined, undefined, {
    projectSetupProbe: async (_m, r) => {
      if (r.input) assert.equal(r.input.agentProfile, undefined);
      if (r.op === "inspect") return inspection;
      return { id: r.id, state: "complete", phase: "register-project" };
    },
  });
  t.after(() => f.close());
  f.sessions.catalog.refresh = async () => {};
  f.sessions.catalog.createProject = async () => f.sessions.project("project");
  f.projectGpts.rules = async (id, rules) => {
    seen.push({ id, rules });
  };
  const id = randomUUID(),
    profile = agentTemplate("hardware");
  const r = await f.app.inject({
    method: "POST",
    url: "/api/project-setup/prepare",
    headers: { ...f.headers, "idempotency-key": id },
    payload: { ...input, agentProfile: profile },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json().input.agentProfile, profile);
  const request = {
    method: "POST",
    url: `/api/project-setup/${id}/execute`,
    headers: f.headers,
    payload: {},
  };
  await f.app.inject(request);
  await until(() => seen.length === 1);
  await f.app.inject(request);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].rules.agentProfile, profile);
});

test("failed setup reads do not claim a saved creation, and recovery retains exact creation receipts", async (t) => {
  let available = false,
    applies = 0;
  const f = await handoffFixture(undefined, undefined, {
    projectSetupProbe: async (_m, request) => {
      if (request.op === "apply") applies++;
      if (!available || request.op === "apply")
        throw new HubError(
          503,
          "SETUP_UNAVAILABLE",
          "Настройка проекта не ответила. Состояние операции сохранено.",
        );
      return request.op === "inspect" ? inspection : null;
    },
  });
  t.after(() => f.close());
  const key = randomUUID(),
    prepare = {
      method: "POST",
      url: "/api/project-setup/prepare",
      headers: { ...f.headers, "idempotency-key": key },
      payload: input,
    };
  for (const req of [
    { url: "/api/machines/pc/github-repositories", headers: f.headers },
    prepare,
  ]) {
    const result = await f.app.inject(req);
    assert.equal(result.statusCode, 503);
    assert.match(result.body, /Создание ещё не запускалось/);
    assert.doesNotMatch(result.body, /Состояние операции сохранено/);
  }
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM project_setup_operations").get().n, 0);
  assert.equal(applies, 0);
  available = true;
  assert.equal((await f.app.inject(prepare)).json().id, key);
  await f.app.inject({
    method: "POST",
    url: `/api/project-setup/${key}/execute`,
    headers: f.headers,
    payload: {},
  });
  await until(
    async () =>
      (await f.app.inject({ url: `/api/project-setup/${key}`, headers: f.headers })).json()
        .state === "unknown",
  );
  const receipt = (
    await f.app.inject({ url: `/api/project-setup/${key}`, headers: f.headers })
  ).json();
  assert.match(receipt.error, /Состояние операции сохранено/);
  assert.equal(receipt.id, key);
  assert.equal(applies, 1);
});

test("explicit Linux folder setup activates the exact recovered child without attaching it to its parent", async (t) => {
  const root = "/Projects";
  const f = await handoffFixture(undefined, undefined, {
    configure(c) {
      c.machines[0].type = "local-linux";
      c.projects[0].workingDirectory = root;
      c.projects[0].name = "AbyssDeck";
    },
    projectSetupProbe: async (_m, r) =>
      r.op === "inspect" ? inspection : { id: r.id, state: "complete", phase: "register-project" },
  });
  t.after(() => f.close());
  f.sessions.catalog.refresh = async () => {};
  const child = {
    id: "recovered-child",
    sourceId: "native-child",
    recoverySourceId: "old-child",
    machineId: "pc",
    name: "Old name",
    workingDirectory: root + "/Child",
    roots: [root + "/Child"],
    enabled: true,
  };
  f.store.db
    .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
    .run(child.id, "pc", child.sourceId, JSON.stringify(child));
  const saved = f.store.createThread(child.id, "old-thread", "Saved history");
  f.store.db.prepare("UPDATE threads SET historyMode='saved' WHERE id=?").run(saved.id);
  assert.equal(f.sessions.catalog.isServerArchived(child), true);
  const mutations = [];
  const nativeRequest = f.rpc.request.bind(f.rpc);
  f.rpc.request = async (method, params) => {
    if (method !== "project/update") return nativeRequest(method, params);
    mutations.push({ method, params });
    assert.equal(params.projectId, child.sourceId);
    return {
      project: { id: child.sourceId, name: params.name, roots: [{ path: child.workingDirectory }] },
    };
  };
  const id = randomUUID();
  const prepared = await f.app.inject({
    method: "POST",
    url: "/api/project-setup/prepare",
    headers: { ...f.headers, "idempotency-key": id },
    payload: {
      ...input,
      name: "New name",
      workingDirectory: child.workingDirectory,
      createDirectory: false,
    },
  });
  assert.equal(prepared.statusCode, 200);
  await f.app.inject({
    method: "POST",
    url: `/api/project-setup/${id}/execute`,
    headers: f.headers,
    payload: {},
  });
  const read = async () =>
    (await f.app.inject({ url: `/api/project-setup/${id}`, headers: f.headers })).json();
  await until(async () => (await read()).state === "complete");
  const result = (await read()).project;
  assert.equal(result.id, child.id);
  assert.equal(result.name, "New name");
  assert.equal(result.serverArchived, false);
  assert.equal(result.workingDirectory, child.workingDirectory);
  assert.equal(f.sessions.project("project").name, "AbyssDeck");
  assert.equal(f.sessions.project("project").workingDirectory, root);
  assert.equal(f.store.thread(saved.id).historyMode, "saved");
  assert.equal(f.store.thread(saved.id).projectId, child.id);
  assert.deepEqual(
    mutations.map((c) => c.method),
    ["project/update"],
  );
  // The durable activation survives metadata refresh; it does not need a new chat.
  assert.equal(
    f.sessions.catalog.library.get("project", child.id).activatedSourceId,
    child.sourceId,
  );
});

test("a parent project and missing/deleted recovered groups cannot swallow a new child registration", async (t) => {
  for (const state of ["fresh", "missing", "deleted"]) {
    const f = await handoffFixture(undefined, undefined, {
      configure(c) {
        c.machines[0].type = "local-linux";
        c.projects[0].workingDirectory = "/Projects";
      },
      projectSetupProbe: async (_m, r) =>
        r.op === "inspect"
          ? inspection
          : { id: r.id, state: "complete", phase: "register-project" },
    });
    t.after(() => f.close());
    f.sessions.catalog.refresh = async () => {};
    const path = "/Projects/Child";
    if (state !== "fresh") {
      const p = {
        id: "old-child",
        machineId: "pc",
        name: "Old",
        workingDirectory: path,
        enabled: true,
        recoverySourceId: "old",
        ...(state === "deleted" ? { sourceId: "deleted-native" } : {}),
      };
      f.store.db
        .prepare("INSERT INTO catalog_projects VALUES(?,?,?,?)")
        .run(p.id, "pc", p.sourceId ?? "old", JSON.stringify(p));
      if (state === "deleted") f.sessions.catalog.library.save("project", p.id, { deleted: true });
    }
    const calls = [];
    f.sessions.catalog.createProject = async (...args) => {
      calls.push(args);
      return { id: "new-child", machineId: "pc", name: "Child", workingDirectory: path };
    };
    const id = randomUUID();
    await f.app.inject({
      method: "POST",
      url: "/api/project-setup/prepare",
      headers: { ...f.headers, "idempotency-key": id },
      payload: { ...input, name: "Child", workingDirectory: path, createDirectory: false },
    });
    await f.app.inject({
      method: "POST",
      url: `/api/project-setup/${id}/execute`,
      headers: f.headers,
      payload: {},
    });
    const read = async () =>
      (await f.app.inject({ url: `/api/project-setup/${id}`, headers: f.headers })).json();
    await until(async () => (await read()).state === "complete");
    assert.equal((await read()).project.id, "new-child", state);
    assert.equal(calls.length, 1, state);
    assert.deepEqual(calls[0], ["pc", "Child", path, false, id]);
  }
});
