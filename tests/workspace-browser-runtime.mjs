import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { workspaceBrowserScript } from '../apps/hub/dist/workspace-browser.js';

let clicks=0, text='';
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/hit')clicks++;
  if(url.pathname==='/text')text=url.searchParams.get('value');
  res.setHeader('Content-Type','text/html');
  res.end(`<body style="margin:0;background:#ddebdc;height:2500px"><button style="position:absolute;left:0;top:0;width:200px;height:60px" onclick="this.textContent='Clicked';fetch('/hit')">Click me</button><input style="position:absolute;left:0;top:80px;width:200px;height:40px" oninput="fetch('/text?value='+encodeURIComponent(this.value))"><p style="position:absolute;top:2000px">Bottom</p></body>`);
});
await new Promise(r=>server.listen(3000,'127.0.0.1',r));
const child=spawn('node',['-e',workspaceBrowserScript(3000,390,720)],{stdio:'pipe'});
let buffer='',counter=0;const pending=new Map();
child.stdout.setEncoding('utf8');child.stderr.on('data',()=>{});
const ready=new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('preview start timeout')),20000);
 child.stdout.on('data',data=>{
  buffer+=data;for(;;){const at=buffer.indexOf('\n');if(at<0)break;const value=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);
   if(value.error){clearTimeout(timeout);reject(Error(value.error));for(const p of pending.values())p.reject(Error(value.error));}
   if(value.ready){clearTimeout(timeout);resolve();}
   if(value.id){const p=pending.get(value.id);pending.delete(value.id);p?.resolve(value);}
  }
 });
 child.once('exit',()=>{clearTimeout(timeout);reject(Error('preview exited'));});
});
const request=(x)=>new Promise((resolve,reject)=>{const id=String(++counter),timeout=setTimeout(()=>reject(Error('input timeout')),15000);pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});child.stdin.write(JSON.stringify({...x,id})+'\n');});
try{
 await ready;const before=await request({op:'frame'});assert.ok(before.image.length>1000);assert.equal(Buffer.from(before.image,'base64').readUInt16BE(),0xffd8);
 await request({op:'click',x:40,y:30});
 await request({op:'click',x:80,y:100});await request({op:'text',text:'Привет browser'});
 await new Promise(r=>setTimeout(r,150));assert.equal(clicks,1);assert.equal(text,'Привет browser');
 const after=await request({op:'frame'});assert.notEqual(after.image,before.image);
 await request({op:'scroll',delta:480});assert.notEqual((await request({op:'frame'})).image,after.image);
 await request({op:'reload'});assert.equal(clicks,1,'reload never replays click');
 console.log('Real isolated Chromium: HTTP app, JPEG, click, Unicode text, scrolling and close passed.');
}finally{
 child.stdin.end();await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(()=>child.kill('SIGKILL'),7000).unref();});
 await new Promise(r=>server.close(r));
}
