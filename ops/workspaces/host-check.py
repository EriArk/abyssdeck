#!/usr/bin/python3
"""Root-only service admission. No browser data or paths are consumed."""
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
from policy import SLOTS, DISK_GIB, ROOT, firewall, slot_path


def run(args):
    return subprocess.check_output(args, text=True).strip()


def normalize(value):
    if isinstance(value, list): return [normalize(v) for v in value]
    if isinstance(value, dict):
        return {k: ({} if k=='counter' else normalize(v)) for k,v in value.items() if k not in ('handle','metainfo')}
    return value


def main():
    if os.geteuid() != 0:
        raise RuntimeError('ROOT_REQUIRED')
    config = json.loads(Path('/etc/codex-workspaces/config.json').read_text())
    account = pwd.getpwnam('codex-workspaces')
    if account.pw_uid != config['uid'] or account.pw_dir != '/var/lib/codex-workspaces':
        raise RuntimeError('ACCOUNT_CHANGED')
    if sys.argv[1:] == ['network']:
        # Replace only our table in one atomic nft transaction; leave Docker/UFW intact.
        old = subprocess.run(['/usr/sbin/nft', 'list', 'table', 'inet', 'codex_workspaces'],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        rules = ('delete table inet codex_workspaces\n' if old else '') + firewall(account.pw_uid)
        subprocess.run(['/usr/sbin/nft', '-f', '-'], input=rules, text=True, check=True)
        installed=json.loads(run(['/usr/sbin/nft','-j','list','table','inet','codex_workspaces']))
        Path('/etc/codex-workspaces/network-policy.json').write_text(json.dumps(normalize(installed)))
        return
    rules = json.loads(run(['/usr/sbin/nft', '-j', 'list', 'table', 'inet', 'codex_workspaces']))
    if not rules.get('nftables') or normalize(rules)!=json.loads(Path('/etc/codex-workspaces/network-policy.json').read_text()):
        raise RuntimeError('NETWORK_POLICY_CHANGED')
    for slot in range(SLOTS):
        mount = Path(slot_path(slot)); image = Path(ROOT) / 'images' / f'slot{slot}.ext4'
        info = image.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077 or info.st_size != DISK_GIB * 1024**3:
            raise RuntimeError('DISK_INVALID')
        if mount.is_symlink() or not mount.is_mount() or mount.resolve() != mount:
            raise RuntimeError('QUOTA_MOUNT_MISSING')
        mounted = json.loads(run(['/usr/bin/findmnt', '-J', '-M', str(mount), '-o', 'SOURCE,FSTYPE,OPTIONS']))['filesystems'][0]
        if mounted['fstype'] != 'ext4' or not {'rw', 'nosuid', 'nodev'} <= set(mounted['options'].split(',')):
            raise RuntimeError('QUOTA_MOUNT_INVALID')
        backing = run(['/usr/sbin/losetup', '--noheadings', '--output', 'BACK-FILE', mounted['source']])
        if backing != str(image):
            raise RuntimeError('DISK_BINDING_INVALID')
        if mount.stat().st_uid != account.pw_uid:
            raise RuntimeError('DISK_OWNER_INVALID')
    print('Workspace host boundaries ready')


if __name__ == '__main__':
    main()
