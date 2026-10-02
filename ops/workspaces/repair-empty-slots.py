#!/usr/bin/python3
"""Repair leftover empty acceptance scaffolding before the first user enrollment.

Without --apply this only reports slot entries. Never removes files or links,
formats disks, resets receipts, changes permissions or stops a service.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
from acceptance import clear_empty_scaffold
from policy import HOME, ROOT, SLOTS, podman_command


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    if os.geteuid()!=0:raise RuntimeError('ROOT_REQUIRED')
    config=json.loads(Path('/etc/codex-workspaces/config.json').read_text())
    database=Path(HOME)/'registry.sqlite'
    if database.is_symlink() or database.resolve()!=database or not database.is_file():
        raise RuntimeError('REGISTRY_PATH_CHANGED')
    db=sqlite3.connect('file:'+str(database)+'?mode=rw',uri=True,timeout=5)
    try:
        db.execute('BEGIN IMMEDIATE')  # serialize with broker's slot allocation
        if db.execute('SELECT count(*) FROM workspaces').fetchone()[0]:
            raise RuntimeError('WORKSPACES_ALREADY_ENROLLED')
        containers=subprocess.check_output(podman_command(config['uid'])+['ps','-aq'],timeout=20)
        if containers.strip():raise RuntimeError('CONTAINERS_ALREADY_EXIST')
        slots=[]
        for index in range(SLOTS):
            slot=Path(ROOT)/'slots'/str(index)
            if slot.is_symlink() or slot.resolve()!=slot or not slot.is_mount() or slot.stat().st_uid!=config['uid']:
                raise RuntimeError('SLOT_PATH_CHANGED')
            before=sorted(p.name for p in slot.iterdir() if p.name!='lost+found')
            removed=clear_empty_scaffold(slot) if args.apply else []
            remaining=sorted(p.name for p in slot.iterdir() if p.name!='lost+found')
            slots.append(dict(slot=index,before=before,removed=removed,remaining=remaining))
        print(json.dumps(dict(applied=args.apply,ready=all(not s['remaining'] for s in slots),slots=slots)))
    finally:
        db.rollback();db.close()


if __name__=='__main__':main()
