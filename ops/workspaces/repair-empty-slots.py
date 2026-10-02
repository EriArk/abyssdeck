#!/usr/bin/python3
"""Repair leftover acceptance scaffolding before the first user enrollment.

Without --apply this only reports slot entries. Apply removes empty directories
and the exact unused Codex --version launcher links/empty lock. Preserves other
files/links; never formats disks, resets receipts, changes permissions or stops a service.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
from acceptance import clear_empty_scaffold
from policy import HOME, ROOT, SLOTS, podman_command


def remaining_entries(slot, limit=64):
    """Bounded metadata only; never read file bytes or follow symbolic links."""
    slot=Path(slot)
    entries=[]
    pending=[(slot,0)]
    while pending and len(entries)<limit:
        directory,depth=pending.pop()
        with os.scandir(directory) as children:
            for child in children:
                if directory==slot and child.name=='lost+found':continue
                if len(entries)>=limit:break
                info=child.stat(follow_symlinks=False)
                kind='directory' if stat.S_ISDIR(info.st_mode) else 'link' if stat.S_ISLNK(info.st_mode) else 'file'
                entries.append(dict(path=str(Path(child.path).relative_to(slot)),kind=kind,bytes=info.st_size))
                if kind=='directory' and depth<8:pending.append((Path(child.path),depth+1))
    return entries


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
            slots.append(dict(slot=index,before=before,removed=removed,remaining=remaining,
                              entries=remaining_entries(slot) if remaining else []))
        print(json.dumps(dict(applied=args.apply,ready=all(not s['remaining'] for s in slots),slots=slots)))
    finally:
        db.rollback();db.close()


if __name__=='__main__':main()
