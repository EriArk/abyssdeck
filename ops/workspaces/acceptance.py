#!/usr/bin/python3
"""Explicit administrator acceptance of EMPTY infrastructure, never existing users.

Uses only slots 0/1 before registry enrollment; stops/refuses if any workspace is
already registered or any container exists. Removes its exact disposable containers
and test files in finally. Does not sign in, copy credentials or connect to CodexWeb.
"""
import errno
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import socket
import sqlite3
import stat
import subprocess
import uuid
from policy import HOME, ROOT, MEMORY, CPUS, PIDS, container_name, container_args, exec_args, podman_command


CODEX_PROBE_TARGET = '/usr/local/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex'
CODEX_PROBE_LINKS = {'apply_patch', 'applypatch', 'codex-linux-sandbox', 'codex-execve-wrapper'}


def clear_codex_probe_temp(slot):
    """Remove only the verified 0.158.0 --version residue in an unclaimed slot."""
    removed=[]
    base=slot/'home/.codex/tmp/arg0'
    if base.resolve()!=base or base.is_symlink() or not base.is_dir():return removed
    for directory in list(base.iterdir())[:64]:
        if not re.fullmatch(r'codex-arg0[A-Za-z0-9]{6}',directory.name):continue
        if directory.is_symlink() or not directory.is_dir():continue
        children={p.name:p for p in directory.iterdir()}
        if not children:
            directory.rmdir();removed.append(str(directory.relative_to(slot)));continue
        if '.lock' not in children or not set(children)<=CODEX_PROBE_LINKS|{'.lock'}:continue
        lock=children['.lock']
        info=lock.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size!=0:continue
        links=[p for name,p in children.items() if name!='.lock']
        if any(not p.is_symlink() or os.readlink(p)!=CODEX_PROBE_TARGET for p in links):continue
        fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW)
        try:
            current=os.fstat(fd)
            if (info.st_dev,info.st_ino)!=(current.st_dev,current.st_ino) or current.st_size!=0:continue
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:continue
            # Caller has already excluded registered users and running containers.
            for p in links:p.unlink();removed.append(str(p.relative_to(slot)))
            lock.unlink();removed.append(str(lock.relative_to(slot)))
            directory.rmdir();removed.append(str(directory.relative_to(slot)))
        finally:os.close(fd)
    for path in [base,base.parent]:
        try:path.rmdir();removed.append(str(path.relative_to(slot)))
        except OSError:pass
    return removed


def clear_empty_scaffold(slot):
    """Clear empty init directories and exact disposable CLI probe residue."""
    slot = Path(slot)
    if slot.is_symlink() or slot.resolve() != slot:
        raise RuntimeError('SLOT_PATH_CHANGED')
    removed = clear_codex_probe_temp(slot)
    for name in ['home/.local/bin','home/.local','home/.codex','home/.config','home/.cache',
                 'home','projects','integration','services']:
        path = slot / name
        if path.is_symlink() or path.resolve() != path:
            continue
        try:
            path.rmdir()
            removed.append(name)
        except OSError:
            pass
    return removed


