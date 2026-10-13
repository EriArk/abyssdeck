// Runs on the owner's existing private host connection. Never reads chat content.
import {request} from 'node:http';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const input=JSON.parse(Buffer.from(process.env.ABYSS_RUNTIME_MAINTENANCE,'base64').toString('utf8'));
if(!/^[a-f0-9-]{36}$/.test(input.operationId) || !/^[a-zA-Z0-9_-]+$/.test(input.machineId) || !['status','acquire','release','owner'].includes(input.action)) throw Error('Invalid maintenance request');
const config=JSON.parse(readFileSync('/config/config.json','utf8'));
const db=new DatabaseSync(join(config.team.root,'team.db'),{readOnly:true});
const owner=db.prepare("SELECT value FROM team_meta WHERE key='originalOwner'").get().value;db.close();
if(input.action==='owner') {console.log(JSON.stringify({owner}));}
else {
 if(owner!==input.owner) throw Error('Hub owner changed');
 const body=JSON.stringify({machineId:input.machineId,operationId:input.operationId,action:input.action});
 const req=request({socketPath:'/run/codex-engine/personal-sockets/'+owner+'.sock',path:'/internal/companion/maintenance',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{let s='';res.on('data',c=>{s+=c;if(s.length>65536)req.destroy(Error('Oversize reply'));});res.on('end',()=>console.log(JSON.stringify({status:res.statusCode,result:JSON.parse(s)})));});
 req.setTimeout(45_000,()=>req.destroy(Error('Maintenance acknowledgement unknown')));
 req.on('error',()=>{process.stderr.write('Maintenance transport failed\n');process.exitCode=1;});req.end(body);
}
