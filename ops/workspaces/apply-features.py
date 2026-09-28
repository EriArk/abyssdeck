#!/usr/bin/python3
"""One reviewed pre-enrollment upgrade: browser runtime plus paired checkpoint timer."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
from install import archive_image_id
from policy import HOME

def main():
    if sys.argv[1:] not in ([],['--apply']): raise RuntimeError('ARGUMENTS_INVALID')
    root=Path(__file__).resolve().parent
    manifest=json.loads((root/'features-package.json').read_text())
    expected={'apply-features.py','install.py','broker.py','client.py','policy.py','host-check.py','acceptance.py','checkpoint.py','backup.py','install-checkpoint.py','checkpoint-package.json'}
    if set(manifest['files'])!=expected: raise RuntimeError('PACKAGE_FILES')
    for name,digest in manifest['files'].items():
        path=root/name
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest: raise RuntimeError('PACKAGE_HASH')
    archive=root/'runtime.tar'
    if archive.is_symlink() or not archive.is_file(): raise RuntimeError('ARCHIVE_INVALID')
    with archive.open('rb') as file:
        if hashlib.file_digest(file,'sha256').hexdigest()!=manifest['archiveSha256']: raise RuntimeError('ARCHIVE_HASH')
    if archive_image_id(archive)!=manifest['image']: raise RuntimeError('IMAGE_ID')
    print('Verified release '+manifest['revision']+'. Adds an isolated preview browser and automatic paired backups. Existing disks are not formatted; no accounts are copied.')
    if sys.argv[1:]!=['--apply']: return
    if os.geteuid()!=0: raise RuntimeError('ROOT_REQUIRED')
    # Read as the registry owner so SQLite never creates root-owned WAL sidecars.
    count=subprocess.check_output(['/usr/sbin/runuser','-u','codex-workspaces','--','/usr/bin/env',
        '--ignore-environment','--chdir='+HOME,'/usr/bin/python3','-c',
        "import sqlite3;db=sqlite3.connect('file:registry.sqlite?mode=ro',uri=True);print(db.execute('SELECT count(*) FROM workspaces').fetchone()[0]);db.close()"],text=True)
    if int(count.strip()): raise RuntimeError('EXISTING_WORKSPACES_REQUIRE_SEPARATE_IMAGE_MIGRATION')
    # This explicit update is only for the currently empty installed host. The
    # ordinary installer rechecks no Podman containers exist before any mutation.
    subprocess.run(['systemctl','stop','codex-workspace-broker.service'],check=True)
    subprocess.run(['/usr/bin/python3',str(root/'install.py'),'--apply','--hub-user',manifest['hubUser'],
        '--hub-state',manifest['state'],'--image-archive',str(archive),'--image-id',manifest['image'],'--archive-sha256',manifest['archiveSha256']],check=True)
    subprocess.run(['/usr/bin/python3',str(root/'install-checkpoint.py'),'--apply'],check=True)
    print('Host features ready. Hub activation is separate; no active chats were restarted.')

if __name__=='__main__':main()
