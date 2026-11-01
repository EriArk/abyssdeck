import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {StringDecoder} from 'node:string_decoder';

// No turns, history mutation, login or token refresh. Account data travels only
// through the private parent's pipe and is never persisted in an update receipt.
export async function probeCandidate(executable, launch = spawn) {
  const child=launch(executable,['app-server'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let buffer='',id=0,ended=false;const pending=new Map(),decoder=new StringDecoder('utf8');
  function fail(error) {for(const p of pending.values())p.reject(error);pending.clear();}
  child.stdout.on('data',chunk=>{
    buffer+=decoder.write(chunk);
    if(Buffer.byteLength(buffer)>16*1024*1024){fail(Error('Candidate protocol frame too large'));child.kill();return;}
    for(let end;(end=buffer.indexOf('\n'))>=0;){
      const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
      try {const message=JSON.parse(line);const p=pending.get(message.id);if(!p)continue;pending.delete(message.id);
        if(message.error)p.reject(Error('Candidate refused '+p.method));else p.resolve(message.result);
      } catch {fail(Error('Candidate returned invalid protocol'));}
    }
  });
  child.stderr.on('data',()=>{});
  child.stdin.on('error',()=>fail(Error('Candidate input unavailable')));
  child.on('error',()=>fail(Error('Candidate launch failed')));
  child.on('close',()=>{ended=true;fail(Error('Candidate closed during preflight'));});
  const request=(method,params)=>new Promise((resolve,reject)=>{
    if(ended)return reject(Error('Candidate already closed'));
    const key=++id;pending.set(key,{resolve,reject,method});child.stdin.write(JSON.stringify({id:key,method,params})+'\n');
  });
  const timer=setTimeout(()=>{fail(Error('Candidate preflight timed out'));child.kill();},45000);
  try {
    const init=await request('initialize',{clientInfo:{name:'codex_web_interface',title:'Codex Web Interface',version:'0.1.0'},capabilities:{experimentalApi:true,mcpServerOpenaiFormElicitation:true,extensions:{'openai/elicitation':{form:{}}}}});
    child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    const account=await request('account/read',{refreshToken:false});
    if(!account?.account || typeof account.account.type!=='string')throw Error('Candidate account not authenticated');
    const models=await request('model/list',{limit:100,includeHidden:true});
    if(!Array.isArray(models?.data)||!models.data.length)throw Error('Candidate model catalog unavailable');
    const exec=await request('command/exec',{command:['cmd.exe','/d','/c','echo abyssdeck-preflight'],timeoutMs:10000});
    if(exec?.exitCode!==0||!exec.stdout?.includes('abyssdeck-preflight'))throw Error('Candidate executor unavailable');
    return {account:account.account,userAgent:init.userAgent,models:models.data.length};
  } finally {
    clearTimeout(timer);child.stdin.end();
    if(!ended){const kill=setTimeout(()=>child.kill(),2000);kill.unref();child.once('close',()=>clearTimeout(kill));}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.stdout.write(JSON.stringify(await probeCandidate(process.argv[2])));}
  catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
