"""Fixed host paths are redirected to temporary storage; no services are changed."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(REPO/'ops/workspaces'))


class Installer(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.state=self.root/'state';self.state.mkdir()
        self.package=self.root/'package';self.account=pwd.getpwuid(os.getuid())
        subprocess.run([sys.executable,str(REPO/'ops/workspaces/package-checkpoint.py'),
                        '--output',str(self.package),'--hub-user',self.account.pw_name,'--state',str(self.state)],check=True,capture_output=True)
        spec=importlib.util.spec_from_file_location('checkpoint_installer',self.package/'install-checkpoint.py')
        self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module)
        self.commands=[]
        def host_path(*parts):
            path=Path(*parts)
            if str(path).startswith(('/opt/codex-workspace-checkpoint','/etc/codex-workspaces','/etc/systemd/system','/var/lib/codex-workspace-checkpoint')):
                return self.root/'host'/str(path).lstrip('/')
            return path
        self.host_path=host_path
        host=host_path('/etc/codex-workspaces/config.json');host.parent.mkdir(parents=True)
        host.write_text(json.dumps({'hubUid':self.account.pw_uid}))
        for directory in ['/var/lib','/opt','/etc/systemd/system']:
            (self.root/'host'/directory.lstrip('/')).mkdir(parents=True,exist_ok=True)
        from install import write
        self.patches=[patch.object(self.module,'Path',host_path),
                      patch.object(self.module,'write',lambda path,text,mode=0o644:write(host_path(path),text,mode)),
                      patch.object(self.module.os,'geteuid',return_value=0),
                      patch.object(sys,'argv',['install-checkpoint.py','--apply']),
                      patch.object(self.module.subprocess,'run',lambda args,**_:self.commands.append(args))]

    def apply(self):
        from contextlib import ExitStack
        with ExitStack() as stack:
            for item in self.patches:stack.enter_context(item)
            self.module.main()

    def test_installs_exact_dependencies_and_receipt_without_starting_checkpoint(self):
        self.apply()
        manifest=json.loads((self.package/'checkpoint-package.json').read_text())
        receipt=json.loads((self.state/'workspace-checkpoint-install.json').read_text())
        self.assertEqual(receipt['keep'],3);self.assertFalse(receipt['checkpointRun'])
        self.assertEqual(receipt['files'],{key:value for key,value in manifest['files'].items() if key!='install-checkpoint.py'})
        self.assertIn(['systemctl','enable','--now','codex-workspace-checkpoint.timer'],self.commands)
        self.assertFalse(any('codex-workspace-checkpoint.service' in call for call in self.commands))
        for name in receipt['files']:
            self.assertEqual(self.host_path('/opt/codex-workspace-checkpoint',name).read_bytes(),(self.package/name).read_bytes())

    def test_tampered_dependency_refuses_before_any_host_write(self):
        (self.package/'engine_checkpoint.py').write_text('changed')
        with self.assertRaisesRegex(RuntimeError,'PACKAGE_HASH'):self.apply()
        self.assertFalse(self.host_path('/opt/codex-workspace-checkpoint').exists())
        self.assertFalse(self.commands)

    def test_only_an_exact_local_maintenance_image_is_accepted(self):
        path=self.package/'checkpoint-package.json'
        manifest=json.loads(path.read_text());manifest['backupImage']='latest'
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RuntimeError,'BACKUP_IMAGE_DIGEST'):self.apply()
        self.assertFalse(self.commands)
        image='sha256:'+'b'*64;manifest['backupImage']=image
        path.write_text(json.dumps(manifest))
        with patch.object(self.module.subprocess,'check_output',return_value=json.dumps([{'Id':image,'Config':{'Labels':{'org.opencontainers.image.revision':'abc1234'}}}])):
            self.apply()
        settings=json.loads(self.host_path('/etc/codex-workspaces/checkpoint.json').read_text())
        self.assertEqual(settings['backupImage'],image)
        self.assertEqual(settings['backupImageRevision'],'abc1234')


if __name__=='__main__':unittest.main()
