#!/usr/bin/python3
"""Verify the prepared source bundle before running its administrator step."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

FILES = {'apply-bundle.py', 'prepare.py', 'acceptance.py', 'policy.py'}


def verify(directory):
    directory = Path(directory)
    manifest = directory / 'manifest.json'
    if manifest.is_symlink():
        raise RuntimeError('BUNDLE_SYMLINK')
    value = json.loads(manifest.read_text())
    if value.get('schema') != 1 or value.get('kind') != 'personal-linux-preparation':
        raise RuntimeError('BUNDLE_KIND_INVALID')
    if set(value.get('files', {})) != FILES:
        raise RuntimeError('BUNDLE_FILES_INVALID')
    for name, digest in value['files'].items():
        source = directory / name
        if source.is_symlink() or not source.is_file():
            raise RuntimeError('BUNDLE_FILE_INVALID')
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise RuntimeError('BUNDLE_HASH_MISMATCH: ' + name)
    return value


def main():
    directory = Path(__file__).resolve().parent
    value = verify(directory)
    if sys.argv[1:] not in ([], ['--apply']):
        raise RuntimeError('Use no arguments for the plan or --apply for installation.')
    print('Verified personal Linux bundle ' + value['revision'], flush=True)
    environment = dict(os.environ)
    for key in tuple(environment):
        if key.startswith('PYTHON'):
            del environment[key]
    return subprocess.call([sys.executable, '-E', '-s', str(directory / 'prepare.py'),
                            *sys.argv[1:]], cwd=directory, env=environment)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
