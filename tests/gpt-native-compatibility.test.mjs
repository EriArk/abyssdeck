import assert from "node:assert/strict";
import test from "node:test";
import { nativeModule } from "../ops/gpt-native/compatibility.mjs";

const runtime = (appVersion) => ({
  electronBridge: { getSentryInitOptions: () => ({ appVersion }) },
});

test("October package mapping is serializable and retains each distinct native service and atom", async () => {
  const shared = {
    fN: { accessInputs: {} },
    $wt: { getRequestTarget() {} },
    TFt: { getInstance() {} },
    avt: {},
    Hyt: () => {},
  };
  const initial = Object.fromEntries(
    ["MRn", "ozn", "VRn", "zRn", "QRn", "oMn", "Uwn", "Vwn"].map((key) => [key, { key }]),
  );
  Object.assign(initial, { yRt() {}, wKt() {}, eCn() {} });
  const primary = { cy() {} },
    registry = new Map(),
    seen = [];
  const importer = async (url) => {
    seen.push(url);
    if (url.endsWith("app-shared-2d77298f0100.js")) return shared;
    if (url.endsWith("app-initial-ed5807835d97.js")) return initial;
    if (url.endsWith("app-primary-f49030709665.js")) return primary;
    if (url.endsWith("register-app-actions-59f7542a0c68.js"))
      return { appActionRegistry: registry };
    throw Error("Unexpected import");
  };
  // biome-ignore lint/security/noGlobalEval: trusted function serialization into the native pipe.
  const serialized = (0, eval)(`(${nativeModule.toString()})`);
  const m = await serialized("main", runtime("26.1007.21434"), importer);
  assert.equal(m.M9, shared.fN);
  assert.equal(m.kWt, shared.$wt);
  assert.equal(m.UNt, initial.Uwn);
  assert.equal(m.VNt, initial.Vwn);
  assert.equal(m.CUt, initial.oMn);
  assert.equal(
    (await serialized("actions", runtime("26.1007.21434"), importer)).appActionRegistry,
    registry,
  );
  assert.equal(seen.length, 4);
  delete initial.Uwn;
  await assert.rejects(serialized("main", runtime("26.1007.21434"), importer), /INCOMPATIBLE/);
});
test("unknown builds never import guessed native modules; old build remains usable for rollback", async () => {
  const seen = [],
    importer = async (url) => {
      seen.push(url);
      return { old: true };
    };
  await assert.rejects(nativeModule("main", runtime("26.999.1"), importer), /UNSUPPORTED_BUILD/);
  assert.deepEqual(seen, []);
  assert.deepEqual(await nativeModule("main", runtime("26.915.31945"), importer), { old: true });
  await nativeModule("actions", runtime("26.915.31945"), importer);
  assert.equal(seen.length, 2);
  assert.match(seen[1], /register-app-actions-a2e5974b9821/);
});
test("split build resolves account, HTTP, completion and action registry to their original native objects", async () => {
  const service = { accessInputs: {} },
    http = { getRequestTarget() {} },
    transport = { getInstance() {} };
  const fn = () => {},
    atom = {},
    initial = {
      XDt: fn,
      RAt: fn,
      yOn: atom,
      qOn: atom,
      OOn: atom,
      EOn: atom,
      zOn: atom,
      fEn: atom,
      Qcn: atom,
      Zcn: atom,
      Pbn: fn,
    };
  const shared = { Vk: service, hvt: http, XAt: transport, Adt: atom, ppt: fn },
    primary = { ay: fn },
    registry = new Map();
  const importer = async (url) =>
    url.includes("app-shared-")
      ? shared
      : url.includes("app-initial-")
        ? initial
        : url.includes("app-primary-")
          ? primary
          : { appActionRegistry: registry };
  // Must work after serialization into the pipe expression, without module-scope closures.
  // biome-ignore lint/security/noGlobalEval: Exercise serialization of trusted repository code in this isolated test.
  const serialized = (0, eval)(`(${nativeModule.toString()})`);
  const m = await serialized("main", runtime("26.928.31416"), importer);
  assert.equal(m.M9, service);
  assert.equal(m.kWt, http);
  assert.equal(m.$rn, transport);
  assert.equal(m.CUt, atom);
  assert.equal(m.mDt, fn);
  assert.equal(m.z$, fn);
  assert.equal(
    (await serialized("actions", runtime("26.928.31416"), importer)).appActionRegistry,
    registry,
  );
  delete initial.XDt;
  await assert.rejects(serialized("main", runtime("26.928.31416"), importer), /INCOMPATIBLE/);
});
