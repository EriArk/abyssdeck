// Offline-launch/read-only compatibility check for the host's idle update workflow.
// Run with the ordinary runtime stopped, its private profile mounted, and X/DBus ready.
// No sends, receipt changes, authentication extraction or generic RPC endpoint.
import {spawn} from 'node:child_process';
import {readFileSync,openSync,closeSync} from 'node:fs';
import {NativePipe} from './pipe.mjs';
import {NativeRendererReader} from './renderer.mjs';
import {nativeModule} from './compatibility.mjs';
const binding=JSON.parse(readFileSync('/data/native-adapter/binding.json','utf8'));
const ids=process.argv.slice(2);
if(ids.length>3||ids.some(id=>!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)))throw Error('INVALID_CONVERSATIONS');
const log=openSync('/data/logs/compatibility-app.log','a',0o600);
const child=spawn('/usr/bin/chatgpt',['--disable-gpu','--remote-debugging-pipe'],{stdio:['ignore',log,log,'pipe','pipe']});closeSync(log);
const pipe=new NativePipe(child.stdio[3],child.stdio[4]),reader=new NativeRendererReader({transport:pipe});
const report={compatible:false,checks:{},history:[]};
const guard='!!document.querySelector("[data-testid=app-shell-header-context-menu-surface]")';
try {
 for(let i=0;;i++)try{
  const account=await reader.inspectAccount();
  if(account.accountFingerprint!==binding.accountFingerprint)throw Error('NATIVE_ACCOUNT_MISMATCH');
  report.build=account.build;report.checks.account=true;break;
 }catch(e){if(i>=30||e.message==='NATIVE_ACCOUNT_MISMATCH')throw e;await new Promise(r=>setTimeout(r,1000));}
 const expression=`(async()=>{const nativeModule=${nativeModule.toString()};const m=await nativeModule(),registry=(await nativeModule('actions')).appActionRegistry;let scope;const original=registry.get('app.get_summary');const capture=(input,context)=>{scope=context?.scope;return original(input,context)};registry.set('app.get_summary',capture);try{await m.M9.appActions.runInPrimaryWindow({action:{type:'app.get_summary'}})}finally{if(registry.get('app.get_summary')===capture)registry.set('app.get_summary',original)};if(!scope?.get)throw Error('NATIVE_SCOPE_UNAVAILABLE');const stream=scope.get(m.CUt);return {actions:typeof original==='function',completion:typeof stream?.startCompletionStream==='function'&&typeof stream?.createCompletionStreamHandlers==='function',route:scope.value.routeKind,status:scope.value.conversationId?scope.get(m.Nzt,m.eWt(scope.value.conversationId)):null}})()`;
 Object.assign(report.checks,await pipe.evaluateMain(expression,guard,AbortSignal.timeout(20000)));
 if(!report.checks.actions||!report.checks.completion)throw Error('NATIVE_INCOMPATIBLE');
 report.compatible=true;
 try{const models=await reader.readModels({accountFingerprint:binding.accountFingerprint});report.models={count:models.versions.length};}
 catch(e){report.models={error:e.message};}
 for(const conversationId of ids)try{
  const g=await reader.readConversationGraph({conversationId,accountFingerprint:binding.accountFingerprint});
  report.history.push({conversationId,nodes:Object.keys(g.mapping).length,currentNode:g.current_node});
 }catch(e){report.history.push({conversationId,error:e.message});}
}catch(e){report.error=e.message;process.exitCode=1;}
finally {
 console.log(JSON.stringify(report));pipe.close();child.kill('SIGTERM');
 await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);
 if(child.exitCode===null)child.kill('SIGKILL');
}
