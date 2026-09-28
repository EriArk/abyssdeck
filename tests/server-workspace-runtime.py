"""Focused real-tool acceptance in a disposable rootless store; no production accounts.
Usage: python3 tests/server-workspace-runtime.py /absolute/runtime.tar
The fake ssh executable changes only transport into this isolated container.
Broker authorization/isolation are covered separately by server-workspaces.test.py.
"""
import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops/workspaces'))
from install import archive_image_id
from policy import container_args, container_name
source=Path(__file__).resolve().parents[1]
archive=Path(sys.argv[1]);image=archive_image_id(archive)
root=Path(tempfile.mkdtemp(prefix='cw-workflow-',dir='/tmp'));owner=str(uuid.uuid4())
env={**os.environ,'XDG_CONFIG_HOME':str(root/'config')}
cmd=['/usr/bin/podman','--root',str(root/'storage'),'--runroot',str(root/'run'),'--storage-driver=vfs','--cgroup-manager=systemd']
def run(args,**kwargs):return subprocess.run(cmd+args,env=env,cwd=root,check=True,**kwargs)
try:
    with archive.open('rb') as f:run(['load'],stdin=f,stdout=subprocess.DEVNULL,timeout=180)
    workspace=root/'workspace';workspace.mkdir()
    for name in ['home','projects','integration','services']:(workspace/name).mkdir()
    args=container_args(owner,0,image)
    args[args.index('--mount=type=bind,src=/srv/codex-workspaces/slots/0,dst=/workspace,rw')]='--mount=type=bind,src='+str(workspace)+',dst=/workspace,rw'
    run(args,stdout=subprocess.DEVNULL,timeout=60)
    bindir=root/'bin';bindir.mkdir()
    (bindir/'ssh').write_text('''#!/usr/bin/python3
import os,sys,shlex,json
a=shlex.split(sys.argv[-1]);owner=os.environ['CW_RUNTIME_OWNER']
assert a[:8]==['/usr/bin/python3','/opt/codex-workspace-broker/client.py','--key-file','/fixture','--owner',owner,'--cwd',a[7]]
assert a[8]=='exec'
cmd=json.loads(os.environ['CW_PODMAN'])+['exec','--interactive','--workdir',a[7],'--',os.environ['CW_CONTAINER']]+a[9:]
os.execv(cmd[0],cmd)
''');(bindir/'ssh').chmod(0o700)
    testenv={**env,'PATH':str(bindir)+':'+env['PATH'],'CW_PODMAN':json.dumps(cmd),'CW_CONTAINER':container_name(owner),'CW_RUNTIME_OWNER':owner,'CW_RUNTIME_TMP':str(root)}
    subprocess.run(['node','tests/server-workspace-runtime.mjs'],cwd=source,env=testenv,check=True,timeout=120)
finally:
    subprocess.run(cmd+['rm','--force',container_name(owner)],env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
    assert root.parent==Path('/tmp') and root.name.startswith('cw-workflow-')
    run(['unshare','python3','-c','import shutil,sys;shutil.rmtree(sys.argv[1])',str(root)],timeout=90)
