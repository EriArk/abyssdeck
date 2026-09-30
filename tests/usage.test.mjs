import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLimits, normalizeUsageCredits } from "../apps/hub/dist/usage.js";

test("weekly usage is identified by window length, not primary/secondary position; private billing fields are omitted", () => {
  const week = { usedPercent: 4, windowDurationMins: 10080, resetsAt: 1789307281 };
  const result = normalizeLimits({
    rateLimits: { limitId: "codex", primary: week, credits: { balance: "private" } },
    rateLimitsByLimitId: {
      codex: { limitName: null, primary: week },
      spark: {
        limitName: "Spark",
        primary: { usedPercent: 110, windowDurationMins: 300, resetsAt: null },
        secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1789307281 },
      },
    },
  });
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups[0], {
    id: "codex",
    name: "Codex",
    windows: [{ minutes: 10080, remainingPercent: 96, resetsAt: 1789307281 }],
    credits: null,
  });
  assert.equal(result.groups[1].windows[0].minutes, 10080);
  assert.equal(result.groups[1].windows[1].remainingPercent, 0);
  assert(!JSON.stringify(result).includes("private"));
  assert.equal(
    normalizeLimits({ rateLimits: { primary: week } }).groups[0].windows[0].remainingPercent,
    96,
  );
  for (const value of [
    null,
    {},
    { rateLimits: { primary: { usedPercent: NaN, windowDurationMins: 10080 } } },
  ]) {
    assert.equal(normalizeLimits(value).available, false);
  }
});

test("usage credits preserve exact decimal balance, zero and unlimited independently of reset credits", () => {
  const credits = { hasCredits: true, unlimited: false, balance: "12345678901234567890.012300" };
  const result = normalizeLimits({
    rateLimits: { limitId: "codex", credits },
    rateLimitResetCredits: { availableCount: 2 },
  });
  assert.equal(result.available, true);
  assert.deepEqual(result.groups[0].credits, credits);
  assert.equal(result.resetCredits.availableCount, 2);
  assert.deepEqual(normalizeUsageCredits({ ...credits, hasCredits: false, balance: "0.00" }), {
    hasCredits: false,
    unlimited: false,
    balance: "0.00",
  });
  assert.equal(
    normalizeUsageCredits({ ...credits, unlimited: true, balance: null }).unlimited,
    true,
  );
  for (const balance of ["private", "<script>", "-1", "NaN", "1e6", "9".repeat(65), 10]) {
    assert.equal(normalizeUsageCredits({ ...credits, balance }).balance, null);
  }
  for (const value of [null, {}, { balance: "0" }, { ...credits, unlimited: "true" }]) {
    assert.equal(normalizeUsageCredits(value), null);
  }
});

test("credit fallback belongs only to the exact native quota and explicit null is authoritative", () => {
  const credits = { hasCredits: true, unlimited: false, balance: "42.5" };
  const primary = { usedPercent: 4, windowDurationMins: 10080 };
  const result = normalizeLimits({
    rateLimits: { limitId: "codex", credits },
    rateLimitsByLimitId: {
      codex: { primary },
      spark: { primary },
      other: { primary, credits: { ...credits, balance: "7" } },
    },
  });
  assert.equal(result.groups.find((g) => g.id === "codex").credits.balance, "42.5");
  assert.equal(result.groups.find((g) => g.id === "spark").credits, null);
  assert.equal(result.groups.find((g) => g.id === "other").credits.balance, "7");
  assert.equal(
    normalizeLimits({
      rateLimits: { credits },
      rateLimitsByLimitId: { codex: { primary, credits: null } },
    }).groups[0].credits,
    null,
  );
});
