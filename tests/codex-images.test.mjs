import assert from "node:assert/strict";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Catalog } from "../apps/hub/dist/catalog.js";
import { codexTimeline, unlinkedTurnWork } from "../apps/hub/dist/codex-results.js";
import { NativeImages } from "../apps/hub/dist/nativeImages.js";
import { Store } from "../apps/hub/dist/store.js";
import { codexImageSources } from "../packages/codex/dist/index.js";
import { configSchema } from "../packages/shared/dist/index.js";
import { handoffFixture } from "./handoff-fixture.mjs";

const sharp = createRequire(new URL("../apps/hub/package.json", import.meta.url))("sharp");
const png = (
  await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } })
    .png()
    .toBuffer()
).toString("base64");
const source = "data:image/png;base64," + png;
const outputs = [
  {
    type: "functionCallOutput",
    name: "exec",
    output: [{ type: "input_image", image_url: source }],
  },
  {
    type: "dynamicToolCall",
    tool: "observe",
    contentItems: [{ type: "inputImage", imageUrl: source }],
  },
  {
    type: "mcpToolCall",
    tool: "observe",
    result: { content: [{ type: "image", data: png, mimeType: "image/png" }] },
  },
  {
    type: "mcpToolCall",
    result: { content: [{ type: "resource", resource: { mimeType: "image/png", blob: png } }] },
  },
  { type: "imageGeneration", status: "completed", result: png, savedPath: "/tmp/other.png" },
];

test("native public image shapes are extracted without parsing private text/arguments or losing later images", () => {
  for (const item of outputs) assert.deepEqual(codexImageSources(item), [source]);
  assert.deepEqual(codexImageSources({ type: "imageView", path: "/tmp/screen.png" }), [
    "/tmp/screen.png",
  ]);
  assert.deepEqual(
    codexImageSources({ type: "agentMessage", text: "![screen](</tmp/screen.png>)" }),
    ["/tmp/screen.png"],
  );
  const content = Array.from({ length: 12 }, () => ({ type: "text", text: "public text" }));
  content.push({ type: "image", mimeType: "image/png", data: png });
  assert.deepEqual(codexImageSources({ type: "mcpToolCall", result: { content } }), [source]);
  for (const item of [
    { type: "reasoning", content: [source], summary: [source] },
    {
      type: "functionCallOutput",
      output: JSON.stringify([{ type: "input_image", image_url: source }]),
    },
    {
      type: "mcpToolCall",
      arguments: { image: source },
      result: { content: [{ type: "text", text: source }] },
    },
    {
      type: "dynamicToolCall",
      contentItems: [{ type: "inputImage", imageUrl: "https://127.0.0.1/private.png" }],
    },
    { type: "functionCallOutput", output: [{ type: "input_image", file_id: "unresolvable" }] },
    { type: "imageView", path: "../../private.png" },
  ])
    assert.deepEqual(codexImageSources(item), []);
});

