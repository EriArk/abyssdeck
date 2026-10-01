import assert from "node:assert/strict";
import test from "node:test";
import { GptHistoryCache } from "../apps/hub/dist/gpt-cache.js";
import { gptProgress, mergeGptProgress } from "../apps/hub/dist/gpt-progress.js";
import {
  gptJobUser,
  gptTurnProgress,
  historicalGptJob,
  mergeGptHistory,
  mergeGptJobs,
  showGptJob,
} from "../apps/web/src/gptState.ts";

test("External native turns remain independent of off-branch receipts and repeated prompt text", () => {
  const job = {
    id: "old",
    userMessageId: "off-branch",
    status: "unknown",
    error: "paused",
    text: "Continue",
    createdAt: 1000,
    updatedAt: 5000,
  };
  const user = { id: "native-user", role: "user", text: "Continue", createdAt: 2, files: [] };
  const step = {
    id: "public-step",
    role: "assistant",
    phase: "commentary",
    complete: false,
    text: "Public progress",
    createdAt: 3,
    files: [],
  };
  const current = [user, step];
  assert.equal(gptJobUser(job, current), -1);
  assert.equal(historicalGptJob(job, current, false), true);
  assert.equal(historicalGptJob(job, current, true), false);
  assert.equal(job.status, "unknown");
  const progress = gptTurnProgress(current);
  assert.equal(progress.external, true);
  assert.equal(progress.pending, false, "old unfinished output is not current activity");
  assert.equal(gptTurnProgress([user, { ...step, createdAt: Date.now() / 1000 }]).pending, true);
  assert.equal(progress.userId, user.id);
  assert.deepEqual(
    progress.items.map((item) => item.id),
    [step.id],
  );
  assert.equal(
    gptTurnProgress([...current, { ...step, id: "final", phase: "final", complete: true }]).pending,
    false,
  );
  // Another turn's stages can never be attributed to the earlier exact receipt.
  const own = { ...user, id: job.userMessageId, createdAt: 1 };
  assert.deepEqual(gptTurnProgress([own, step, { ...user, createdAt: 50 }], job).items, []);
  assert.equal(gptTurnProgress([own, step, { ...user, createdAt: 50 }], job).external, true);
  assert.equal(historicalGptJob(job, [own, step], false), false);
});

const messages = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: "m" + i,
    role: i % 2 ? "assistant" : "user",
    text: "message " + i,
    files: [],
    createdAt: i,
  }));
