#!/usr/bin/python3
"""Install only the fixed automatic checkpoint service, never reinstall disks/runtime."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
from install import write

FILES={'checkpoint.py','backup.py','policy.py','install.py','install-checkpoint.py'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    source=Path(__file__).resolve().parent
    manifest=json.loads((source/'checkpoint-package.json').read_text())
    if set(manifest['files'])!=FILES: raise RuntimeError('PACKAGE_FILES')
    for name,digest in manifest['files'].items():
        path=source/name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest: raise RuntimeError('PACKAGE_HASH')
    account=pwd.getpwnam(manifest['hubUser']);state=Path(manifest['state'])
    if state.resolve()!=state or state.stat().st_uid!=account.pw_uid: raise RuntimeError('INSTALLATION_PATH')
    settings={'state':str(state),'destination':'/var/lib/codex-workspace-checkpoint/backups','hubGid':account.pw_gid,'keep':3}
    host=json.loads(Path('/etc/codex-workspaces/config.json').read_text())
    if host['hubUid']!=account.pw_uid: raise RuntimeError('INSTALLATION_OWNER')
    print('Installs a daily idle-only paired Hub/workspace checkpoint; keeps three verified copies. No disk formatting, runtime replacement or user commands.')
    if not args.apply: return
    if os.geteuid()!=0: raise RuntimeError('ROOT_REQUIRED')
    for path in ['/var/lib/codex-workspace-checkpoint',settings['destination'],'/opt/codex-workspace-checkpoint']:
        path=Path(path)
        if path.resolve()!=path or (path.exists() and path.stat().st_uid!=0): raise RuntimeError('INSTALL_DIRECTORY')
        path.mkdir(mode=0o700,exist_ok=True);path.chmod(0o700)
    # Never replace coordinator modules while it is copying or recovering. New
    # timer invocations use the same nonblocking lock and defer until we finish.
    lock=Path('/var/lib/codex-workspace-checkpoint/lock').open('a')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if Path('/var/lib/codex-workspace-checkpoint/journal.json').exists(): raise RuntimeError('RECOVER_PREVIOUS_CHECKPOINT_FIRST')
    for name in ['checkpoint.py','backup.py','policy.py','install.py']:
        write('/opt/codex-workspace-checkpoint/'+name,(source/name).read_text())
    write('/etc/codex-workspaces/checkpoint.json',json.dumps(settings),0o600)
    write('/etc/systemd/system/codex-workspace-checkpoint.service','''[Unit]
Description=CodexWeb paired private Hub and workspace checkpoint
After=docker.service codex-workspace-broker.service

[Service]
Type=oneshot
UMask=0077
TimeoutStartSec=45min
TimeoutStopSec=5min
ExecStart=/usr/bin/python3 /opt/codex-workspace-checkpoint/checkpoint.py
ExecStopPost=/usr/bin/python3 /opt/codex-workspace-checkpoint/checkpoint.py --recover
''')
    write('/etc/systemd/system/codex-workspace-checkpoint.timer','''[Unit]
Description=Retry private workspace checkpoint during an idle maintenance window

[Timer]
OnBootSec=10min
OnUnitInactiveSec=30min
Persistent=true
RandomizedDelaySec=10min
Unit=codex-workspace-checkpoint.service

[Install]
WantedBy=timers.target
''')
    subprocess.run(['systemctl','daemon-reload'],check=True)
    # Coordinator refuses before Hub activation. Busy work is deferred; a recent
    # verified pair suppresses further cold checkpoints for 23 hours.
    subprocess.run(['systemctl','enable','--now','codex-workspace-checkpoint.timer'],check=True)
    lock.close()
    print('Checkpoint timer installed. It waits for Hub activation and idle work.')


if __name__=='__main__':main()