test("history repairs tool images, retains snapshots before viewing, survives reopen, and isolates turns/threads", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-images-"));
  const store = new Store(":memory:");
  const config = configSchema.parse({
    hub: { publicBaseUrl: "https://image.test", databasePath: ":memory:", resultsPath: root },
    auth: {},
    machines: [{ id: "pc", name: "PC", type: "local-linux" }],
    projects: [{ id: "p", name: "P", machineId: "pc", workingDirectory: root }],
  });
  const path = join(root, "temporary.png");
  await writeFile(path, Buffer.from(png, "base64"));
  const entries = [
    { turnId: "turn", item: { type: "imageView", id: "view", path } },
    ...outputs.map((item, n) => ({ turnId: "turn", item: { ...item, id: "output-" + n } })),
  ];
  const calls = [];
  const rpc = {
    request: async (method) => {
      calls.push(method);
      if (method === "thread/read") return { thread: { id: "native", updatedAt: 1 } };
      if (method === "thread/items/list") return { data: entries, nextCursor: null };
      throw Error(method);
    },
  };
  const catalog = new Catalog(config, store, async () => rpc);
  try {
    const thread = store.createThread("p", "native", "Pictures");
    store.db.prepare("UPDATE threads SET origin='desktop' WHERE id=?").run(thread.id);
    const page = await catalog.history(store.thread(thread.id));
    assert.equal(page.messages.length, 6);
    assert(page.messages.every((m) => m.images.length === 1 && m.phase === "commentary"));
    await catalog.images.flush();
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM native_images WHERE artifactId IS NOT NULL").get().n,
      6,
    );
    await unlink(path);
    const restored = new NativeImages(config, store, () => {
      throw Error("Must use retained snapshot");
    });
    for (const m of page.messages)
      assert.equal((await restored.get(m.images[0].id)).mime, "image/png");
    const reopened = new Catalog(config, store, async () => rpc);
    assert.deepEqual(
      (await reopened.history(store.thread(thread.id))).messages.map((m) => m.images),
      page.messages.map((m) => m.images),
    );
    await reopened.closeChatLogs();
    assert.equal(store.results(thread.id, undefined, "images").items.length, 6);
    assert.equal(unlinkedTurnWork(store.db, thread.id, "turn").items.length, 6);
    assert(!JSON.stringify(page).includes("base64"));
    assert(!calls.some((m) => /start|resume/.test(m)));
    // A repeated item id/source in another turn or thread must remain independently navigable.
    catalog.observeImages(thread, "other-turn", { ...outputs[0], id: "output-0" });
    const other = store.createThread("p", "other", "Other");
    catalog.observeImages(other, "turn", { ...outputs[0], id: "output-0" });
    assert.notEqual(
      catalog.imageMessage(thread, "other-turn", { id: "output-0" }).images[0].id,
      catalog.imageMessage(thread, "turn", { id: "output-0" }).images[0].id,
    );
    assert.equal(unlinkedTurnWork(store.db, other.id, "turn").items.length, 1);
    // Legacy captured MCP results are reused, not duplicated or reassigned across turns.
    const legacy = catalog.images.register(thread.id, "result:legacy", source);
    store.result(thread.id, "old-turn", "image:" + legacy.id, "image", "Legacy", {
      url: legacy.url,
    });
    assert.deepEqual(
      catalog.observeImages(thread, "old-turn", { ...outputs[2], id: "legacy" }),
      [],
    );
    assert.equal(
      catalog.imageMessage(thread, "old-turn", { id: "legacy" }).images[0].id,
      legacy.id,
    );
  } finally {
    await catalog.closeChatLogs();
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("completed image events keep chat metadata and reasoning cards after turn completion, without binary event payloads", async () => {
  const f = await handoffFixture();
  try {
    const runtime = {
      rpc: f.rpc,
      loaded: new Set([f.thread.id]),
      active: new Set(),
      machineId: "pc",
      touched: 0,
    };
    const emit = (method, p) =>
      f.sessions.notification(runtime, method, {
        threadId: f.thread.codexThreadId,
        turnId: "turn",
        ...p,
      });
    emit("turn/started", { turn: { id: "turn" } });
    emit("item/completed", { item: { ...outputs[0], id: "exec-output" } });
    emit("turn/completed", { turn: { id: "turn", status: "completed" } });
    await f.sessions.catalog.images.flush();
    const events = f.store.events(f.thread.id);
    const message = events.find((e) => e.type === "assistant.completed");
    assert.equal(message.payload.images.length, 1);
    assert(!JSON.stringify(events).includes("base64"));
    assert.equal(
      f.store.history(f.thread.id).messages[0].images[0].id,
      message.payload.images[0].id,
    );
    const timeline = codexTimeline(f.store.db, f.thread.id, "turn");
    assert.equal(timeline.items.filter((i) => i.result?.type === "image").length, 1);
    assert.equal(unlinkedTurnWork(f.store.db, f.thread.id, "turn").items.length, 0);
    const url = message.payload.images[0].url;
    assert.equal((await f.app.inject({ url })).statusCode, 401);
    assert.equal((await f.app.inject({ url, headers: f.headers })).statusCode, 200);
  } finally {
    await f.close();
  }
});
