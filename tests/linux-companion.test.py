import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('companion', Path(__file__).resolve().parents[1] / 'ops/linux/companion/control.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RecoveryControls(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.calls = []
        self.config = dict(projects=self.temp.name, diskUuid='DATA', node='/node', socket='/socket',
                           wsModule='/ws', sshHelper='/ssh-helper', url='https://fixture.invalid')
        self.control = module.Control(self.config, self.run_command)

    def run_command(self, argv, timeout=25):
        self.calls.append(argv)
        if argv[0] == 'findmnt': return 'DATA'
        if argv[0] == '/node': return '{"version":"0.169.0","signedIn":true,"models":8}'
        if argv[0] == '/ssh-helper':
            return '[{"name":"/codex-web-hub","status":"running","health":"healthy","restart":"unless-stopped"},{"name":"/codex-web-engine","status":"running","health":"healthy","restart":"unless-stopped"}]'
        return 'active'

    def test_inspection_never_starts_or_restarts(self):
        self.assertIn('0.169.0', self.control.status())
        self.assertFalse(any(any(part in ('start', 'restart') for part in call) for call in self.calls))
        self.assertFalse(any('docker restart' in part for call in self.calls for part in call))

    def test_restart_requires_explicit_interruption_confirmation(self):
        for action in ['restart-client', 'restart-server']:
            with self.assertRaises(RuntimeError): self.control.action(action)
        self.assertEqual(self.calls, [])

    def test_missing_disk_never_creates_directory_or_starts_codex(self):
        missing = Path(self.temp.name) / 'absent'
        self.config['projects'] = str(missing)
        for action in ['start', 'restart-client']:
            with self.assertRaises(RuntimeError): self.control.action(action, True)
        self.assertFalse(missing.exists())
        self.assertEqual(self.calls, [])

    def test_wrong_mount_identity_blocks_start(self):
        self.control.run = lambda *args, **kwargs: 'SYSTEM_DISK'
        with self.assertRaisesRegex(RuntimeError, 'другой диск'):
            self.control.action('start')

    def test_start_is_idempotent_and_local(self):
        self.control.action('start')
        self.assertEqual(self.calls[1], ['systemctl', '--user', 'start', module.UNIT])
        self.assertEqual(len(self.calls), 3)

    def test_confirmed_restart_only_targets_selected_services(self):
        self.control.action('restart-client', True)
        self.assertEqual(self.calls[1], ['systemctl', '--user', 'restart', module.UNIT])
        self.calls.clear()
        self.control.action('restart-server', True)
        self.assertEqual(self.calls, [['/ssh-helper', 'docker restart --timeout 45 codex-web-engine codex-web-hub']])

    def test_start_waits_for_socket_without_repeating_start(self):
        original = self.run_command
        attempts = 0
        def delayed(argv, timeout=25):
            nonlocal attempts
            if argv[0] == '/node':
                attempts += 1
                if attempts == 1: raise RuntimeError('connect ENOENT /socket')
            return original(argv, timeout)
        self.control.run = delayed
        self.control.action('start')
        self.assertEqual(attempts, 2)
        self.assertEqual(sum(call[0] == 'systemctl' for call in self.calls), 1)

    def test_status_errors_remain_visible_without_recovery_effects(self):
        def broken(*args, **kwargs): raise RuntimeError('offline')
        self.control.run = broken
        text = self.control.status()
        self.assertIn('недоступно', text)
        self.assertIn('offline', text)
        self.assertEqual(self.calls, [])


if __name__ == '__main__': unittest.main()