test("GPT history shares native reads, confirms unchanged pages and preserves explicit older pages", async () => {
  let calls = 0,
    now = 1000,
    list = messages(60);
  const cache = new GptHistoryCache(
    async () => {
      calls++;
      await Promise.resolve();
      return list;
    },
    () => now,
  );
  const [first, second] = await Promise.all([cache.page("chat", {}), cache.page("chat", {})]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(first.items.length, 20);
  let client = mergeGptHistory(undefined, first);
  const older = await cache.page("chat", { before: client.before });
  client = mergeGptHistory(client, older, true);
  assert.equal(client.messages.length, 40);
  assert.equal(calls, 1);
  const unchanged = await cache.page("chat", { known: client.revision });
  assert.equal(unchanged.notModified, true);
  assert.equal(unchanged.items.length, 0);
  client.scrollTop = 742;
  client.sticky = false;
  assert.equal(mergeGptHistory(client, unchanged).scrollTop, 742);
  now += 61000;
  list = messages(62);
  const latest = await cache.page("chat", {
    known: client.revision,
    anchor: client.anchor,
    prefix: client.prefix,
  });
  assert.equal(latest.retainOlder, true);
  client = mergeGptHistory(client, latest);
  assert.equal(client.messages.length, 42);
  assert.equal(client.messages.at(-1).id, "m61");
  assert.equal(client.before, "m20");
  assert.equal(client.sticky, false);
  assert.equal(calls, 2);
  now += 61000;
  list = messages(62);
  list[10] = { ...list[10], text: "edited native branch" };
  const changed = await cache.page("chat", {
    known: client.revision,
    anchor: client.anchor,
    prefix: client.prefix,
  });
  assert.equal(changed.retainOlder, false);
  assert.equal(mergeGptHistory(client, changed).messages.length, 20);
  now += 61000;
  list = messages(4);
  await assert.rejects(cache.page("chat", { before: "m20" }), /История изменилась/);
});
test("GPT public stages whitelist short native DOM labels and preserve stages after disappearance", () => {
  const label = {
    id: "dom-label",
    kind: "thinking",
    source: "cot-v5",
    visible: true,
    active: true,
    text: "Проверяю варианты",
  };
  const event = { type: "assistant.progress.snapshot", source: "tab.observation", items: [label] };
  const accepted = gptProgress(event);
  assert.equal(accepted[0].text, label.text);
  assert.deepEqual(Object.keys(accepted[0]).sort(), ["id", "state", "text"]);
  for (const item of [
    { ...label, visible: false },
    { ...label, kind: "tool_status" },
    { ...label, source: "analysis" },
    { ...label, text: "x".repeat(501) },
    { ...label, text: "https://private.example/?token=PRIVATE" },
  ])
    assert.deepEqual(gptProgress({ ...event, items: [item] }), []);
  assert.deepEqual(gptProgress({ type: "thinking.snapshot", text: "PRIVATE", items: [label] }), []);
  assert.deepEqual(gptProgress({ ...event, source: "forced_snapshot" }), []);
  const next = gptProgress({
    ...event,
    items: [{ ...label, id: "second", text: "Сопоставляю результат" }],
  });
  const merged = mergeGptProgress(accepted, next);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].state, "completed");
  assert.deepEqual(mergeGptProgress(merged, []), merged);
});
test("GPT job summaries cannot erase retained answers and late snapshots cannot regress state", () => {
  const old = {
    id: "a",
    nativeId: "chat",
    status: "running",
    text: "prompt",
    answer: "answer",
    progress: [{ text: "Public step" }],
    createdAt: 1,
    updatedAt: 10,
  };
  assert.equal(mergeGptJobs([old], []).length, 1);
  const unchanged = [old];
  assert.equal(mergeGptJobs(unchanged, []), unchanged);
  const result = mergeGptJobs(
    [old],
    [{ ...old, text: "", answer: "", status: "completed", summaryOnly: true, updatedAt: 20 }],
  );
  assert.equal(result[0].answer, "answer");
  assert.equal(result[0].status, "completed");
  assert.equal(mergeGptJobs(result, [old])[0].status, "completed");
});

test("Confirmed GPT summaries clear obsolete errors without discarding uncertain receipts or text", () => {
  const old = {
    id: "paused",
    nativeId: "chat",
    status: "unknown",
    text: "Exact question",
    answer: "Partial answer",
    files: [{ id: "upload" }],
    assets: [],
    error: "Checks stopped after repeated failures",
    createdAt: 1,
    updatedAt: 10,
  };
  const summary = (status) => ({
    ...old,
    status,
    text: "",
    answer: "",
    files: [],
    error: "",
    summaryOnly: true,
    updatedAt: 20,
  });
  for (const status of ["queued", "preparing", "running", "completed"]) {
    const [healed] = mergeGptJobs([old], [summary(status)]);
    assert.equal(healed.error, "", status);
    assert.equal(healed.text, old.text);
    assert.equal(healed.answer, old.answer);
    assert.deepEqual(healed.files, old.files);
    assert.equal(mergeGptJobs([healed], [old])[0].error, "");
    const [full] = mergeGptJobs([healed], [{ ...healed, answer: "Full confirmed answer" }]);
    assert.equal(full.answer, "Full confirmed answer");
  }
  for (const status of ["unknown", "failed", "cancelled"])
    assert.equal(mergeGptJobs([old], [summary(status)])[0].error, old.error, status);
  const [other] = mergeGptJobs([old], [{ ...summary("completed"), id: "another-job" }]);
  assert.equal(other.error, old.error);
});

test("Late GPT polling cannot resurrect a dismissed outbox item or its cached contents", () => {
  const job = {
    id: "deleted",
    status: "failed",
    text: "Old question",
    files: [],
    assets: [],
    answer: "",
    createdAt: 1,
    updatedAt: 2,
  };
  const dismissed = mergeGptJobs([job], [{ ...job, dismissed: true }]);
  assert.equal(dismissed[0].text, "");
  const late = mergeGptJobs(dismissed, [{ ...job, updatedAt: 3 }]);
  assert.equal(late[0].dismissed, true);
  assert.equal(late[0].text, "");
  assert.deepEqual(late[0].files, []);
  assert.deepEqual(late[0].progress, []);
});

