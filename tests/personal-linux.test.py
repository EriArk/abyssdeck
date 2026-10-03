"""Linux control-plane regression checks; real containment requires prepare --apply."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ops/personal-linux'))
from policy import PROJECT, NETWORK, MARKER, check_routes, firewall, matches, profile, project
from prepare import Setup, atomic
from acceptance import path, owned


class API:
    def __init__(self):
        self.objects = {}
        self.posts = []
        self.lose_reply = False
        self.pending = False

    def get(self, path, missing=False):
        return copy.deepcopy(self.objects.get(path))

    def request(self, method, path, body):
        assert method == 'POST'
        self.posts.append((path, copy.deepcopy(body)))
        collection, _, query = path.partition('?')
        target = collection + '/' + body['name'] + ('?' + query if query else '')
        if not self.pending:
            self.objects[target] = copy.deepcopy(body)
        if self.lose_reply:
            raise RuntimeError('CHANNEL_LOST')
        return {'type': 'sync', 'metadata': {}}

    def wait(self, value):
        return value


class PersonalLinux(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.api = API()
        self.setup = Setup(self.directory.name, self.api)

    def tearDown(self):
        self.directory.cleanup()

    def test_reopening_setup_reconciles_exact_object_without_recreating(self):
        self.setup.ensure('/1.0/projects', project())
        resumed = Setup(self.directory.name, self.api)
        resumed.ensure('/1.0/projects', project())
        self.assertEqual(len(self.api.posts), 1)

    def test_lost_reply_after_creation_is_read_back_not_replayed(self):
        self.api.lose_reply = True
        with self.assertRaisesRegex(RuntimeError, 'CHANNEL_LOST'):
            self.setup.ensure('/1.0/projects', project())
        self.api.lose_reply = False
        Setup(self.directory.name, self.api).ensure('/1.0/projects', project())
        self.assertEqual(len(self.api.posts), 1)

    def test_uncertain_inflight_creation_with_no_object_is_not_replayed(self):
        self.api.pending = self.api.lose_reply = True
        with self.assertRaisesRegex(RuntimeError, 'CHANNEL_LOST'):
            self.setup.ensure('/1.0/projects', project())
        self.api.lose_reply = False
        with self.assertRaisesRegex(RuntimeError, 'UNCONFIRMED'):
            Setup(self.directory.name, self.api).ensure('/1.0/projects', project())
        self.assertEqual(len(self.api.posts), 1)

    def test_unclaimed_preexisting_object_is_not_adopted_even_with_same_name(self):
        self.api.objects['/1.0/projects/' + PROJECT] = project()
        with self.assertRaisesRegex(RuntimeError, 'NOT_OWNED'):
            self.setup.ensure('/1.0/projects', project())
        self.assertEqual(self.api.posts, [])

    def test_existing_broadened_policy_is_not_silently_accepted(self):
        self.setup.ensure('/1.0/projects', project())
        self.api.objects['/1.0/projects/' + PROJECT]['config']['restricted'] = 'false'
        with self.assertRaisesRegex(RuntimeError, 'CHANGED'):
            self.setup.ensure('/1.0/projects', project())

    def test_unexpected_security_override_or_raw_configuration_is_rejected(self):
        for key, value in [('raw.lxc', 'lxc.apparmor.profile=unconfined'),
                           ('security.privileged', 'true')]:
            desired = {'name': 'probe', 'description': MARKER, 'config': {}}
            actual = dict(desired, config={key: value})
            self.assertFalse(matches(actual, desired))

    def test_profile_rejects_extra_host_device_or_replaced_profile(self):
        desired = profile()
        expanded = copy.deepcopy(desired)
        expanded['devices']['host'] = {'type': 'disk', 'source': '/', 'path': '/host'}
        self.assertFalse(matches(expanded, desired))
        desired = {'name': 'test', 'description': MARKER, 'profiles': ['personal-linux']}
        expanded = dict(desired, profiles=['default'])
        self.assertFalse(matches(expanded, desired))

    def test_creation_scopes_profile_to_private_project(self):
        self.setup.ensure('/1.0/profiles', profile(), scoped=True)
        self.assertEqual(self.api.posts[0][0], '/1.0/profiles?project=' + PROJECT)

    def test_network_overlap_including_broad_vpn_route_is_refused(self):
        for destination in ['10.0.0.0/8', '10.203.0.0/24', '10.203.0.10/32']:
            with self.assertRaisesRegex(RuntimeError, 'OVERLAP'):
                check_routes([{'dst': destination, 'dev': 'tailscale0'}])
        check_routes([{'dst': 'default', 'dev': 'enp3s0'},
                      {'dst': '192.168.50.0/24', 'dev': 'enp3s0'},
                      {'dst': '10.203.0.0/24', 'dev': NETWORK},
                      {'dst': '10.203.0.1/32', 'dev': NETWORK}])

    def test_probe_ownership_checked_before_stop_or_delete(self):
        self.setup.state['probeRun'] = {'id': 'abcdef012345'}
        name = 'cw-check-abcdef012345-a'
        self.api.objects[path(name)] = {'description': MARKER,
                                       'config': {'user.codexweb.probe': 'someone-else'}}
        with self.assertRaisesRegex(RuntimeError, 'OWNERSHIP_MISMATCH'):
            owned(self.setup, name)
        for value in ['default', 'user-container', '../../host', name + '/snapshots']:
            with self.assertRaisesRegex(RuntimeError, 'NAME_INVALID'):
                path(value)

    def test_state_write_rejects_symlink_without_touching_target(self):
        directory = Path(self.directory.name)
        target = directory / 'keep'
        target.write_text('preserve')
        alias = directory / 'alias.json'
        alias.symlink_to(target)
        with self.assertRaisesRegex(RuntimeError, 'PATH_INVALID'):
            atomic(alias, {})
        self.assertEqual(target.read_text(), 'preserve')

    def test_firewall_scoped_and_does_not_admit_guest_initiated_tailnet(self):
        rules = firewall()
        self.assertNotIn('flush ruleset', rules)
        self.assertIn('100.64.0.0/10', rules)
        self.assertIn('ct direction reply ct state established,related accept', rules)
        self.assertNotIn('tcp dport 22 accept', rules)
        self.assertIn(f'oifname "{NETWORK}" counter drop', rules)

    def test_bundle_hash_and_exact_file_set_are_verified_before_execution(self):
        root = Path(__file__).resolve().parents[1] / 'ops/personal-linux'
        spec = importlib.util.spec_from_file_location('personal_bundle', root / 'apply-bundle.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        directory = Path(self.directory.name)
        files = {}
        for name in module.FILES:
            data = (root / name).read_bytes()
            (directory / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        manifest = {'schema': 1, 'kind': 'personal-linux-preparation',
                    'revision': 'test', 'files': files}
        (directory / 'manifest.json').write_text(json.dumps(manifest))
        self.assertEqual(module.verify(directory)['revision'], 'test')
        (directory / 'prepare.py').write_text('unexpected')
        with self.assertRaisesRegex(RuntimeError, 'HASH_MISMATCH'):
            module.verify(directory)
        manifest['files']['../outside.py'] = 'a' * 64
        (directory / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(RuntimeError, 'FILES_INVALID'):
            module.verify(directory)


if __name__ == '__main__':
    unittest.main()
