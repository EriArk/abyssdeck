#!/usr/bin/env python3
"""One optional disk-bound restic repository; never fall back to the system disk."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def settings(state):
    state = Path(state).resolve(strict=True)
    file = state / 'backup-storage.json'
    if not file.exists():
        return None
    if file.is_symlink():
        raise RuntimeError('BACKUP_CONFIG_LINK')
    config = json.loads(file.read_text())
    root, mount = Path(config['root']), Path(config['mount'])
    if (not mount.is_mount() or not root.is_absolute() or root.resolve() != root
            or not root.is_relative_to(mount) or root == mount
            or root.stat().st_dev != mount.stat().st_dev
            or root.stat().st_dev == state.stat().st_dev
            or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077):
        raise RuntimeError('BACKUP_DISK_UNAVAILABLE')
    uuid = subprocess.check_output(['findmnt', '-n', '-o', 'UUID', '--target', str(mount)], text=True).strip()
    if not config.get('uuid') or uuid != config['uuid']:
        raise RuntimeError('BACKUP_DISK_IDENTITY')
    return root


def checkpoint_root(state):
    root = settings(state)
    target = root / 'engine-checkpoints' if root else Path(state) / 'backups'
    if target.is_symlink():
        raise RuntimeError('BACKUP_DIRECTORY_LINK')
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    return target


def restic(root, *args, capture=False):
    env = dict(os.environ, RESTIC_REPOSITORY=str(root / 'repository'),
               RESTIC_PASSWORD_FILE=str(root / 'repository-password'),
               RESTIC_CACHE_DIR=str(root / 'cache'), TMPDIR=str(root / 'tmp'))
    for name in ['cache', 'tmp']:
        (root / name).mkdir(mode=0o700, exist_ok=True)
    result = subprocess.run(['restic', *args], env=env, check=True,
                            stdout=subprocess.PIPE if capture else None, text=True)
    return result.stdout


def archive(root, source, kind):
    source = Path(source)
    if source.resolve() != source or not source.is_relative_to(root) or source == root:
        raise RuntimeError('BACKUP_SOURCE_BOUNDARY')
    marker = source / ('checkpoint.json' if kind == 'engine' else 'team-manifest.json')
    if marker.is_symlink() or not marker.is_file():
        raise RuntimeError('BACKUP_MANIFEST_MISSING')
    tag = 'abyssdeck-' + kind
    output = restic(root, 'backup', '--json', '--tag', tag, '--host', 'abyssdeck', str(source), capture=True)
    summary = next(json.loads(line) for line in output.splitlines()
                   if json.loads(line).get('message_type') == 'summary')
    snapshot = summary['snapshot_id']
    restic(root, 'check')
    # Check a real restored object, not just the presence of a snapshot record.
    with tempfile.TemporaryDirectory(dir=root / 'tmp') as temporary:
        restic(root, 'restore', snapshot, '--target', temporary, '--include', str(marker))
        restored = Path(temporary) / marker.relative_to('/')
        if hashlib.sha256(restored.read_bytes()).digest() != hashlib.sha256(marker.read_bytes()).digest():
            raise RuntimeError('BACKUP_RESTORE_MISMATCH')
    # A failed backup/check/restore never expires the preceding good snapshot.
    restic(root, 'forget', '--tag', tag, '--group-by', 'tags', '--keep-last', '1', '--prune')
    restic(root, 'check')
    receipt = dict(snapshot=snapshot, source=str(source), kind=kind,
                   bytesAdded=summary.get('data_added'), restoredManifest=True)
    temporary = root / ('last-' + kind + '.tmp')
    temporary.write_text(json.dumps(receipt) + '\n'); temporary.chmod(0o600)
    temporary.replace(root / ('last-' + kind + '.json'))
    return receipt


def daily(state, maintenance=False):
    root = settings(state)
    if root is None:
        raise RuntimeError('BACKUP_STORAGE_NOT_CONFIGURED')
    with (state / 'send-handoff-deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'state': 'deferred', 'reason': 'deployment-busy'}))
            return
        stage = root / 'daily-staging'
        stage.mkdir(mode=0o700, exist_ok=True)
        engine = json.loads(subprocess.check_output(['docker', 'inspect', 'codex-web-engine']))[0]
        image = engine['Config']['Image']
        revision = engine['Config']['Labels']['org.opencontainers.image.revision']
        # Existing Team snapshot writer validates identities, databases and saved
        # bytes. All temporary copies are on the HDD; the live state stays read-only.
        command = ['docker', 'run', '--rm', '--name', 'abyssdeck-daily-backup', '--network', 'none',
                   '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                   '--user', f'{os.getuid()}:{os.getgid()}', '--memory', '1g', '--cpus', '1',
                   '-v', f'{state}:{state}:ro', '-v', f'{stage}:/snapshots', image,
                   'node', 'dist/maintenance.js', 'backup', '--config', str(state / 'config.json'),
                   '--destination', '/snapshots', '--keep', '1', '--revision', revision,
                   '--private-file', 'config.json=' + str(state / 'config.json'),
                   '--private-file', 'deploy.env=' + str(state / 'deploy.env')]
        if maintenance:
            # Preserve the existing weekly maintenance operation and schedule;
            # route its required pre-cleanup snapshot through this same HDD.
            command[command.index('abyssdeck-daily-backup')] = 'abyssdeck-storage-maintenance'
            command[command.index('-v'):command.index('-v')] = ['-v', f'{state / "data"}:{state / "data"}']
            start = command.index('dist/maintenance.js')
            command[start:] = ['dist/storage-cli.js', '--apply', '--config', str(state / 'config.json'),
                               '--destination', '/snapshots', '--revision', revision]
        output = subprocess.check_output(command, text=True)
        if maintenance:
            candidates = sorted(p for p in stage.glob('codex-team-backup-*') if p.is_dir() and not p.is_symlink())
            if not candidates:
                print(json.dumps({'state': 'complete', 'maintenance': True, 'snapshotCreated': False}))
                return
            name = candidates[-1].name
        else:
            result = json.loads(output.splitlines()[-1])
            name = Path(result['snapshot']).name
            if not name.startswith('codex-team-backup-') or Path(result['snapshot']).parent != Path('/snapshots'):
                raise RuntimeError('BACKUP_SNAPSHOT_PATH')
        source = stage / name
        receipt = archive(root, source, 'daily')
        for old in stage.iterdir():
            if old.is_dir() and not old.is_symlink() and old.name.startswith(('codex-team-backup-', '.team-partial-')):
                shutil.rmtree(old)
        print(json.dumps(receipt))


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--maintenance', action='store_true')
    args = parser.parse_args()
    daily(args.state.resolve(strict=True), args.maintenance)
