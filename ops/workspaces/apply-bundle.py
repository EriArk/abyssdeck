#!/usr/bin/python3
"""Apply an exact reviewed local setup bundle. Never downloads or guesses a release."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    root=Path(__file__).resolve().parent
    manifest=json.loads((root/'setup-manifest.json').read_text())
    expected={'broker.py','policy.py','host-check.py','client.py','acceptance.py','install.py','apply-bundle.py'}
    if set(manifest['files'])!=expected: raise RuntimeError('BUNDLE_FILES_INVALID')
    for name,digest in manifest['files'].items():
        path=root/name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
            raise RuntimeError('BUNDLE_HASH_MISMATCH')
    if not args.apply:
        print('Release: '+manifest['revision'])
        print('Hub account: '+manifest['hubUser'])
        print('Hub state: '+manifest['hubState'])
        subprocess.run(['/usr/bin/python3',str(root/'install.py')],check=True)
        return
    result=subprocess.run(['/usr/bin/python3',str(root/'install.py'),'--apply',
        '--hub-user',manifest['hubUser'],'--hub-state',manifest['hubState'],
        '--image-archive',str(root/'runtime.tar'),'--image-id',manifest['image'],
        '--archive-sha256',manifest['archiveSha256']])
    return result.returncode


if __name__=='__main__': sys.exit(main())
