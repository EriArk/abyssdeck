#!/usr/bin/python3
"""Remove bundled Codex from the exact owner's legacy workspace without touching its disk.

Run the prepared, hash-checked local bundle with sudo. Dry run is the default.
The previous immutable container is retained for rollback. This is NOT Incus setup.
"""
import argparse
import fcntl
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time
import uuid
from policy import podman_command, container_name, container_args

BROKER='codex-workspace-broker.service'
FULL_RECEIPTS=50000
REGISTRY=Path('/var/lib/codex-workspaces/registry.sqlite')
CONFIG=Path('/etc/codex-workspaces/config.json')
HELPERS=Path('/opt/codex-workspace-broker')
BACKUPS=Path('/var/lib/codex-workspace-maintenance')

def run(args, **kwargs):
    return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,timeout=600, **kwargs).strip()

def digest(path):
    if path.is_symlink() or not path.is_file(): raise RuntimeError('BUNDLE_FILE_INVALID')
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def idle(podman,name):
    value=json.loads(run(podman+['inspect',name]))[0]
    if value['State'].get('Paused') or value['State'].get('Restarting'):raise RuntimeError('WORKSPACE_BUSY')
    if value['State']['Running']:
        rows=run(podman+['top',name,'pid','args']).splitlines()
        if len(rows)!=2 or rows[1].split()!=['1','sleep','infinity']:raise RuntimeError('WORKSPACE_BACKGROUND_WORK')
    return value

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');a=p.parse_args()
    if os.geteuid()!=0:raise RuntimeError('ROOT_REQUIRED')
    os.umask(0o077)
    root=Path(__file__).resolve().parent
    manifest=json.loads((root/'codex-removal.json').read_text())
    owner=str(uuid.UUID(manifest['owner']))
    image=manifest['image']
    if not image.startswith('sha256:') or len(image)!=71:raise RuntimeError('IMAGE_INVALID')
    if set(manifest['files']) != {'runtime.tar','broker.py','policy.py','remove-bundled-codex.py'}:raise RuntimeError('BUNDLE_FILES_INVALID')
    for name,expected in manifest['files'].items():
        if name not in ['runtime.tar','broker.py','policy.py','remove-bundled-codex.py']:raise RuntimeError('BUNDLE_FILE_INVALID')
        if digest(root/name)!=expected:raise RuntimeError('BUNDLE_HASH_MISMATCH')
    config=json.loads(CONFIG.read_text());podman=podman_command(config['uid'])
    with sqlite3.connect(REGISTRY.as_uri()+'?mode=ro',uri=True) as db:
        rows=db.execute('SELECT owner,slot,state,image FROM workspaces').fetchall()
        selected=[r for r in rows if r[0]==owner]
        counts=dict(db.execute('SELECT state,count(*) FROM receipts GROUP BY state'))
    if len(selected)!=1 or selected[0][2]!='ready':raise RuntimeError('OWNER_WORKSPACE_NOT_READY')
    _,slot,_,old_image=selected[0];name=container_name(owner)
    for other,_,state,expected in rows:
        if state=='revoked':continue
        info=idle(podman,container_name(other))
        if info['Config']['Labels'].get('codexweb.owner')!=other or info['Image'].removeprefix('sha256:')!=expected.removeprefix('sha256:'):
            raise RuntimeError('WORKSPACE_BINDING_CHANGED')
    before=idle(podman,name)
    if old_image==image:
        if any(digest(HELPERS/n)!=manifest['files'][n] for n in ['broker.py','policy.py']):raise RuntimeError('INSTALLED_HELPERS_MISMATCH')
        print(json.dumps({'installed':True,'alreadyInstalled':True}));return
    print(json.dumps({'ready':True,'slot':slot,'receipts':counts,'willReplaceImage':True,'dataDiskUnchanged':True}),flush=True)
    if not a.apply:return
    with (root/'runtime.tar').open('rb') as archive:run(podman+['load'],stdin=archive)
    actual=run(podman+['image','inspect',image,'--format','{{.Id}}'])
    if actual.removeprefix('sha256:')!=image.removeprefix('sha256:'):raise RuntimeError('LOADED_IMAGE_MISMATCH')
    # This bounded migration repairs the diagnosed full broker. At capacity it
    # cannot accept new work; actual containers were verified idle above.
    # Unrelated Hub chats and the host terminal running this script remain alive.
    if sum(counts.values()) < FULL_RECEIPTS:raise RuntimeError('EXPECTED_FULL_BROKER_CHANGED')
    backup=BACKUPS/('remove-codex-'+time.strftime('%Y%m%dT%H%M%S'))
    backup.mkdir(parents=True,mode=0o700)
    old_name=name+'-before-codex-removal'
    old_files={n:(HELPERS/n).read_bytes() for n in ['broker.py','policy.py']}
    for n,data in old_files.items():(backup/n).write_bytes(data)
    shutil.copy2(CONFIG,backup/'config.json')
    (backup/'identity.json').write_text(json.dumps({'owner':owner,'slot':slot,'oldImage':old_image,'image':image,'oldName':old_name,'running':before['State']['Running']}))
    stopped=[];renamed=False;changed=False
    try:
        with sqlite3.connect(REGISTRY.as_uri()+'?mode=ro',uri=True) as db:
            total,oldest=db.execute('SELECT count(*),min(created) FROM receipts').fetchone()
        if total < FULL_RECEIPTS or oldest < time.time()-14*86400+600:raise RuntimeError('EXPECTED_FULL_BROKER_CHANGED')
        stopped.append(BROKER);run(['systemctl','stop',BROKER])
        for other,_,state,_ in rows:
            if state!='revoked':idle(podman,container_name(other))
        with sqlite3.connect(REGISTRY) as src,sqlite3.connect(backup/'registry.sqlite') as dst:src.backup(dst)
        if before['State']['Running']:run(podman+['stop','--time','10',name])
        run(podman+['rename',name,old_name]);renamed=True
        run(podman+container_args(owner,slot,image))
        # No private account data is read or removed. Test only executable availability.
        run(podman+['exec',name,'sh','-ec','test ! -e /usr/local/bin/codex; test ! -d /usr/local/lib/node_modules/@openai/codex; node --version; python3 --version; test -d /workspace/home'])
        with sqlite3.connect(REGISTRY) as db:
            result=db.execute('UPDATE workspaces SET image=? WHERE owner=? AND slot=? AND image=?',(image,owner,slot,old_image))
            if result.rowcount!=1:raise RuntimeError('WORKSPACE_BINDING_CHANGED')
        changed=True
        config['image']=image
        CONFIG.write_text(json.dumps(config))
        for n in old_files:shutil.copyfile(root/n,HELPERS/n)
        # All retained records keep exact identities; only confirmed completed
        # entries outside replay lifetime are eligible for pressure cleanup.
        from broker import Broker
        b=Broker(REGISTRY.parent,image,config['uid'],command=podman)
        nonce=str(uuid.uuid4());b.accept(owner,nonce,'status');b.finish(nonce,'completed');b.db.close()
        if not before['State']['Running']:run(podman+['stop','--time','10',name])
    except BaseException:
        # A lost run acknowledgement is reconciled by exact local identity.
        exists = run(podman+['ps','-a','--format','{{.Names}}']).splitlines()
        if old_name in exists:
            previous=json.loads(run(podman+['inspect',old_name]))[0]
            if previous['Config']['Labels'].get('codexweb.owner')!=owner or previous['Image'].removeprefix('sha256:')!=old_image.removeprefix('sha256:'):raise RuntimeError('ROLLBACK_IDENTITY_CHANGED')
            renamed=True
        if renamed and name in exists:
            current=json.loads(run(podman+['inspect',name]))[0]
            if current['Config']['Labels'].get('codexweb.owner')!=owner or current['Image'].removeprefix('sha256:')!=image.removeprefix('sha256:'):
                raise RuntimeError('ROLLBACK_IDENTITY_CHANGED')
            run(podman+['rm','-f',name])
        if renamed:run(podman+['rename',old_name,name])
        if before['State']['Running']:run(podman+['start',name])
        if changed:
            with sqlite3.connect(REGISTRY) as db:db.execute('UPDATE workspaces SET image=? WHERE owner=?',(old_image,owner))
        shutil.copy2(backup/'config.json',CONFIG)
        for n,data in old_files.items():(HELPERS/n).write_bytes(data)
        raise
    finally:
        # Return SQLite sidecars to the existing unprivileged service owner.
        st=REGISTRY.stat()
        for suffix in ['', '-wal','-shm']:
            path=Path(str(REGISTRY)+suffix)
            if path.exists():os.chown(path,st.st_uid,st.st_gid)
        for target in reversed(stopped):
            run(['systemctl','start',target] if target==BROKER else ['docker','start',target])
    (backup/'complete.json').write_text(json.dumps({'installed':True,'image':image,'slot':slot,'diskPreserved':True}))
    print(json.dumps({'installed':True,'slot':slot,'diskPreserved':True,'rollback':str(backup)}))

def locked_main():
    # Same lock order as the ordinary Hub updater and native host maintenance.
    state=Path('/home/abysscloud/services/codex-web')
    with ExitStack() as resources:
        lock=resources.enter_context((state/'send-handoff-deploy.lock').open('r+'))
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        config=json.loads(run(['docker','exec','codex-web-engine','node','-e',
            "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('/config/config.json')); console.log(JSON.stringify({root:c.team.root}));"]))
        # The container uses the host's Team directory at the same absolute path.
        host=resources.enter_context((Path(config['root'])/'gpt-host.lock').open('r+'))
        fcntl.flock(host,fcntl.LOCK_EX|fcntl.LOCK_NB)
        main()

if __name__=='__main__':locked_main()
