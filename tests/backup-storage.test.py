"""Backup policy tests use disposable files and mocked disk/restic boundaries."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path('ops/linux').resolve()))
import backup_storage as storage
import checkpoint_retention as retention

class BackupStorage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / 'state'; self.state.mkdir()
        self.root = Path(self.temp.name) / 'hdd'; self.root.mkdir(mode=0o700)
    def test_default_legacy_and_missing_mount_never_falls_back(self):
        self.assertEqual(storage.checkpoint_root(self.state), self.state / 'backups')
        (self.state / 'backup-storage.json').write_text(json.dumps(dict(root=str(self.root), mount=str(self.root), uuid='expected')))
        with self.assertRaisesRegex(RuntimeError, 'DISK_UNAVAILABLE'):
            storage.checkpoint_root(self.state)
    def test_configured_root_is_used(self):
        with patch.object(storage, 'settings', return_value=self.root):
            self.assertEqual(storage.checkpoint_root(self.state), self.root / 'engine-checkpoints')
        self.assertFalse((self.state / 'backups').exists())
    def test_failed_archive_does_not_prune_prior_checkpoints(self):
        directory=self.root/'engine-checkpoints'; directory.mkdir()
        for n in range(2):
            target=directory/f'before-team-engine-abcdef0-{n}'; target.mkdir()
            (target/'checkpoint.json').write_text(json.dumps(dict(kind='codex-web-engine-checkpoint',format=1,state=str(self.state),revision='aaaaaaa',createdAt=n)))
            (target/'verified.json').write_text(json.dumps(dict(restored=True,revision='aaaaaaa')))
            (target/'admitted.json').write_text(json.dumps(dict(revision='abcdef0')))
        with patch.object(storage,'settings',return_value=self.root),patch.object(storage,'archive',side_effect=RuntimeError('injected repository failure')):
            with self.assertRaisesRegex(RuntimeError, 'repository failure'):retention.prune(self.state)
        self.assertEqual(len(list(directory.iterdir())),2)
    def test_failed_check_never_forgets_previous_snapshot(self):
        source=self.root/'checkpoint';source.mkdir();(source/'checkpoint.json').write_text('{}')
        calls=[]
        def restic(root,*args,**kwargs):
            calls.append(args)
            if args[0]=='backup':return json.dumps(dict(message_type='summary',snapshot_id='abc'))
            raise RuntimeError('failed check')
        with patch.object(storage,'restic',side_effect=restic):
            with self.assertRaisesRegex(RuntimeError,'failed check'):storage.archive(self.root,source,'engine')
        self.assertFalse(any(args[0]=='forget' for args in calls))
        self.assertTrue(source.exists())
    def test_busy_daily_does_not_launch_docker(self):
        import fcntl
        with (self.state/'send-handoff-deploy.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch.object(storage,'settings',return_value=self.root),patch.object(storage.subprocess,'check_output') as run:
                storage.daily(self.state);run.assert_not_called()

if __name__=='__main__':unittest.main()
