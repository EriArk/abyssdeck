// Build-specific export names live here, rather than in every renderer operation.
// This function is also serialized into the supervised native renderer.
export async function nativeModule(kind = 'main', runtime = globalThis, importer = url => import(url)) {
 const build = runtime.electronBridge?.getSentryInitOptions?.().appVersion;
 if (!['main', 'actions'].includes(kind)) throw Error('NATIVE_INCOMPATIBLE');
 if (build === '26.915.31945') return importer(kind === 'actions'
  ? 'app://-/assets/register-app-actions-a2e5974b9821.js'
  : 'app://-/assets/app-initial-430deae5a13a.js');
 if (build !== '26.928.31416') throw Error('NATIVE_UNSUPPORTED_BUILD');
 if (kind === 'actions') return importer('app://-/assets/register-app-actions-3ec531e6a3f0.js');
 const [shared, initial, primary] = await Promise.all([
  importer('app://-/assets/app-shared-166a71c7def5.js'),
  importer('app://-/assets/app-initial-be5a841fcc6f.js'),
  importer('app://-/assets/app-primary-dc07dd266e75.js'),
 ]);
 const m = {
  M9: shared.Vk, kWt: shared.hvt, $rn: shared.XAt,
  dWt: shared.Adt, eWt: shared.ppt,
  mDt: initial.XDt, lDt: initial.RAt, lzt: initial.yOn,
  Nzt: initial.qOn, gzt: initial.OOn, hzt: initial.EOn,
  Tzt: initial.zOn, CUt: initial.fEn, UNt: initial.Qcn,
  VNt: initial.Zcn, czt: initial.Pbn, z$: primary.ay,
 };
 if (!m.M9?.accessInputs || typeof m.kWt?.getRequestTarget !== 'function' ||
     typeof m.$rn?.getInstance !== 'function' ||
     ['mDt','lDt','eWt','czt','z$'].some(key => typeof m[key] !== 'function') ||
     ['dWt','lzt','Nzt','gzt','hzt','Tzt','CUt','UNt','VNt'].some(key => m[key] == null))
  throw Error('NATIVE_INCOMPATIBLE');
 return m;
}
