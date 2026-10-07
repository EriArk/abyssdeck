import assert from "node:assert/strict";
import test from "node:test";
import { nativeModule } from "../ops/gpt-native/compatibility.mjs";

const runtime = (appVersion) => ({
  electronBridge: { getSentryInitOptions: () => ({ appVersion }) },
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
