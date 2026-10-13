import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile,terminal} from '../ops/windows/runtime-update/coordinator.mjs';

function fixture(crashAt) {
 let saved={operationId:'same-operation',phase:'waitingIdle',fenced:false,deadline:1000000};
 const actual={lease:'idle',config:'previous',broker:true,children:0,account:true,time:1,busy:false};
 let dead=false,crashed=false,seq=0;const effects=[];
 const after=label=>{effects.push(label);if(!crashed&&++seq===crashAt){crashed=true;dead=true;throw Error('simulated process death');}};
 const io={
  now:()=>actual.time,
  save:async s=>{if(dead)throw Error('dead coordinator');saved=structuredClone(s);after('save:'+s.phase);},
  preflight:async()=>{},
  hub:async action=>{
   if(action==='acquire'){
    if(actual.lease==='released')return 'released';
    if(actual.busy)return 'waitingIdle';
    actual.lease='drained';actual.children=0;after('acquire');return 'drained';
   }
   if(action==='status')return actual.lease;
   assert.equal(actual.lease,'drained');
   if(!actual.account)throw Error('account validation failed');
   actual.children=1;actual.lease='released';after('release');return 'released';
  },
  inspect:async()=>({...actual}),
  stop:async()=>{assert.equal(actual.lease,'drained');assert.equal(actual.children,0);actual.broker=false;after('stop');},
  switchConfig:async side=>{assert.equal(actual.broker,false);actual.config=side;after('switch:'+side);},
  start:async()=>{actual.broker=true;after('start');},
  ready:async()=>true,
  verify:async()=>actual.children===1?actual.config:'unknown',
  receipt:async()=>{after('receipt');},
  prune:async()=>{assert.equal(actual.lease,'released');after('prune');},
 };
 return {io,actual,effects,get state(){return structuredClone(saved);},
  async tick(){dead=false;await reconcile(structuredClone(saved),io);}};
}

test('busy native work never fences or stops; expired waiting does not acquire',async()=>{
 const f=fixture();f.actual.busy=true;await f.tick();assert.equal(f.state.phase,'waitingIdle');assert.equal(f.actual.lease,'idle');
 f.actual.time=2000000;await f.tick();assert.equal(f.state.phase,'cancelled');assert(!f.effects.includes('stop'));
});
test('successful update verifies exact runtime and account before retention',async()=>{
 const f=fixture();await f.tick();assert.equal(f.state.phase,'completed');assert.equal(f.actual.config,'candidate');
 assert(f.effects.indexOf('release')<f.effects.indexOf('prune'));
});
test('process death at every journal and effect boundary converges without reopening released admission',async()=>{
 const baseline=fixture();await baseline.tick();
 for(let crash=1;crash<=baseline.effects.length;crash++){
  const f=fixture(crash);try{await f.tick();}catch{}
  for(let i=0;i<4&&!terminal.has(f.state.phase);i++)await f.tick();
  assert.equal(f.state.phase,'completed','crash boundary '+crash);
  assert.equal(f.actual.lease,'released');
  const released=f.effects.indexOf('release');
  assert(!f.effects.slice(released+1).includes('stop'),'must not stop after lost release ack');
 }
});
test('reboot after drain does not trust stale waiting journal; same lease is recovered',async()=>{
 const f=fixture();f.actual.lease='drained';f.actual.broker=false;
 await f.tick();assert.equal(f.state.phase,'completed');assert.equal(f.actual.config,'candidate');
});
test('missing Hub acknowledgement retries observations and cannot expire a drained lease',async()=>{
 const f=fixture();let offline=true;const hub=f.io.hub;
 f.io.hub=async action=>{if(action==='acquire'&&offline){await hub(action);throw Error('lost ack');}return hub(action);};
 await f.tick();assert.equal(f.state.phase,'acquiring');assert.equal(f.actual.lease,'drained');
 f.actual.time=2000000;offline=false;await f.tick();assert.equal(f.state.phase,'completed');
});
test('configuration conflict is visible and never overwrites user edits',async()=>{
 const f=fixture();f.actual.config='external';await f.tick();assert.equal(f.state.phase,'needsAttention');assert.equal(f.actual.config,'external');assert(!f.effects.includes('stop'));assert.equal(f.actual.lease,'idle');
});
test('account mismatch does not release admission or force-stop a candidate child',async()=>{
 const f=fixture();f.actual.account=false;await f.tick();assert.equal(f.state.phase,'releasing');assert.equal(f.actual.lease,'drained');
 f.actual.children=1;const n=f.effects.filter(x=>x==='stop').length;await f.tick();assert.equal(f.effects.filter(x=>x==='stop').length,n);
 f.actual.account=true;await f.tick();assert.equal(f.state.phase,'completed');
});
test('candidate readiness failure restores previous config and then validates release',async()=>{
 const f=fixture();f.io.ready=async()=>f.actual.config==='previous';await f.tick();assert.equal(f.state.phase,'verifying');
 f.actual.time=130000;await f.tick();assert.equal(f.state.rollback,true);
 await f.tick();assert.equal(f.state.phase,'rolledBack');assert.equal(f.actual.config,'previous');assert.equal(f.actual.lease,'released');
});
test('healthy broker with failed native startup rolls back only after fresh drained and childless proof',async()=>{
 const f=fixture();const hub=f.io.hub;
 f.io.hub=async action=>{if(action==='release'&&f.actual.config==='candidate')throw Error('native start failed');return hub(action);};
 await f.tick();assert.equal(f.state.phase,'releasing');f.actual.time=130000;
 await f.tick();assert.equal(f.state.rollback,true);await f.tick();assert.equal(f.state.phase,'rolledBack');
});
test('lost successful release never rolls back even after deadline and later native exit',async()=>{
 const f=fixture();const hub=f.io.hub;
 f.io.hub=async action=>{if(action==='release'){await hub(action);f.actual.children=0;throw Error('reply lost');}return hub(action);};
 await f.tick();f.actual.time=130000;const stops=f.effects.filter(x=>x==='stop').length;
 await f.tick();assert.equal(f.effects.filter(x=>x==='stop').length,stops);assert.equal(f.state.rollback,undefined);
});
test('retention failure does not turn a healthy activation back into maintenance',async()=>{
 const f=fixture();f.io.prune=async()=>{throw Error('busy file');};await f.tick();assert.equal(f.state.phase,'completed');assert.equal(f.state.cleanupWarning,'busy file');
 const n=f.effects.length;f.io.prune=async()=>{};await f.tick();assert.equal(f.state.cleanupPending,false);assert(!f.effects.slice(n).includes('acquire'));
});
