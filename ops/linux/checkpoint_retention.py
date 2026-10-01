#!/usr/bin/env python3
"""Keep the last three verified, admitted engine checkpoints of this installation.

Caller of prune() holds send-handoff-deploy.lock. The CLI takes that same lock;
ordinary chats and the running Hub are never stopped for retention.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import time

KEEP = 3
NAME = re.compile(r'before-team-engine-([a-f0-9]{7,64})-([0-9]+)')


def plan(state):
    state = Path(state)
    if not state.is_absolute() or state.resolve() != state:
        raise RuntimeError('RETENTION_STATE_PATH')
    root = state / 'backups'
    if root.is_symlink() or root.resolve() != root:
        raise RuntimeError('RETENTION_BACKUP_PATH')
    candidates, skipped = [], []
    for path in root.iterdir() if root.exists() else []:
        match = NAME.fullmatch(path.name)
        if not match or path.is_symlink() or not path.is_dir():
            continue
        try:
            records = []
            for name in ['checkpoint.json', 'verified.json', 'admitted.json']:
                source = path / name
                if source.is_symlink() or not source.is_file():
                    raise ValueError('incomplete')
                records.append(json.loads(source.read_text()))
            manifest, verified, admitted = records
            if not (manifest.get('kind') == 'codex-web-engine-checkpoint'
                    and manifest.get('format') == 1 and manifest.get('state') == str(state)
                    and verified.get('restored') is True
                    and verified.get('revision') == manifest.get('revision')
                    and admitted.get('revision') == match[1]
                    and type(manifest.get('createdAt')) is int):
                raise ValueError('unrecognized')
            info = path.stat()
            candidates.append((manifest['createdAt'], path.name, info.st_dev, info.st_ino))
        except (OSError, ValueError, TypeError, AttributeError):
            skipped.append(path.name)
    candidates.sort(reverse=True)
    return {'keep': [v[1] for v in candidates[:KEEP]],
            'remove': [v[1] for v in candidates[KEEP:]],
            'identities': {v[1]: [v[2], v[3]] for v in candidates}, 'skipped': sorted(skipped)}


def record(state, result):
    target = state / 'checkpoint-retention.json'
    temporary = target.with_suffix('.tmp')
    with temporary.open('w') as stream:
        os.fchmod(stream.fileno(), 0o600)
        json.dump(result, stream)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(target)


def prune(state):
    state = Path(state)
    selected = plan(state)
    result = {**selected, 'removed': [], 'state': 'running', 'at': time.time()}
    record(state, result)
    try:
        for name in selected['remove']:
            target = state / 'backups' / name
            if target.is_symlink() or target.resolve() != target or target.parent != state / 'backups':
                raise RuntimeError('RETENTION_TARGET_CHANGED')
            info = target.stat()
            if [info.st_dev, info.st_ino] != selected['identities'][name]:
                raise RuntimeError('RETENTION_TARGET_CHANGED')
            shutil.rmtree(target)
            result['removed'].append(name)
            record(state, result)
        result['state'] = 'complete'
    except Exception as error:
        result['state'] = 'partial'
        result['error'] = type(error).__name__
        record(state, result)
        raise
    record(state, result)
    return result


def after_upgrade(state):
    # A cleanup failure must not turn a healthy, admitted release into a rollback.
    try:
        return prune(state)
    except Exception as error:
        return {'state': 'deferred', 'error': type(error).__name__}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    # Validate the installation path before opening its fixed lock file.
    plan(args.state)
    with (args.state / 'send-handoff-deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'state': 'deferred', 'reason': 'deployment-busy'}))
            return
        print(json.dumps(prune(args.state) if args.apply else plan(args.state)))


if __name__ == '__main__':
    os.umask(0o077)
    main()
