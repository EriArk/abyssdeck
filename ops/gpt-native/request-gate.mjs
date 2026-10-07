/** Account-local upstream cooldown, shared by history and background library work.
 * Self-contained because the pinned renderer receives this function by value.
 * Never retries a request and never changes an uncertain mutation receipt. */
export function nativeRequestGate(fingerprint, runtime = globalThis) {
 const states=runtime[Symbol.for('codex-web.native-request-gate')]??=new Map();
 if(!states.has(fingerprint)){
  while(states.size>=4)states.delete(states.keys().next().value);
  states.set(fingerprint,{until:0,failures:new Map()});
 }
 const state=states.get(fingerprint),now=()=>runtime.Date?.now?.()??Date.now();
 return {
  check(){if(now()<state.until)throw Object.assign(Error('NATIVE_RATE_LIMITED'),{retryAt:state.until,httpStatus:429});},
  success(scope='general'){if(now()>=state.until)state.failures.delete(scope);},
  limited(retryAfter,scope='general'){
   const at=now(),raw=String(retryAfter??'').trim();
   const requested=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw)*1000:Date.parse(raw)-at;
   const failures=Math.min(5,(state.failures.get(scope)??0)+1);
   state.failures.set(scope,failures);
   state.until=Math.max(state.until,at+(Number.isFinite(requested)?Math.max(0,requested):Math.min(300000,60000*2**(failures-1))));
   throw Object.assign(Error('NATIVE_RATE_LIMITED'),{retryAt:state.until,httpStatus:429});
  },
 };
}
