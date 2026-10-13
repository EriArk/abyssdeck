import {readFileSync,writeFileSync,renameSync,openSync,closeSync,fsyncSync,lstatSync,readdirSync,rmSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reconcile,terminal} from './coordinator.mjs';
const code=dirname(fileURLToPath(import.meta.url));
const directory=resolve(process.argv[2]);
const digest=b=>createHash('sha256').update(b).digest('hex');
const hash=p=>digest(readFileSync(p));
function noLinks(path) {for(let p=resolve(path);;p=dirname(p)){try{if(lstatSync(p).isSymbolicLink())throw Error('Linked maintenance path');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}}
noLinks(directory);
const planPath=join(directory,'plan.json');
const plan=JSON.parse(readFileSync(planPath,'utf8'));
const seal=JSON.parse(readFileSync(join(directory,'seal.json'),'utf8'));
if(hash(planPath)!==seal.plan)throw Error('Maintenance plan changed');
for(const [name,expected] of Object.entries(seal.code)) {if(!/^[\w.-]+$/.test(name)||hash(join(code,name))!==expected)throw Error('Coordinator code changed');}
const statePath=join(directory,'state.json');
let state=JSON.parse(readFileSync(statePath,'utf8'));
if(state.operationId!==plan.operationId)throw Error('Operation identity changed');
function atomic(path,bytes) {noLinks(path);noLinks(path+'.next');const fd=openSync(path+'.next','w');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}renameSync(path+'.next',path);}
async function command(file,args,input='') {
 return await new Promise((resolve,reject)=>{
  const child=spawn(file,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Maintenance command outcome unknown'));},65_000);
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.stdout.on('data',c=>{out+=c;if(out.length>100_000)child.kill();});child.stderr.on('data',c=>{err+=c;if(err.length>100_000)child.kill();});
  child.on('close',exit=>{clearTimeout(timer);if(exit!==0)return reject(Error('Maintenance command failed; inspect state (exit '+exit+')'));try{resolve(JSON.parse(out.replace(/^\uFEFF/,'')));}catch{reject(Error('Invalid maintenance reply'));}});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
const port=action=>command(plan.powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(code,'windows-port.ps1'),'-Action',action,'-PlanPath',planPath]);
const io={
 now:()=>Date.now(),
 save:async s=>atomic(statePath,JSON.stringify(s,null,2)),
 preflight:async s=>{
  for(const path of [plan.configPath,plan.candidateCommand,plan.previousCommand])noLinks(path);
  if(hash(join(directory,'previous.json'))!==plan.previousHash || hash(join(directory,'candidate.json'))!==plan.candidateHash)throw Error('Configuration snapshots changed');
  if(hash(plan.previousCommand)!==plan.previousExeHash)throw Error('Rollback executable changed');
  if(!s.fenced){
   const receipt=JSON.parse(readFileSync(join(plan.candidateRoot,'abyssdeck-package.json'),'utf8'));
   if(hash(join(plan.candidateRoot,'abyssdeck-package.json'))!==plan.receiptHash)throw Error('Package receipt changed');
   for(const [name,expected]of Object.entries(receipt.files)) {const p=resolve(plan.candidateRoot,name);if(!p.startsWith(plan.candidateRoot+'\\'))throw Error('Package path escape');noLinks(p);if(hash(p)!==expected)throw Error('Candidate package changed');}
  }
  await port('inspect');
 },
 hub:async action=>{
  const input=Buffer.from(JSON.stringify({owner:plan.owner,machineId:plan.machineId,operationId:plan.operationId,action})).toString('base64');
  const r=await command(plan.ssh,['-o','BatchMode=yes','-o','ConnectTimeout=10',plan.sshTarget,'docker','exec','-i','-e','ABYSS_RUNTIME_MAINTENANCE='+input,plan.engineContainer,'node','--input-type=module'],readFileSync(join(code,'hub-maintenance.mjs'),'utf8'));
  if(r.status!==200||r.result?.operationId!==plan.operationId)throw Error('Hub maintenance refused: '+(r.result?.code??r.status));
  return r.result.state;
 },
 inspect:()=>port('inspect'),
 stop:()=>port('stop'),
 switchConfig:async desired=>{
  const observed=await port('inspect');if(observed.brokers||observed.children||observed.taskState!=='Ready')throw Error('Broker not stopped before config replacement');
  const current=hash(plan.configPath);if(![plan.previousHash,plan.candidateHash].includes(current))throw Error('Concurrent config edit');
  atomic(plan.configPath,readFileSync(join(directory,desired==='candidate'?'candidate.json':'previous.json')));
 },
 start:()=>port('start'),
 ready:async()=> (await port('ready')).ready,
 verify:async()=>{
  const p=await port('inspect');const expected=p.config==='candidate'?plan.candidateCommand:plan.previousCommand;
  return p.brokers===1&&p.children===1&&p.nativePaths[0]===expected?p.config:'unknown';
 },
 receipt:()=>port('receipt'),
 prune:async()=>{
  // Only receipts created by this updater establish completed activation.
  // Unmanaged snapshots and active/configured versions are never inferred away.
  const activation=join(dirname(directory),'..','activated');
  const {mkdirSync}=await import('node:fs');noLinks(activation);mkdirSync(activation,{recursive:true});
  if(state.phase==='completed')atomic(join(activation,plan.candidateRoot.split('\\').at(-1)+'.json'),JSON.stringify({operationId:plan.operationId,at:Date.now()}));
  const root=dirname(plan.candidateRoot);noLinks(root);
  const receipt=p=>join(activation,p.split('\\').at(-1)+'.json');
  const complete=readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^\d+\.\d+\.\d+$/.test(d.name)).map(d=>join(root,d.name)).filter(p=>{try{return statSync(receipt(p)).isFile();}catch{return false;}}).sort((a,b)=>statSync(receipt(b)).mtimeMs-statSync(receipt(a)).mtimeMs);
  // Pruning is deliberately conservative: previous version is pinned for this
  // operation; third-party/native processes are checked fresh by PowerShell.
  for(const p of complete.slice(3)) {
   if(p===plan.candidateRoot||plan.previousCommand.startsWith(p+'\\'))continue;
   noLinks(p);if(dirname(resolve(p))!==resolve(root))throw Error('Retention target escaped runtime root');
   const script='$p='+"'"+p.replaceAll("'","''")+"'"+'; $active=@(Get-CimInstance Win32_Process | Where-Object {($_.ExecutablePath -and $_.ExecutablePath.StartsWith($p+\'\\\',[StringComparison]::OrdinalIgnoreCase)) -or ($_.Name -like \'codex*.exe\' -and -not $_.ExecutablePath)}); @{active=($active.Count -gt 0)}|ConvertTo-Json -Compress';
   const check=await command(plan.powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')]);
   if(!check.active)rmSync(p,{recursive:true,force:false});
  }
 }
};
// Scheduler provides process isolation and IgnoreNew. A file lock is also held
// by the launcher, so accidental manual starts cannot race its atomic journal.
if(!terminal.has(state.phase)||state.cleanupPending)await reconcile(state,io);
