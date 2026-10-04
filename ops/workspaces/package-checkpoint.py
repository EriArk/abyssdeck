#!/usr/bin/python3
"""Assemble a private-state-free checkpoint updater from this checkout."""
import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True)
    parser.add_argument('--hub-user',required=True)
    parser.add_argument('--state',required=True)
    parser.add_argument('--backup-image',help='Optional locally verified immutable maintenance image sha256 digest')
    args=parser.parse_args()
    source=Path(__file__).resolve().parent
    destination=Path(args.output).resolve()
    destination.mkdir(mode=0o700)  # Never overwrite another prepared package.
    files={}
    for name in ['checkpoint.py','backup.py','policy.py','install.py','install-checkpoint.py','engine_checkpoint.py']:
        path=source.parent/'linux'/name if name=='engine_checkpoint.py' else source/name
        # Identical installed bytes whether the source checkout uses CRLF or LF.
        (destination/name).write_bytes(path.read_text(encoding='utf-8').encode('utf-8'))
        files[name]=hashlib.sha256((destination/name).read_bytes()).hexdigest()
    (destination/'checkpoint-package.json').write_text(json.dumps({
        'hubUser':args.hub_user,'state':args.state,'files':files,
        **({'backupImage':args.backup_image} if args.backup_image else {})},indent=2)+'\n')
    print(destination)


if __name__=='__main__':main()
