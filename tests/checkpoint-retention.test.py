"""Linux retention tests use disposable private directories, never live backups."""
import fcntl
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path('ops/linux').resolve()))
import checkpoint_retention as retention


class RetentionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name)
        self.root = self.state / 'backups'
        self.root.mkdir()
        (self.state / 'data').mkdir()
        (self.state / 'data/live').write_text('live data')

    def candidate(self, number, admitted=True):
        path = self.root / f'before-team-engine-abcdef0-{number}'
        path.mkdir()
        (path / 'data').mkdir()
        (path / 'data/contents').write_text('backup bytes')
        (path / 'checkpoint.json').write_text(json.dumps(dict(
            kind='codex-web-engine-checkpoint', format=1, state=str(self.state),
            revision='1234567', createdAt=number)))
        (path / 'verified.json').write_text(json.dumps(dict(restored=True, revision='1234567')))
        if admitted:
            (path / 'admitted.json').write_text(json.dumps(dict(revision='abcdef0', at=number)))
        return path

    def test_only_three_newest_and_dry_run_changes_nothing(self):
        copies = [self.candidate(n) for n in [8, 9, 10, 11, 12]]
        plan = retention.plan(self.state)
        self.assertEqual(plan['keep'], [p.name for p in reversed(copies[2:])])
        self.assertTrue(all(p.exists() for p in copies))
        result = retention.prune(self.state)
        self.assertEqual(result['removed'], [copies[1].name, copies[0].name])
        self.assertTrue(all(p.exists() for p in copies[2:]))
        self.assertFalse(any(p.exists() for p in copies[:2]))
        self.assertEqual((self.state / 'data/live').read_text(), 'live data')
        self.assertEqual(retention.prune(self.state)['removed'], [])

    def test_unfinished_foreign_and_linked_paths_are_not_candidates(self):
        for n in range(4):
            self.candidate(n + 10)
        unfinished = self.candidate(100, admitted=False)
        foreign = self.candidate(101)
        value = json.loads((foreign / 'checkpoint.json').read_text())
        value['state'] = '/different-installation'
        (foreign / 'checkpoint.json').write_text(json.dumps(value))
        damaged = self.candidate(102)
        (damaged / 'verified.json').write_text('{}')
        linked = self.root / 'before-team-engine-abcdef0-103'
        linked.symlink_to(self.state / 'data', target_is_directory=True)
        special = self.root / 'stable-pre-team'
        special.mkdir()
        result = retention.prune(self.state)
        self.assertEqual(len(result['keep']), 3)
        self.assertEqual(len(result['removed']), 1)
        self.assertTrue(all(p.exists() for p in [unfinished, foreign, damaged, linked, special]))
        self.assertEqual((self.state / 'data/live').read_text(), 'live data')

    def test_changed_directory_is_not_deleted(self):
        copies = [self.candidate(n) for n in range(4)]
        selected = retention.plan(self.state)
        copies[0].rename(self.root / 'saved-original')
        copies[0].mkdir()
        (copies[0] / 'changed').write_text('new unrelated data')
        with patch.object(retention, 'plan', return_value=selected):
            with self.assertRaisesRegex(RuntimeError, 'TARGET_CHANGED'):
                retention.prune(self.state)
        self.assertTrue((copies[0] / 'changed').exists())

    def test_deletion_failure_records_progress_and_does_not_fail_healthy_upgrade(self):
        copies = [self.candidate(n) for n in range(5)]
        original = retention.shutil.rmtree
        def remove(path):
            if path == copies[0]:
                raise OSError('injected deletion failure')
            original(path)
        with patch.object(retention.shutil, 'rmtree', side_effect=remove):
            result = retention.after_upgrade(self.state)
        self.assertEqual(result['state'], 'deferred')
        receipt = json.loads((self.state / 'checkpoint-retention.json').read_text())
        self.assertEqual(receipt['state'], 'partial')
        self.assertEqual(receipt['removed'], [copies[1].name])
        self.assertTrue(copies[0].exists())
        self.assertTrue(all(p.exists() for p in copies[2:]))

    def test_busy_deployment_is_deferred_without_deletion_or_error_exit(self):
        copies = [self.candidate(n) for n in range(4)]
        with (self.state / 'send-handoff-deploy.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = subprocess.run([sys.executable, retention.__file__, '--state', str(self.state), '--apply'],
                                    capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)['state'], 'deferred')
        self.assertTrue(all(p.exists() for p in copies))


if __name__ == '__main__':
    unittest.main()