def main():
    if os.geteuid()!=0: raise RuntimeError('ROOT_REQUIRED')
    config=json.loads(Path('/etc/codex-workspaces/config.json').read_text()); uid=config['uid']
    db=sqlite3.connect('file:'+HOME+'/registry.sqlite?mode=ro',uri=True)
    try:
        if db.execute('SELECT count(*) FROM workspaces').fetchone()[0]: raise RuntimeError('WORKSPACES_ALREADY_ENROLLED')
    finally: db.close()
    prefix=podman_command(uid)
    def run(args,timeout=60):
        result=subprocess.run(prefix+args,input=b'',stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
        if result.returncode: raise RuntimeError('ACCEPTANCE_COMMAND_FAILED: '+result.stderr.decode(errors='replace')[-2000:])
        return result.stdout
    if run(['ps','-aq']).strip(): raise RuntimeError('CONTAINERS_ALREADY_EXIST')
    owners=[str(uuid.uuid4()),str(uuid.uuid4())]; created=[]; results=[]
    marker='.cw-acceptance-'+uuid.uuid4().hex
    canary=Path(ROOT)/(marker+'-host'); canary.write_text('host-private')
    os.chmod(canary,0o600)
    # Only loopback, only for this check, no existing service is contacted.
    listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(4)
    port=listener.getsockname()[1]
    try:
        for i,owner in enumerate(owners):
            run(container_args(owner,i,config['image']),timeout=90); created.append(owner)
            spec=json.loads(run(['inspect',container_name(owner)]))[0]
            # Informational only: stock rootless Podman skips container AppArmor.
            # Do not mistake the host's unconfined `podman` userns profile for confinement.
            apparmor = spec.get('AppArmorProfile') or None
            script='''import json,os,subprocess,socket,errno
from pathlib import Path
marker=%r
status=Path('/proc/self/status').read_text()
assert 'CapEff:\\t0000000000000000' in status
assert 'NoNewPrivs:\\t1' in status and 'Seccomp:\\t2' in status
assert int(Path('/sys/fs/cgroup/memory.max').read_text())==%d
assert int(Path('/sys/fs/cgroup/pids.max').read_text())==%d
quota,period=map(int,Path('/sys/fs/cgroup/cpu.max').read_text().split());assert quota/period==%d
assert not Path('/run/codex-engine').exists()
assert not Path('/run/podman/podman.sock').exists()
assert not Path('/var/run/docker.sock').exists()
assert not Path(%r).exists()
assert not Path('/srv/codex-workspaces/slots').exists()
for op in [['unshare','--mount','true'],['mount','-t','tmpfs','none','/mnt']]:
 assert subprocess.run(op,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0
try:
 Path('/etc/cw-write-test').write_text('x');raise AssertionError('writable root')
except OSError as e: assert e.errno in (errno.EROFS,errno.EACCES,errno.EPERM)
for address in ['10.0.2.2','127.0.0.1','169.254.169.254','100.100.100.100','192.168.1.1','172.17.0.1']:
 try:
  c=socket.create_connection((address,%d),timeout=1);c.close();raise AssertionError('private egress')
 except OSError: pass
assert subprocess.run(['curl','--fail','--silent','--max-time','20','https://registry.npmjs.org/-/ping'],stdout=subprocess.DEVNULL).returncode==0
path=Path('/workspace')/marker
assert not path.exists()
path.write_text(str(os.getpid()))
disk=path.with_suffix('.quota')
try:
 with disk.open('wb') as f:
  fs=os.statvfs('/workspace')
  try:
   os.posix_fallocate(f.fileno(),0,fs.f_bavail*fs.f_frsize+4096);raise AssertionError('quota missing')
  except OSError as e: assert e.errno==errno.ENOSPC
finally: disk.unlink(missing_ok=True)
for command in [['git','--version'],['node','--version'],['python3','--version'],['codex','--version']]:
 assert subprocess.run(command,stdout=subprocess.DEVNULL).returncode==0
print(json.dumps({'isolated':True,'tools':True,'publicEgress':True,'privateEgressDenied':True,'diskQuota':True,'limits':True}))
''' % (marker,MEMORY,PIDS,CPUS,str(canary),port)
            result=json.loads(run(exec_args(owner,['python3','-c',script],'/workspace'),timeout=120))
            result['containerAppArmorProfile']=apparmor
            results.append(result)
        # The same pathname is backed by distinct disks, both preserved after stop/start.
        for owner in owners:
            run(['stop','--time','2',container_name(owner)])
            run(['start',container_name(owner)])
            data=run(exec_args(owner,['cat','/workspace/'+marker],'/workspace')).strip()
            if not data.isdigit(): raise RuntimeError('PERSISTENCE_FAILED')
        print(json.dumps({'rootless':True,'owners':2,'checks':results,'restartPreserved':True}))
    finally:
        listener.close();canary.unlink(missing_ok=True)
        for i,owner in enumerate(created):
            try:
                run(exec_args(owner,['rm','-f','--','/workspace/'+marker,'/workspace/'+marker+'.quota'],'/workspace'))
            except Exception: pass
            # Only names created above, after refusing any preexisting containers.
            subprocess.run(prefix+['rm','--force',container_name(owner)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
            # Remove empty init directories and exact unused CLI probe residue.
            # Never recursively clear a slot: preserve unexpected data.
            clear_empty_scaffold(Path(ROOT)/'slots'/str(i))


if __name__=='__main__':main()
