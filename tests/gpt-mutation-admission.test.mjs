import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GptDeletions } from "../apps/hub/dist/gpt-deletions.js";
import { GptOperations } from "../apps/hub/dist/gpt-operations.js";
import { GptProjectContent } from "../apps/hub/dist/gpt-project-content.js";
import { GptWorkspaceWork } from "../apps/hub/dist/gpt-workspace.js";
import { Library } from "../apps/hub/dist/library.js";
import { Store } from "../apps/hub/dist/store.js";
import { NativeDispatchReceipts } from "../ops/gpt-native/dispatch-receipts.mjs";
import { NativeLibraryReceipts } from "../ops/gpt-native/library-receipts.mjs";
import { NativeOperationReceipts } from "../ops/gpt-native/operation-receipts.mjs";
import { NativeProjectReceipts } from "../ops/gpt-native/project-receipts.mjs";
import { NativeReadService } from "../ops/gpt-native/service.mjs";
import { NativeWorkspaceReceipts } from "../ops/gpt-native/workspace-receipts.mjs";
import { nativeWorkspaceFixture } from "./fixtures/native-workspace.mjs";
import { handoffFixture } from "./handoff-fixture.mjs";

const revision = "a".repeat(64);
const graph = (conversationId) => ({
  conversation_id: conversationId,
  current_node: "a",
  gizmo_id: "g-p-other",
  mapping: {
    u: {
      id: "u",
      parent: null,
      message: {
        id: "u",
        author: { role: "user" },
        content: { content_type: "text", parts: ["Before"] },
      },
    },
    a: {
      id: "a",
      parent: "u",
      message: {
        id: "a",
        author: { role: "assistant" },
        channel: "final",
        status: "finished_successfully",
        content: { content_type: "text", parts: ["Answer"] },
      },
    },
  },
});
function ledger(t) {
  const root = mkdtempSync(join(tmpdir(), "mutation-admission-"));
  chmodSync(root, 0o700);
  const options = {
    path: join(root, "receipts"),
    userId: randomUUID(),
    accountFingerprint: "b".repeat(64),
    conversationIds: [],
    ownerMode: true,
  };
  const a = randomUUID(),
    b = randomUUID();
  let dispatch = new NativeDispatchReceipts(options);
  const writes = [],
    membership = new Map([
      [a, "g-p-busy"],
      [b, "g-p-other"],
    ]);
  const reader = {
    dispatchText: async (r) => {
      writes.push(["send", r.conversationId]);
      throw Error("lost ack");
    },
    readConversation: async (r) => ({
      conversationId: r.conversationId,
      projectId: membership.get(r.conversationId) ?? null,
    }),
    readConversationGraph: async (r) => graph(r.conversationId),
    selectConversation: async () => {},
    inspectConversation: async () => ({
      selected: true,
      composerReady: true,
      stopAvailable: false,
      hasDraft: false,
    }),
    selectSettings: async () => {},
    readModels: async () => ({
      versions: [
        {
          id: "latest",
          enabled: true,
          presets: [{ id: 1, available: true, model: "model", effort: "standard" }],
        },
      ],
    }),
    mutateOperation: async (r) => {
      writes.push(["edit", r.conversationId]);
      throw Error("lost ack");
    },
    readLibrary: async (r) => ({
      exists: true,
      name: "Before",
      canWrite: true,
      projectId: membership.get(r.id) ?? null,
    }),
    mutateLibrary: async (r) => {
      writes.push(["library", r.id]);
      throw Error("lost ack");
    },
    inspectProject: async (r) => ({
      id: r.projectId,
      canWrite: true,
      instructions: "Before",
      revision,
      files: [],
    }),
    mutateProject: async (r) => {
      writes.push(["project", r.projectId]);
      throw Error("lost ack");
    },
    createProject: async (r) => {
      writes.push(["create", r.key]);
      throw Error("lost ack");
    },
    workspace: async (r) => {
      if (r.operation === "workspaceMutation") {
        writes.push(["schedule", r.input.id]);
        throw Error("lost ack");
      }
      if (r.operation === "scheduledRead") return { item: { id: r.id, enabled: true } };
      throw Error("Unrelated activity must not be inspected");
    },
  };
  t.after(() => {
    dispatch.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    a,
    b,
    reader,
    writes,
    membership,
    root,
    options,
    get dispatch() {
      return dispatch;
    },
    reopen() {
      dispatch.close();
      dispatch = new NativeDispatchReceipts(options);
    },
    send(id = a, extra = {}) {
      return dispatch.dispatch(
        {
          key: randomUUID(),
          conversationId: id,
          userMessageId: randomUUID(),
          parentId: randomUUID(),
          versionId: "latest",
          presetId: 1,
          model: "model",
          effort: "standard",
          text: "Prompt",
          intentPersisted: true,
          ...extra,
        },
        reader,
      );
    },
  };
}

test("uncertain native send survives restart while unrelated edit, library, project, schedule and creation proceed", async (t) => {
  for (const kind of ["edit", "library", "project", "schedule", "create"])
    await t.test(kind, async (t) => {
      const f = ledger(t);
      await f.send();
      const saved = f.dispatch.db.prepare("SELECT * FROM receipts").all();
      f.reopen();
      const key = randomUUID();
      if (kind === "edit") {
        const r = {
          key,
          conversationId: f.b,
          action: "edit",
          messageId: "u",
          currentNode: "a",
          text: "After",
          model: "latest",
          effort: "1",
        };
        const ops = new NativeOperationReceipts(f.dispatch);
        assert.equal((await ops.run(r, f.reader)).state, "unknown");
        await ops.run(r, f.reader);
        assert.equal(f.writes.length, 2);
        await assert.rejects(ops.run({ ...r, key: randomUUID() }, f.reader), /PENDING_DISPATCH/);
      } else if (kind === "library") {
        const ops = new NativeLibraryReceipts(f.dispatch),
          r = { key, kind: "thread", id: f.b, action: "rename", name: "After" };
        assert.equal((await ops.run(r, f.reader)).state, "unknown");
        await ops.run(r, f.reader);
        assert.equal(f.writes.length, 2);
        await assert.rejects(
          ops.run({ ...r, key: randomUUID(), id: f.a }, f.reader),
          /PENDING_DISPATCH/,
        );
      } else if (kind === "project") {
        const ops = new NativeProjectReceipts(f.dispatch),
          r = { key, projectId: "g-p-other", revision, action: "instructions", text: "After" };
        assert.equal((await ops.execute(r, f.reader)).state, "unknown");
        await ops.execute(r, f.reader);
        assert.equal(f.writes.length, 2);
        await assert.rejects(
          ops.execute({ ...r, key: randomUUID(), projectId: "g-p-busy" }, f.reader),
          /PENDING_DISPATCH/,
        );
      } else if (kind === "schedule") {
        const ops = new NativeWorkspaceReceipts(f.dispatch),
          r = { key, input: { kind: "schedule", id: "schedule-a", action: "pause", revision } };
        assert.equal((await ops.run(r, f.reader)).state, "unknown");
        await ops.run(r, f.reader);
        assert.equal(f.writes.length, 2);
        await assert.rejects(ops.run({ ...r, key: randomUUID() }, f.reader), /PENDING_DISPATCH/);
        assert.equal(
          (await ops.run({ key: randomUUID(), input: { ...r.input, id: "schedule-b" } }, f.reader))
            .state,
          "unknown",
        );
      } else {
        const other = randomUUID(),
          ops = new NativeProjectReceipts(f.dispatch, [], [key, other]);
        await assert.rejects(ops.create({ key, name: "One" }, f.reader), /lost ack/);
        await ops.create({ key, name: "One" }, f.reader);
        assert.equal(f.writes.length, 2);
        await assert.rejects(ops.create({ key: other, name: "Two" }, f.reader), /lost ack/);
      }
      assert.deepEqual(f.dispatch.db.prepare("SELECT * FROM receipts").all(), saved);
      assert.equal(f.writes.filter((x) => x[0] === "send").length, 1);
      assert.equal(f.dispatch.blocksDispatch(f.a), true);
    });
});

test("project membership is canonical, new-chat keys stay independent, and known fork/creation targets stay protected", async (t) => {
  const f = ledger(t),
    candidate = randomUUID();
  const key = randomUUID();
  await f.send(null, { key });
  await f.send(null); // Null IDs do not define a shared conversation.
  f.dispatch.candidate(key, candidate);
  assert.equal(f.dispatch.blocksDispatch(candidate), true);
  assert.equal(f.dispatch.blocksDispatch(f.b), false);
  f.membership.set(candidate, "g-p-other");
  await assert.rejects(
    f.dispatch.assertProject({ projectId: "g-p-other" }, f.reader),
    /PENDING_DISPATCH/,
  );
  f.reader.readConversation = async () => {
    throw Error("offline");
  };
  await assert.rejects(
    f.dispatch.assertProject({ projectId: "g-p-unrelated" }, f.reader),
    /SCOPE_UNAVAILABLE/,
  );
  const fork = randomUUID();
  f.dispatch.db
    .prepare("INSERT INTO operation_receipts VALUES(?,?,?,?,?,'unknown')")
    .run(randomUUID(), "hash", JSON.stringify({ conversationId: f.a }), "{}", fork);
  assert.equal(f.dispatch.blocksDispatch(fork), true);
});

test("uncertain project mutations block only their member chats and survive client-supplied wrong scope", async (t) => {
  const f = ledger(t);
  const ops = new NativeProjectReceipts(f.dispatch);
  await ops.execute(
    { key: randomUUID(), projectId: "g-p-busy", revision, action: "instructions", text: "After" },
    f.reader,
  );
  await assert.rejects(f.send(f.a, { projectId: "g-p-other" }), /PENDING_DISPATCH/);
  await f.send(f.b);
  await assert.rejects(f.send(null, { projectId: "g-p-busy" }), /PENDING_DISPATCH/);
  await f.send(null, { projectId: "g-p-other" });
});

test("Hub permits unrelated actions beside an old job and unknown library receipt, preserving same-chat exclusion", async (t) => {
  const native = nativeWorkspaceFixture(),
    other = randomUUID();
  let calls = 0;
  native.client.libraryMutation = async (r) => {
    calls++;
    return { state: "unknown", name: "Before", projectId: null };
  };
  const f = await handoffFixture(undefined, undefined, { nativeGpt: native.workspace });
  t.after(() => f.close());
  const job = randomUUID();
  f.store.db
    .prepare(
      "INSERT INTO gpt_jobs(id,fingerprint,nativeId,text,files,model,effort,status,answer,assets,error,createdAt,updatedAt) VALUES(?,'proof',?,'Saved','[]','latest','1','unknown','','[]','',1,1)",
    )
    .run(job, native.conversationId);
  const saved = f.store.db.prepare("SELECT * FROM gpt_jobs WHERE id=?").get(job);
  const post = (id, key = randomUUID()) =>
    f.app.inject({
      method: "POST",
      url: "/api/library/gpt/thread/" + id,
      headers: { ...f.headers, "idempotency-key": key },
      payload: { action: "rename", name: "After" },
    });
  assert.equal((await post(native.conversationId)).json().error.code, "GPT_BUSY");
  assert.equal((await post(other)).json().error.code, "GPT_LIBRARY_UNKNOWN");
  assert.equal(calls, 1);
  assert.equal((await post(randomUUID())).json().error.code, "GPT_LIBRARY_UNKNOWN");
  assert.equal(calls, 2);
  assert.equal((await post(other)).statusCode, 409);
  assert.equal(calls, 2);
  assert.deepEqual(f.store.db.prepare("SELECT * FROM gpt_jobs WHERE id=?").get(job), saved);
  assert.equal(native.state.sends, 0);
});

test("Hub workers track separate chat/project/schedule work and do not mistake admission refusal for a lost acknowledgement", async (t) => {
  for (const kind of ["chat", "project", "schedule"])
    await t.test(kind, async (t) => {
      const store = new Store(":memory:"),
        controller = new AbortController(),
        holds = new Map();
      const blocked = (id) => {
        const promise = Promise.withResolvers();
        holds.set(id, promise);
        return promise.promise;
      };
      let service, input;
      if (kind === "chat") {
        service = new GptOperations(
          store,
          async (path, r) => {
            if (path.startsWith("/conversation?"))
              return graph(new URL(path, "http://fixture").searchParams.get("id"));
            if (path === "/native-operation") return blocked(r.nativeId);
            throw Error("Unexpected global activity query");
          },
          () => true,
          () => {},
          controller.signal,
          true,
        );
        input = (id) => ({
          nativeId: id,
          messageId: "u",
          currentNode: "a",
          action: "edit",
          text: "After",
          model: "latest",
          effort: "1",
        });
      } else if (kind === "project") {
        service = new GptProjectContent(
          store,
          async () => {
            throw Error("Unexpected browser call");
          },
          () => true,
          () => {},
          controller.signal,
          {
            read: async (id) => ({
              id,
              name: "Project",
              instructions: "Before",
              revision,
              canWrite: true,
              files: [],
            }),
            execute: async (_key, r) => blocked(r.projectId),
            check: async () => ({ state: "unknown" }),
          },
        );
        input = (id) => ({ projectId: id, revision, action: "instructions", text: "After" });
      } else {
        const scheduled = (id) => ({
          id,
          title: "Task",
          prompt: "Before",
          enabled: true,
          schedule: "daily",
          displaySchedule: "daily",
          timezone: "UTC",
          timing: "exact_schedule",
          nextRuns: [],
          lastRun: null,
          conversationId: null,
          eventDriven: false,
          canEdit: true,
          canDelete: true,
          revision,
        });
        service = new GptWorkspaceWork(
          store,
          async (path, r) => {
            if (path.startsWith("/scheduled/item"))
              return { item: scheduled(new URL(path, "http://fixture").searchParams.get("id")) };
            if (path === "/workspace-mutation") return blocked(r.id);
            throw Error("Unexpected global activity query");
          },
          () => true,
          true,
        );
        input = (id) => ({ kind: "schedule", id, revision, action: "pause" });
      }
      const a = kind === "project" ? "g-p-a" : randomUUID(),
        b = kind === "project" ? "g-p-b" : randomUUID();
      const ka = randomUUID(),
        kb = randomUUID();
      try {
        service.start(ka, input(a));
        service.start(kb, input(b));
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(holds.size, 2);
        assert.throws(() => service.start(randomUUID(), input(a)), /Сначала/);
        holds.get(a).reject(Error("lost ack"));
        holds.get(b).reject(Error("NATIVE_PENDING_DISPATCH"));
        await service.close();
        const table =
          kind === "chat"
            ? "gpt_native_operations"
            : kind === "project"
              ? "gpt_project_operations"
              : "commands";
        const key = kind === "schedule" ? "key" : "id";
        assert.equal(
          store.db.prepare(`SELECT state FROM ${table} WHERE ${key}=?`).get(ka).state,
          "unknown",
        );
        assert.equal(
          store.db.prepare(`SELECT state FROM ${table} WHERE ${key}=?`).get(kb).state,
          "failed",
        );
        assert.throws(() => service.start(randomUUID(), input(a)), /Сначала/);
      } finally {
        controller.abort();
        for (const hold of holds.values()) hold.reject(Error("cleanup"));
        await service.close();
        store.close();
      }
    });
});

test("background deletion skips a busy chat without dropping receipts or bypassing account spacing", async (t) => {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const a = randomUUID(),
    b = randomUUID(),
    calls = [];
  let now = 100;
  const queue = new GptDeletions(
    store,
    new Library(store, "gpt"),
    {
      client: {
        libraryMutation: async (r, check) => {
          calls.push({ r, check });
          return { state: "unknown" };
        },
      },
    },
    () => now,
  );
  queue.enqueue(randomUUID(), a);
  queue.enqueue(randomUUID(), b);
  const saved = store.db.prepare("SELECT * FROM gpt_deletions WHERE id=?").get(a);
  await queue.tick(
    () => {},
    () => true,
    (id) => id !== a,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].r.id, b);
  assert.equal(calls[0].check, false);
  assert.deepEqual(store.db.prepare("SELECT * FROM gpt_deletions WHERE id=?").get(a), saved);
  now += 30000;
  await queue.tick(
    () => {},
    () => true,
    () => true,
  );
  assert.equal(calls.length, 1, "unknown result keeps account-wide backoff");
  now += 30000;
  await queue.tick(
    () => {},
    () => true,
    (id) => id !== a,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].check, true);
  assert.equal(calls[1].r.key, calls[0].r.key);
});