test("GPT status summaries never render as empty messages or failures", () => {
  const job = {
    id: "old-job",
    nativeId: "chat",
    text: "",
    files: [],
    answer: "",
    assets: [],
    error: "",
    createdAt: 1,
    updatedAt: 2,
    summaryOnly: true,
  };
  for (const status of ["queued", "preparing", "running", "failed", "unknown", "completed"])
    assert.equal(showGptJob({ ...job, status }, [], 3), false, status);
  assert.equal(
    showGptJob(
      { ...job, summaryOnly: false, status: "failed", text: "Recover me", error: "Failed" },
      [],
      3,
    ),
    true,
  );
  assert.equal(
    showGptJob({ ...job, summaryOnly: false, status: "unknown", files: [{ id: "image" }] }, [], 3),
    true,
  );
});

test("Confirmed GPT retries hide only exact recent pre-dispatch failures in the same chat", async () => {
  const { completedGptRetry, showGptJob } = await import("../apps/web/src/gptState.ts");
  const failed = {
    id: "failed",
    nativeId: "chat",
    status: "failed",
    text: "same prompt",
    files: [{ id: "file-a" }],
    assets: [],
    answer: "",
    error: "Preparation failed",
    createdAt: 10000,
    updatedAt: 20000,
  };
  const completed = {
    ...failed,
    id: "retry",
    status: "completed",
    createdAt: 30000,
    updatedAt: 40000,
    error: "",
  };
  assert.equal(completedGptRetry(failed, [failed, completed]), true);
  assert.equal(showGptJob(failed, [], 50000, [failed, completed]), false);
  for (const patch of [
    { status: "unknown" },
    { status: "running" },
    { status: "failed" },
    { nativeId: "other-chat" },
    { nativeId: null },
    { text: "different prompt" },
    { files: [] },
    { files: [{ id: "file-b" }] },
    { createdAt: 19000 },
    { createdAt: 320001 },
    { summaryOnly: true },
    { dismissed: true },
  ])
    assert.equal(
      completedGptRetry(failed, [failed, { ...completed, ...patch }]),
      false,
      JSON.stringify(patch),
    );
  assert.equal(showGptJob({ ...failed, status: "unknown" }, [], 50000, [completed]), true);
  assert.equal(
    completedGptRetry({ ...failed, nativeId: null }, [{ ...completed, nativeId: null }]),
    false,
  );
  assert.equal(showGptJob(failed, [], 50000, []), true);
});

test("saved GPT message sources use bounded native-branch context and explicit return to latest", async () => {
  const cache = new GptHistoryCache(async () => messages(200));
  const context = await cache.page("chat", { messageId: "m50" });
  assert.equal(context.items.length, 20);
  assert(context.items.some((m) => m.id === "m50"));
  assert.equal(context.contextMessage, "m50");
  assert.equal(context.hasNewer, true);
  let client = mergeGptHistory(undefined, context);
  const older = await cache.page("chat", { before: context.nextBefore });
  client = mergeGptHistory(client, older, true);
  assert.equal(client.contextMessage, "m50");
  assert.equal(client.hasNewer, true);
  const latest = mergeGptHistory(client, await cache.page("chat", {}));
  assert.equal(latest.contextMessage, undefined);
  assert.equal(latest.messages.at(-1).id, "m199");
  await assert.rejects(
    cache.page("chat", { messageId: "gone" }),
    (e) => e.code === "GPT_MESSAGE_MISSING",
  );
});

test("older uncertain receipts stay historical while canonical history refresh is unavailable", () => {
  const old = { id: "old", nativeId: "chat", status: "unknown", error: "paused", createdAt: 1000 };
  const complete = { id: "new", nativeId: "chat", status: "completed", createdAt: 5000 };
  assert.equal(historicalGptJob(old, [], true, [old, complete]), true);
  assert.equal(historicalGptJob(old, [], true, [old, { ...complete, nativeId: "other" }]), false);
  assert.equal(historicalGptJob(old, [], true, [old, { ...complete, status: "running" }]), false);
  assert.equal(old.status, "unknown");
});
