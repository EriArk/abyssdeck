#!/usr/bin/python3
"""Offline, identity-bound disk backup/restore. Never stops work or starts services.

The administrator must stop Hub execution and the workspace broker/containers,
then unmount the claimed slots. Pair with a verified team snapshot. Restore into
the same installation only, with Hub nativeAdmission blocked. Old disk files and
registry are retained beside their replacements; no automatic rollback/replay.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import time
import uuid
from contextlib import contextmanager
from policy import ROOT, HOME, DISK_GIB, SLOTS, owner_id, podman_command

CONFIG = Path('/etc/codex-workspaces/config.json')
REGISTRY = Path(HOME)/'registry.sqlite'


@contextmanager
def database(*args, **kwargs):
    db=sqlite3.connect(*args, **kwargs)
    try:
        with db: yield db
    finally: db.close()


def regular(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path or not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError('BACKUP_PATH_INVALID')
    return path


def digest(path):
    with regular(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def rows(path):
    with database('file:'+str(regular(path))+'?mode=ro', uri=True) as db:
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError('REGISTRY_INVALID')
        result = db.execute('SELECT owner,slot,state,image FROM workspaces ORDER BY owner').fetchall()
    seen = set()
    for owner, slot, state, image in result:
        owner_id(owner)
        if type(slot) is not int or not 0 <= slot < SLOTS or slot in seen or state not in ('creating','ready','revoked'):
            raise RuntimeError('REGISTRY_INVALID')
        if not isinstance(image,str) or len(image)!=71 or not image.startswith('sha256:') or any(c not in '0123456789abcdef' for c in image[7:]):
            raise RuntimeError('REGISTRY_INVALID')
        seen.add(slot)
    return [list(row) for row in result]


def team_identity(snapshot, bindings):
    snapshot = Path(snapshot)
    manifest = json.loads(regular(snapshot/'team-manifest.json').read_text())
    if manifest.get('kind') != 'codex-web-team-backup' or digest(snapshot/'team.db') != manifest['registryHash']:
        raise RuntimeError('TEAM_BACKUP_INVALID')
    with database('file:'+str(snapshot/'team.db')+'?mode=ro', uri=True) as db:
        owner = db.execute("SELECT value FROM team_meta WHERE key='originalOwner'").fetchone()[0]
        if owner_id(owner) != manifest['ownerId']: raise RuntimeError('TEAM_OWNER_MISMATCH')
        for member, _, _, _ in bindings:
            if not db.execute('SELECT 1 FROM team_users WHERE id=?',(member,)).fetchone():
                raise RuntimeError('WORKSPACE_OWNER_MISSING')
    return {'owner':owner,'registryHash':manifest['registryHash']}


def quiescent(config, bindings):
    if os.geteuid() != 0: raise RuntimeError('ROOT_REQUIRED')
    state = subprocess.check_output(['systemctl','show','codex-workspace-broker.service','-p','ActiveState','--value'],text=True).strip()
    if state != 'inactive': raise RuntimeError('BROKER_MUST_BE_STOPPED')
    running = subprocess.check_output(podman_command(config['uid'])+['ps','--quiet'],text=True).strip()
    if running: raise RuntimeError('WORKSPACES_MUST_BE_STOPPED')
    for _, slot, _, _ in bindings:
        mount = Path(ROOT)/'slots'/str(slot)
        if mount.resolve()!=mount or os.path.ismount(mount): raise RuntimeError('SLOTS_MUST_BE_UNMOUNTED')


def sparse_copy(source, destination):
    # Preserve exact bytes; zero ranges are holes, not omitted from the digest.
    h=hashlib.sha256(); size=0
    with regular(source).open('rb') as src, open(destination,'xb') as dst:
        os.fchmod(dst.fileno(),0o600)
        while block:=src.read(1024*1024):
            h.update(block);size+=len(block)
            if block.count(0)==len(block): dst.seek(len(block),1)
            else: dst.write(block)
        dst.truncate(size);dst.flush();os.fsync(dst.fileno())
    return {'bytes':size,'sha256':h.hexdigest()}


def verify(directory, team_snapshot):
    directory=Path(directory)
    if directory.resolve()!=directory or directory.stat().st_mode & 0o077:
        raise RuntimeError('BACKUP_PERMISSIONS')
    manifest=json.loads(regular(directory/'manifest.json').read_text())
    if manifest.get('kind')!='codex-web-workspace-disks' or manifest.get('format')!=1:
        raise RuntimeError('BACKUP_FORMAT')
    if set(manifest['files'])!={'registry.sqlite',*[f'slot{row[1]}.ext4' for row in manifest['bindings']]}:
        raise RuntimeError('BACKUP_FILES')
    for name,info in manifest['files'].items():
        file=regular(directory/name)
        if file.stat().st_size!=info['bytes'] or digest(file)!=info['sha256']:
            raise RuntimeError('BACKUP_CHECKSUM')
    if rows(directory/'registry.sqlite')!=manifest['bindings']:
        raise RuntimeError('BACKUP_BINDINGS')
    for _,slot,_,_ in manifest['bindings']:
        if manifest['files'][f'slot{slot}.ext4']['bytes']!=DISK_GIB*1024**3:
            raise RuntimeError('BACKUP_DISK_SIZE')
    if team_identity(team_snapshot,manifest['bindings'])!=manifest['team']:
        raise RuntimeError('BACKUP_TEAM_MISMATCH')
    return manifest


def create(directory, team_snapshot):
    config=json.loads(regular(CONFIG).read_text());bindings=rows(REGISTRY)
    quiescent(config,bindings)
    identity=team_identity(team_snapshot,bindings)
    directory=Path(directory)
    if not directory.is_absolute() or directory.parent.resolve()!=directory.parent or directory.exists():
        raise RuntimeError('BACKUP_DESTINATION')
    directory.mkdir(mode=0o700)
    files={}
    with database(REGISTRY) as source, database(directory/'registry.sqlite') as target:
        source.backup(target)
    os.chmod(directory/'registry.sqlite',0o600)
    files['registry.sqlite']={'bytes':(directory/'registry.sqlite').stat().st_size,'sha256':digest(directory/'registry.sqlite')}
    for _,slot,_,_ in bindings:
        path=regular(Path(ROOT)/'images'/f'slot{slot}.ext4')
        if path.stat().st_size!=DISK_GIB*1024**3: raise RuntimeError('DISK_SIZE_INVALID')
        files[path.name]=sparse_copy(path,directory/path.name)
    manifest={'kind':'codex-web-workspace-disks','format':1,'created':time.time(),'config':config,
              'team':identity,'bindings':bindings,'files':files}
    with open(directory/'manifest.json','x') as file:
        os.fchmod(file.fileno(),0o600);json.dump(manifest,file);file.flush();os.fsync(file.fileno())
    verify(directory,team_snapshot)
    return manifest


def restore(directory, team_snapshot, live_team):
    manifest=verify(directory,team_snapshot)
    config=json.loads(regular(CONFIG).read_text())
    if config!=manifest['config']: raise RuntimeError('RESTORE_INSTALLATION_MISMATCH')
    current=rows(REGISTRY)
    # Never reassign another user's slot or silently discard a newer workspace.
    if [(r[0],r[1],r[3]) for r in current]!=[(r[0],r[1],r[3]) for r in manifest['bindings']]:
        raise RuntimeError('RESTORE_BINDINGS_MISMATCH')
    quiescent(config,current)
    with database(REGISTRY) as db:
        receipts=db.execute('SELECT nonce,owner,op,created,state FROM receipts').fetchall()
    with database('file:'+str(regular(live_team))+'?mode=ro',uri=True) as db:
        if db.execute("SELECT value FROM team_meta WHERE key='nativeAdmission'").fetchone()!=('blocked',):
            raise RuntimeError('RESTORE_ADMISSION_REQUIRED')
        if db.execute("SELECT value FROM team_meta WHERE key='originalOwner'").fetchone()!=(manifest['team']['owner'],):
            raise RuntimeError('RESTORE_OWNER_MISMATCH')
        for owner,_,_,_ in current:
            if not db.execute('SELECT 1 FROM team_users WHERE id=?',(owner,)).fetchone():raise RuntimeError('RESTORE_OWNER_MISSING')
    suffix='.before-restore-'+str(uuid.uuid4())
    targets=[(f'slot{r[1]}.ext4',Path(ROOT)/'images'/f'slot{r[1]}.ext4') for r in current]+[('registry.sqlite',REGISTRY)]
    prepared=[]
    # All copies and checks complete before replacing the first active path.
    for name,target in targets:
        regular(target);tmp=target.with_name(target.name+suffix+'.new')
        if sparse_copy(Path(directory)/name,tmp)!=manifest['files'][name]:raise RuntimeError('RESTORE_COPY_CHANGED')
        os.chown(tmp,target.stat().st_uid,target.stat().st_gid);prepared.append((target,tmp))
    for extra in [Path(str(REGISTRY)+'-wal'),Path(str(REGISTRY)+'-shm')]:
        if extra.exists():regular(extra).rename(str(extra)+suffix)
    for target,tmp in prepared:
        target.rename(str(target)+suffix);tmp.rename(target)
    # Revoked members remain revoked; accepted operations become uncertain, never replayable.
    with database(REGISTRY) as db:
        db.executemany('INSERT OR REPLACE INTO receipts(nonce,owner,op,created,state) VALUES(?,?,?,?,?)',receipts)
        db.execute("UPDATE receipts SET state='unknown' WHERE state='accepted'")
        for owner,_,state,_ in current:
            if state=='revoked':db.execute("UPDATE workspaces SET state='revoked' WHERE owner=?",(owner,))
        db.commit()
    return {'restored':True,'previousSuffix':suffix,'admission':'blocked'}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['backup','verify','restore'])
    parser.add_argument('--directory',required=True)
    parser.add_argument('--team-snapshot',required=True)
    parser.add_argument('--live-team')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    if args.action!='verify' and not args.apply:parser.error('Explicit --apply is required; services must already be stopped.')
    if args.action=='restore' and not args.live_team:parser.error('--live-team is required')
    if args.action=='backup':result=create(args.directory,args.team_snapshot)
    elif args.action=='verify':result=verify(args.directory,args.team_snapshot)
    else:result=restore(args.directory,args.team_snapshot,args.live_team)
    print(json.dumps({'ok':True,'action':args.action,'workspaces':len(result.get('bindings',[]))}))
