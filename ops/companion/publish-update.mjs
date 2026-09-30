// Offline release signing. The private key never goes in the package or Hub.
import { constants, createHash, createPublicKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, mkdirSync, copyFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { unzipSync } from '../../apps/hub/node_modules/fflate/esm/index.mjs';
import { companionUpdatePublicKey, verifyCompanionUpdate } from '../../apps/hub/dist/companion-updates.js';
const [directory, archive, keyFile, destination] = process.argv.slice(2).map(path => resolve(path));
if (!destination) throw Error('Usage: publish-update package-directory zip private-key output-directory');
const regular = (path,max) => { const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('Invalid release file'); };
regular(keyFile,16384);regular(archive,128*1024*1024);regular(join(directory,'release.json'),128*1024);
const key=readFileSync(keyFile,'utf8');
if (createPublicKey(key).export({type:'spki',format:'pem'}).trim()!==companionUpdatePublicKey.trim())throw Error('Untrusted publisher key');
const bytes=readFileSync(archive), manifestBytes=readFileSync(join(directory,'release.json')), manifest=JSON.parse(manifestBytes);
if(manifest.sourceDirty || manifest.product!=='codexweb-companion-ui'||manifest.platform!=='win-x64')throw Error('Publish a clean Windows UI release');
const zipped=unzipSync(bytes),names=['release.json',...Object.keys(manifest.files)].sort();
if(JSON.stringify(Object.keys(zipped).sort())!==JSON.stringify(names))throw Error('Archive differs from reviewed package');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(zipped['release.json'])!==sha(manifestBytes))throw Error('Wrong archive manifest');
for(const [name,digest] of Object.entries(manifest.files)){
 regular(join(directory,name),256*1024*1024);
 if(sha(readFileSync(join(directory,name)))!==digest || sha(zipped[name])!==digest)throw Error('Package hash mismatch');
}
const sequence=Date.now(), payload=Buffer.from(JSON.stringify({format:1,product:manifest.product,platform:manifest.platform,version:manifest.version,
 sequence,minWindowsBuild:19045,protocol:1,manifestSha256:sha(manifestBytes),packageSha256:sha(bytes),packageBytes:bytes.length,
 sourceRevision:manifest.sourceRevision,publishedAt:new Date().toISOString()}));
const envelope={format:1,payload:payload.toString('base64'),signature:sign('sha256',payload,{key,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString('base64')};
verifyCompanionUpdate(envelope);
mkdirSync(destination,{recursive:true,mode:0o700});if(lstatSync(destination).isSymbolicLink())throw Error('Linked release directory');
const latest=join(destination,'latest.json');
if(existsSync(latest) && verifyCompanionUpdate(JSON.parse(readFileSync(latest,'utf8'))).release.sequence>=sequence)throw Error('Release sequence must increase');
const packagePath=join(destination,sha(bytes)+'.zip');
if(existsSync(packagePath)){regular(packagePath,128*1024*1024);if(sha(readFileSync(packagePath))!==sha(bytes))throw Error('Immutable archive changed');}
else copyFileSync(archive,packagePath,1);
writeFileSync(latest+'.next',JSON.stringify(envelope)+'\n',{flag:'wx',mode:0o600});renameSync(latest+'.next',latest);
console.log(JSON.stringify({version:manifest.version,source:manifest.sourceRevision,sequence,packageSha256:sha(bytes),packageBytes:bytes.length}));
