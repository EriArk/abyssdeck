import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import Fastify from '../apps/hub/node_modules/fastify/fastify.js';
import { bindServerWorkspace } from '../packages/machines/dist/serverWorkspace.js';
import { registerWorkspacePreviews } from '../apps/hub/dist/workspace-previews.js';
import { workspaceBrowserScript } from '../apps/hub/dist/workspace-browser.js';

async function fixture(t) {
  let allowed=true,launches=0,effects=0;
  const machine={id:'workspace',type:'server-workspace'};
  bindServerWorkspace(machine,{owner:'11111111-1111-1111-1111-111111111111',ssh:{target:'fixture',configFile:'/fixture'},keyFile:'/fixture',authorize(){if(!allowed)throw Error('REVOKED');}});
  const app=Fastify();
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.stdin.on('data',b=>{const x=JSON.parse(b.toString());if(x.op!=='frame')effects++;child.stdout.write(JSON.stringify({id:x.id,...(x.op==='frame'?{image:Buffer.from('jpeg').toString('base64')}:{ok:true})})+'\n');});
  child.stdin.on('finish',()=>child.emit('close'));
  const sessions={project(id){return {id,machineId:'workspace',workingDirectory:'/workspace/projects/'+id};},catalog:{machine(){return machine;}}};
  registerWorkspacePreviews(app,sessions,()=>{launches++;return child;});
  t.after(()=>app.close());
  const start=()=>app.inject({method:'POST',url:'/api/projects/one/workspace-preview',payload:{port:3000,width:390,height:720}});
  return {app,start,revoke(){allowed=false;},get effects(){return effects;},get launches(){return launches;}};
}
test('exact project binding, bounded input, private frame and no automatic input replay',async t=>{
  const f=await fixture(t);const start=await f.start();assert.equal(start.statusCode,200,start.body);
  const id=start.json().id,base='/api/projects/one/workspace-preview/'+id;
  const frame=await f.app.inject(base+'/frame');assert.equal(frame.statusCode,200);assert.equal(frame.headers['cache-control'],'no-store');assert.equal(frame.body,'jpeg');
  assert.equal((await f.app.inject('/api/projects/two/workspace-preview/'+id+'/frame')).statusCode,410);
  await f.app.inject({method:'POST',url:base+'/input',payload:{op:'text',text:'hello'}});assert.equal(f.effects,1);
  assert.notEqual((await f.app.inject({method:'POST',url:base+'/input',payload:{op:'click',x:400,y:20}})).statusCode,200);assert.equal(f.effects,1);
  assert.notEqual((await f.app.inject({method:'POST',url:base+'/input',payload:{op:'command',value:'Runtime.evaluate'}})).statusCode,200);
  f.revoke();assert.notEqual((await f.app.inject(base+'/frame')).statusCode,200);
});
test('invalid ports never launch and closing makes old identity inaccessible',async t=>{
  const f=await fixture(t);
  for(const port of [0,22,65536,'http://host'])assert.notEqual((await f.app.inject({method:'POST',url:'/api/projects/one/workspace-preview',payload:{port,width:390,height:720}})).statusCode,200);
  assert.equal(f.launches,0);
  const id=(await f.start()).json().id,base='/api/projects/one/workspace-preview/'+id;
  assert.equal((await f.app.inject({method:'DELETE',url:base})).statusCode,200);
  assert.equal((await f.app.inject(base+'/frame')).statusCode,410);
});
test('serialized worker fits the fixed broker argument limit',()=>assert.ok(workspaceBrowserScript(3000,1600,1200).length<8100));
