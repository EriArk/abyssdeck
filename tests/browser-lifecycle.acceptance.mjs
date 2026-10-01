// Compile the real host into an isolated pipe/profile; never stop the installed browser.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
const root=mkdtempSync(join(tmpdir(),'cw-browser-check-')),token=randomUUID().replaceAll('-','');
const packagePath=resolve(process.argv[2]);
const sid=execFileSync('powershell.exe',['-NoProfile','-Command','[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true}).trim();
let code=readFileSync('ops/windows/browser/Browser.cs','utf8')
 .replace('"codex-web-browser-" + WindowsIdentity.GetCurrent().User.Value','"codex-web-browser-'+token+'-" + WindowsIdentity.GetCurrent().User.Value')
 .replace('"CodexWeb", "browser", "profile"','"CodexWeb-Browser-Fixture", "'+token+'", "profile"');
writeFileSync(join(root,'Browser.cs'),code);
for(const name of ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll'])copyFileSync(join(packagePath,name),join(root,name));
execFileSync(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/codepage:65001','/target:winexe','/platform:x64','/r:System.Web.Extensions.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Core.dll','/r:'+join(root,'Microsoft.Web.WebView2.Core.dll'),'/r:'+join(root,'Microsoft.Web.WebView2.WinForms.dll'),'/out:'+join(root,'Host.exe'),join(root,'Browser.cs')],{windowsHide:true,stdio:'inherit'});
const host=spawn(join(root,'Host.exe'),['--server'],{windowsHide:true,stdio:'ignore'});
const exit=new Promise(resolve=>host.once('exit',resolve));
const proxy=spawn(join(root,'Host.exe'),['--mcp'],{windowsHide:true,stdio:['pipe','pipe','inherit']});
let serial=0;const pending=new Map();
createInterface({input:proxy.stdout}).on('line',line=>{const reply=JSON.parse(line),p=pending.get(reply.id);if(!p)return;pending.delete(reply.id);clearTimeout(p.timer);if(reply.result.isError)p.reject(Error(reply.result.content[0].text));else p.resolve(JSON.parse(reply.result.content[0].text));});
async function call(name,args={}){return new Promise((resolve,reject)=>{
 const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('fixture timeout'));},15000);
 pending.set(id,{resolve,reject,timer});proxy.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
});}
let tab;
try{
 for(let i=0;;i++){try{assert.equal((await call('status')).ready,true);break;}catch(e){if(i>30)throw e;await new Promise(r=>setTimeout(r,100));}}
 tab=(await call('open',{url:'about:blank'})).tab;
 assert.equal((await call('shutdown_idle')).stopped,false);
 assert.equal((await call('status')).tabs,1);
 const observation=await call('observe',{tab});
 await call('act',{observation:observation.observation,kind:'close'});tab=null;
 assert.equal((await call('shutdown_idle')).stopped,true);
 await assert.rejects(call('open',{url:'about:blank'}));
 assert.equal(await Promise.race([exit,new Promise((_,reject)=>setTimeout(()=>reject(Error('host did not exit')),5000))]),0);
 console.log('PASS real browser preserves open tab, drains idle under action gate, rejects late input and exits without native Codex changes');
}finally{
 if(tab){try{const o=await call('observe',{tab});await call('act',{observation:o.observation,kind:'close'});}catch{}}
 if(host.exitCode===null)try{await call('shutdown_idle');}catch{}
 proxy.stdin.end();
 if(host.exitCode===null)host.kill(); // Exact disposable fixture process only.
}