test("service preserves the single writer, manual account lease and owner binding with narrowed receipt admission", async (t) => {
  const f = ledger(t);
  await f.send();
  const service = new NativeReadService({
    reader: f.reader,
    ...f.options,
    statePath: join(f.root, "manual"),
    canary: f.dispatch,
  });
  service.library = new NativeLibraryReceipts(f.dispatch);
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers();
  f.reader.mutateLibrary = async () => {
    entered.resolve();
    await release.promise;
    throw Error("lost ack");
  };
  const r = {
    userId: f.options.userId,
    operation: "libraryMutation",
    key: randomUUID(),
    kind: "thread",
    id: f.b,
    action: "rename",
    name: "After",
  };
  const work = service.request(r);
  await entered.promise;
  try {
    await assert.rejects(service.request({ ...r, key: randomUUID() }), /BUSY/);
    await assert.rejects(
      service.request({ operation: "beginManual", userId: r.userId, leaseId: randomUUID() }),
      /BUSY/,
    );
    await assert.rejects(service.request({ ...r, userId: randomUUID() }), /WRONG_OWNER/);
    assert.equal((await service.request({ operation: "status", userId: r.userId })).busy, true);
  } finally {
    release.resolve();
  }
  assert.equal((await work).state, "unknown");
  await service.request({ operation: "beginManual", userId: r.userId, leaseId: randomUUID() });
  await assert.rejects(
    service.request({ ...r, id: randomUUID(), key: randomUUID() }),
    /MANUAL_RECOVERY/,
  );
  assert.equal(f.dispatch.pending(), true, "manual lease does not clear receipts");
});

test("a busy confirmation after accepted edit stays uncertain, never becomes an unsent retry", async (t) => {
  const store = new Store(":memory:"),
    controller = new AbortController();
  const service = new GptOperations(
    store,
    async (path) => {
      if (path.startsWith("/conversation?")) return graph("chat");
      if (path === "/native-operation") return { dispatched: true };
      if (path === "/native-operation/check") throw Error("NATIVE_BUSY");
      throw Error("Unexpected read");
    },
    () => true,
    () => {},
    controller.signal,
    true,
  );
  t.after(async () => {
    controller.abort();
    await service.close();
    store.close();
  });
  const key = randomUUID();
  service.start(key, {
    nativeId: "chat",
    messageId: "u",
    currentNode: "a",
    action: "edit",
    text: "After",
    model: "latest",
    effort: "1",
  });
  await service.close();
  assert.equal(service.get(key).state, "unknown");
  assert.equal(service.list("other").blocked, false);
  assert.equal(service.list(undefined, true).blocked, false);
  assert.equal(service.list("chat").blocked, true);
  assert.equal(service.list().blocked, true, "maintenance still sees uncertainty");
});
