#!/usr/bin/python3
"""Fixed host checkpoint coordinator. Installed root-owned; no caller paths/commands.

Ordinary maintenance admission is mandatory. A container with a detached command
is deferred, never killed for a backup. A private journal makes interrupted
mount/service transitions recoverable without replaying any user command.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid
from contextlib import ExitStack
import backup
from policy import ROOT, podman_command, container_name
from install import check_mount

SETTINGS = Path('/etc/codex-workspaces/checkpoint.json')
JOURNAL = Path('/var/lib/codex-workspace-checkpoint/journal.json')
LOCK = Path('/var/lib/codex-workspace-checkpoint/lock')
BROKER = 'codex-workspace-broker.service'
ENGINE = 'codex-web-engine'
GATEWAY = 'codex-web-hub'


def run(args, timeout=60):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, timeout=timeout).strip()


def write(path, value):
    temp = path.with_suffix('.new')
    with temp.open('w') as f:
        os.fchmod(f.fileno(), 0o600);json.dump(value, f);f.flush();os.fsync(f.fileno())
    temp.replace(path)


def canonical(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path: raise RuntimeError('CHECKPOINT_PATH')
    return path


def inspect(name):
    value = json.loads(run(['docker', 'inspect', name]))[0]
    if not value['State']['Running']: raise RuntimeError('HUB_NOT_RUNNING')
    return value


def unit(slot):
    return run(['systemd-escape', '--path', '--suffix=mount', str(Path(ROOT)/'slots'/str(slot))])


def idle_container(info, owner, image):
    if info['Config']['Labels'].get('codexweb.owner') != owner or info['Image'].removeprefix('sha256:') != image.removeprefix('sha256:'):
        raise RuntimeError('WORKSPACE_IDENTITY_CHANGED')
    if info['State'].get('Paused') or info['State'].get('Restarting'):
        raise RuntimeError('WORKSPACE_BUSY')
    return info['State']['Running']


class Checkpoint:
    def __init__(self, settings):
        self.settings = settings
        self.state = canonical(settings['state'])
        self.destination = canonical(settings['destination'])
        self.host = json.loads(backup.regular(backup.CONFIG).read_text())
        self.podman = podman_command(self.host['uid'])
        self.journal = None

    def save(self):
        write(JOURNAL, self.journal)

    def recover(self):
        if not JOURNAL.exists(): return
        j = json.loads(backup.regular(JOURNAL).read_text())
        if j['state'] != str(self.state): raise RuntimeError('CHECKPOINT_RECOVERY_INSTALLATION')
        current = {row[0]:row for row in backup.rows(backup.REGISTRY)}
        for owner,slot,image in j['containers']:
            row = current.get(owner)
            if not row or row[1] != slot or row[3] != image: raise RuntimeError('CHECKPOINT_RECOVERY_BINDING')
        # Mount all planned slots even when interruption happened between effect
        # and acknowledgement. Verify the exact backing image before resuming.
        for slot in j['slots']:
            run(['systemctl','start',unit(slot)])
            check_mount(Path(ROOT)/'slots'/str(slot), Path(ROOT)/'images'/f'slot{slot}.ext4')
        for owner,_,image in j['containers']:
            row = current[owner]
            if row[2] == 'revoked': continue
            info=json.loads(run(self.podman+['inspect',container_name(owner)]))[0]
            if not idle_container(info,owner,image): run(self.podman+['start',container_name(owner)])
        if j['broker']:
            # Root's offline SQLite reader may create WAL sidecars. Return them
            # to the registry owner before its unprivileged writer resumes.
            registry_stat=backup.regular(backup.REGISTRY).stat()
            for suffix in ['-wal','-shm']:
                sidecar=Path(str(backup.REGISTRY)+suffix)
                if sidecar.exists():
                    backup.regular(sidecar)
                    os.chown(sidecar,registry_stat.st_uid,registry_stat.st_gid)
            run(['systemctl','start',BROKER])
        # Only the exact previously stopped containers may resume. Never recreate
        # a container after another release changed the deployment while offline.
        for name in [ENGINE,GATEWAY]:
            if name not in j['hub']: continue
            value=json.loads(run(['docker','inspect',name]))[0]
            if value['Id'] != j['hub'][name]: raise RuntimeError('CHECKPOINT_HUB_CHANGED')
            run(['docker','start',name])
        JOURNAL.unlink()

    def create(self):
        if JOURNAL.exists(): raise RuntimeError('CHECKPOINT_RECOVERY_REQUIRED')
        config=json.loads(backup.regular(self.state/'config.json').read_text())
        if not config.get('team',{}).get('enabled'): raise RuntimeError('TEAM_REQUIRED')
        if not config.get('serverWorkspaces'): raise RuntimeError('WORKSPACES_NOT_ACTIVATED')
        if config['team'].get('root')!=str(self.state/'data/team'): raise RuntimeError('TEAM_PATH_BINDING')
        engine=inspect(ENGINE);gateway=inspect(GATEWAY)
        revision=engine['Config']['Labels']['org.opencontainers.image.revision']
        if not re.fullmatch('[a-f0-9]{7,64}',revision): raise RuntimeError('REVISION_INVALID')
        # Exact state mount prevents coordinating an unrelated Docker deployment.
        for name,value in [(ENGINE,engine),(GATEWAY,gateway)]:
            if not any(m['Source']==str(self.state/'config.json') and m['Destination']=='/config/config.json' for m in value['Mounts']):
                raise RuntimeError('HUB_STATE_BINDING')
        if run(['systemctl','show',BROKER,'-p','ActiveState','--value']) != 'active': raise RuntimeError('BROKER_UNAVAILABLE')
        bindings=backup.rows(backup.REGISTRY)
        required=sum((Path(ROOT)/'images'/f'slot{r[1]}.ext4').stat().st_blocks*512 for r in bindings)
        if shutil.disk_usage(self.destination).free < required+2*1024**3: raise RuntimeError('CHECKPOINT_SPACE')
        run(['docker','exec',ENGINE,'node','dist/maintenance-check.js'])
        # Journal BEFORE reserving. If its reply is lost while the engine remains
        # running, the ordinary reservation expires; never restart active work.
        self.journal={'state':str(self.state),'hub':{ENGINE:engine['Id'],GATEWAY:gateway['Id']},'broker':True,'containers':[],'slots':[]}
        self.save()
        run(['docker','exec',ENGINE,'node','dist/maintenance-check.js','--reserve-terminals'])
        run(['docker','stop','--time','10',GATEWAY])
        run(['docker','stop','--time','45',ENGINE])
        run(['systemctl','stop',BROKER])
        bindings=backup.rows(backup.REGISTRY)
        # Broker closed all exec channels. Anything other than the fixed PID 1
        # is untracked work; abort and resume services, never stop that command.
        for owner,slot,state,image in bindings:
            info=json.loads(run(self.podman+['inspect',container_name(owner)]))[0]
            if idle_container(info,owner,image):
                processes=run(self.podman+['top',container_name(owner),'pid','args']).splitlines()
                if len(processes)!=2 or processes[1].split()!=['1','sleep','infinity']:
                    raise RuntimeError('WORKSPACE_BACKGROUND_WORK')
                if state!='ready': raise RuntimeError('WORKSPACE_NOT_READY')
                self.journal['containers'].append([owner,slot,image]);self.save()
        for owner,_,_ in self.journal['containers']:
            run(self.podman+['stop','--time','10',container_name(owner)])
        for _,slot,_,_ in bindings:
            check_mount(Path(ROOT)/'slots'/str(slot),Path(ROOT)/'images'/f'slot{slot}.ext4')
            self.journal['slots'].append(slot);self.save()
            run(['systemctl','stop',unit(slot)])
        name='checkpoint-'+time.strftime('%Y%m%dT%H%M%S')+'-'+str(uuid.uuid4())
        target=self.destination/name;target.mkdir(mode=0o700)
        hub=target/'hub';hub.mkdir(mode=0o700);os.chown(hub,self.host['hubUid'],self.host['hubUid'])
        args=['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1g','--cpus','1','--pids-limit','64',
              '--user',str(self.host['hubUid'])+':'+str(self.settings['hubGid']),
              # SQLite's read-only connection still needs writable directories
              # for WAL/SHM bookkeeping after a clean cold shutdown. The trusted
              # backup CLI opens source databases readOnly; Hub and broker stay
              # stopped. A read-only mount makes a valid WAL database unreadable.
              '--mount',f'type=bind,src={self.state},dst={self.state}',
              '--mount',f'type=bind,src={hub},dst=/snapshots',engine['Config']['Image'],
              'node','dist/maintenance.js','backup','--config',str(self.state/'config.json'),'--destination','/snapshots','--keep','1','--revision',revision,
              '--private-file','config.json='+str(self.state/'config.json')]
        result=json.loads(run(args,timeout=900).splitlines()[-1])
        snapshot=Path(result['snapshot'])
        if snapshot.parent!=Path('/snapshots') or not snapshot.name.startswith('codex-team-backup-'): raise RuntimeError('TEAM_SNAPSHOT_PATH')
        team=hub/snapshot.name
        backup.create(target/'disks',team)
        # Team CLI verifies its entire content; disk verifier binds it to the exact
        # registry hash. Publish completion only after both have succeeded.
        backup.verify(target/'disks',team)
        write(target/'complete.json',{'format':1,'created':time.time(),'revision':revision,'team':str(team.relative_to(target)),
                                    'diskManifest':backup.digest(target/'disks/manifest.json')})
        return target

    def prune(self):
        completed=[]
        for target in self.destination.iterdir():
            if not re.fullmatch(r'checkpoint-[0-9]{8}T[0-9]{6}-[a-f0-9-]{36}',target.name): continue
            if target.is_symlink() or target.stat().st_uid!=0 or not target.is_dir(): continue
            try:
                manifest=json.loads(backup.regular(target/'complete.json').read_text())
                if backup.digest(target/'disks/manifest.json')!=manifest['diskManifest']: continue
                completed.append(target)
            except (OSError,ValueError,KeyError,RuntimeError): continue
        # Root-owned private parent; never prune incomplete/foreign directories.
        for target in sorted(completed,reverse=True)[self.settings['keep']:]:
            if canonical(target).parent!=self.destination: raise RuntimeError('RETENTION_PATH')
            shutil.rmtree(target)


def main():
    if os.geteuid()!=0 or sys.argv[1:] not in ([],['--recover']): raise RuntimeError('ROOT_FIXED_COMMAND_REQUIRED')
    settings=json.loads(backup.regular(SETTINGS).read_text())
    with ExitStack() as locks:
        for path in [LOCK,canonical(settings['state'])/'send-handoff-deploy.lock',canonical(settings['state'])/'data/team/gpt-host.lock']:
            canonical(path)
            file=locks.enter_context(path.open('a'))
            fcntl.flock(file,fcntl.LOCK_EX|fcntl.LOCK_NB)
        operation=Checkpoint(settings)
        if sys.argv[1:]==['--recover']:
            operation.recover();return
        if JOURNAL.exists(): raise RuntimeError('CHECKPOINT_RECOVERY_REQUIRED')
        for marker in operation.destination.glob('checkpoint-*/complete.json'):
            value=json.loads(backup.regular(marker).read_text())
            if 0 <= time.time()-value.get('created',0) < 23*3600:
                print(json.dumps({'ok':True,'recentCheckpoint':True}));return
        try:
            result=operation.create();print(json.dumps({'ok':True,'checkpoint':str(result)}))
        finally:
            operation.recover()
        operation.prune()


if __name__=='__main__':
    os.umask(0o077)
    try: main()
    except Exception as error:
        # Fixed errors/commands only; never print captured terminal/content bytes.
        print('Workspace checkpoint deferred: '+type(error).__name__+': '+str(error),file=sys.stderr)
        sys.exit(1)
