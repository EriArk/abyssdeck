"""Offline update/rollback fixtures. No Docker/native credentials or networking."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
import subprocess

sys.path.insert(0, str(Path('ops/linux').resolve()))
import engine_checkpoint as checkpoint

OWNER = '11111111-1111-4111-8111-111111111111'
MEMBER = '22222222-2222-4222-8222-222222222222'
UNOPENED = '33333333-3333-4333-8333-333333333333'


class CheckpointTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name)
        self.data = self.state / 'data'
        self.team = self.data / 'team'
        self.team.mkdir(parents=True)
        self.profile = self.team / 'users' / MEMBER / 'gpt'
        self.profile.mkdir(parents=True)
        (self.profile / 'session').write_text('same private browser')
        (self.profile / 'SingletonSocket').symlink_to('/tmp/fixture-browser-socket')
        (self.team / 'gpt-host.lock').touch()
        self.config = {'team': {'enabled': True, 'root': str(self.team), 'registrationEnabled': False}, 'hub': {'databasePath': str(self.data / 'app.db'), 'resultsPath': str(self.data / 'results')}, 'auth': {'username': 'owner', 'ownerLogin': 'eriark'}}
        (self.state / 'config.json').write_text(json.dumps(self.config))
        (self.state / 'deploy.env').write_text('ENGINE_REVISION=aaaaaaa\nWEB_REVISION=bbbbbbb\n')
        (self.state / 'web-releases').mkdir()
        (self.state / 'web-releases/current.json').write_text('{"id":"old-assets"}')
        for path in [self.data / 'app.db', self.team / 'users' / MEMBER / 'app.db']:
            with sqlite3.connect(path) as db:
                db.executescript("CREATE TABLE content(id TEXT PRIMARY KEY, value TEXT); INSERT INTO content VALUES('native-thread','private text'); CREATE TABLE receipts(id TEXT PRIMARY KEY,state TEXT); INSERT INTO receipts VALUES('pending-native','unknown');")
                db.executescript("CREATE TABLE users(username TEXT PRIMARY KEY,passwordHash TEXT); INSERT INTO users VALUES('owner','same-password-hash'); CREATE TABLE threads(id TEXT PRIMARY KEY,projectId TEXT,codexThreadId TEXT); INSERT INTO threads VALUES('hub-thread','project','native-thread');")
            results = path.parent / 'results'
            results.mkdir()
            (results / 'private.bin').write_bytes(b'private result')
        (self.team / 'shared-results').mkdir()
        (self.team / 'shared-results/shared.bin').write_bytes(b'published result')
        with sqlite3.connect(self.team / 'team.db') as db:
            db.executescript('''
            PRAGMA foreign_keys=ON;
            CREATE TABLE team_meta(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE team_users(id TEXT PRIMARY KEY,legacy INTEGER,login TEXT,passwordHash TEXT,state TEXT);
            CREATE TABLE team_namespaces(userId TEXT PRIMARY KEY REFERENCES team_users(id),initialized INTEGER);
            CREATE TABLE team_projects(id TEXT PRIMARY KEY,ownerId TEXT REFERENCES team_users(id));
            CREATE TABLE team_project_members(projectId TEXT REFERENCES team_projects(id),userId TEXT REFERENCES team_users(id),role TEXT,state TEXT);
            CREATE TABLE team_gpt_profiles(userId TEXT PRIMARY KEY REFERENCES team_users(id),slot INTEGER,serviceToken TEXT);
            CREATE TABLE team_receipts(userId TEXT,scope TEXT,state TEXT);
            CREATE TABLE team_audit(seq INTEGER PRIMARY KEY,action TEXT);
            CREATE TABLE team_sessions(tokenHash TEXT PRIMARY KEY,userId TEXT REFERENCES team_users(id));
            ''')
            db.execute("INSERT INTO team_meta VALUES('originalOwner',?)", (OWNER,))
            for user, legacy, state, initialized in [(OWNER, 1, 'active', 1), (MEMBER, 0, 'disabled', 1), (UNOPENED, 0, 'active', 0)]:
                db.execute('INSERT INTO team_users VALUES(?,?,?,?,?)', (user, legacy, 'eriark' if legacy else user, 'same-password-hash', state))
                db.execute('INSERT INTO team_namespaces VALUES(?,?)', (user, initialized))
            db.execute("INSERT INTO team_projects VALUES('shared',?)", (OWNER,))
            db.execute("INSERT INTO team_project_members VALUES('shared',?,'owner','active')", (OWNER,))
            db.execute("INSERT INTO team_project_members VALUES('shared',?,'collaborator','active')", (MEMBER,))
            db.execute("INSERT INTO team_gpt_profiles VALUES(?,1,'same-private-token')", (MEMBER,))
            db.execute("INSERT INTO team_receipts VALUES(?,'send','unknown')", (MEMBER,))
            db.execute("INSERT INTO team_sessions VALUES('original-session',?)", (OWNER,))
        self.target = self.state / 'backups/checkpoint'

    def create(self):
        return checkpoint.create(self.state, self.target, 'aaaaaaa')

    def test_exact_restore_retains_private_namespaces_assets_unknown_receipts_and_profile_inodes(self):
        old_profile = self.profile.stat().st_ino
        lock_inode = (self.team / 'gpt-host.lock').stat().st_ino
        self.create()
        manifest = checkpoint.verify(self.target)
        self.assertEqual(len(manifest['layout']['users']), 3)
        self.assertFalse(any('/gpt/' in path for path in manifest['entries']))
        self.assertFalse((self.target / 'restore-check').exists())
        checkpoint.admission(self.state, self.target)
        with sqlite3.connect(self.team / 'team.db') as db:
            db.execute("UPDATE team_users SET passwordHash='broken'")
            db.execute('DELETE FROM team_sessions')
        with sqlite3.connect(self.team / 'users' / MEMBER / 'app.db') as db:
            db.execute('DELETE FROM content')
            db.execute("UPDATE receipts SET state='done'")
        (self.data / 'results/private.bin').write_bytes(b'changed')
        (self.team / 'shared-results/new.bin').write_bytes(b'failed new asset')
        (self.state / 'deploy.env').write_text('ENGINE_REVISION=ccccccc')
        with self.assertRaisesRegex(RuntimeError, 'PRIVACY_CHANGED'):
            checkpoint.admission(self.state, self.target)
        failed = checkpoint.restore(self.state, self.target)
        self.assertTrue((failed / 'data/team/shared-results/new.bin').exists())
        self.assertFalse((self.team / 'shared-results/new.bin').exists())
        self.assertEqual(self.profile.stat().st_ino, old_profile)
        self.assertEqual((self.team / 'gpt-host.lock').stat().st_ino, lock_inode)
        self.assertTrue((self.profile / 'SingletonSocket').is_symlink())
        self.assertEqual((self.data / 'results/private.bin').read_bytes(), b'private result')
        self.assertIn('WEB_REVISION=bbbbbbb', (self.state / 'deploy.env').read_text())
        with sqlite3.connect(self.team / 'team.db') as db:
            self.assertEqual(db.execute('SELECT tokenHash FROM team_sessions').fetchall(), [('original-session',)])
        with sqlite3.connect(self.team / 'users' / MEMBER / 'app.db') as db:
            self.assertEqual(db.execute('SELECT * FROM content').fetchall(), [('native-thread', 'private text')])
            self.assertEqual(db.execute('SELECT state FROM receipts').fetchone(), ('unknown',))
        checkpoint.verify(self.target)

    def test_restore_forbidden_after_admission(self):
        self.create()
        checkpoint.write_json(self.target / 'admitted.json', {'revision': 'ccccccc'})
        (self.data / 'results/new-after-admission').write_text('must survive')
        with self.assertRaisesRegex(RuntimeError, 'ALREADY_ADMITTED'):
            checkpoint.restore(self.state, self.target)
        self.assertTrue((self.data / 'results/new-after-admission').exists())

    def test_workspace_activation_allows_only_exact_delta_and_rolls_back(self):
        from workspace_activation import candidate
        self.create()
        target = candidate(self.state, self.config)
        (self.state / 'config.json').write_text(json.dumps(target))
        with self.assertRaisesRegex(RuntimeError, 'CONFIG_CHANGED'):
            checkpoint.admission(self.state, self.target)
        checkpoint.admission(self.state, self.target, workspace_activation=True)
        target['auth']['ownerLogin'] = 'another-owner'
        (self.state / 'config.json').write_text(json.dumps(target))
        with self.assertRaisesRegex(RuntimeError, 'CONFIG_CHANGED'):
            checkpoint.admission(self.state, self.target, workspace_activation=True)
        checkpoint.restore(self.state, self.target)
        self.assertNotIn('serverWorkspaces', json.loads((self.state / 'config.json').read_text()))
        checkpoint.admission(self.state, self.target)

    def test_corrupt_copy_or_missing_private_database_blocks_restore(self):
        self.create()
        (self.target / 'data/team/users' / MEMBER / 'app.db').write_bytes(b'bad copy')
        with self.assertRaisesRegex(RuntimeError, 'CHECKSUM'):
            checkpoint.restore(self.state, self.target)
        self.assertEqual((self.data / 'results/private.bin').read_bytes(), b'private result')

    def test_missing_namespace_or_project_owner_refused(self):
        missing = self.team / 'users' / MEMBER / 'app.db'
        saved = missing.with_suffix('.saved')
        missing.rename(saved)
        with self.assertRaisesRegex(RuntimeError, 'DATABASE_MISSING'):
            self.create()
        saved.rename(missing)
        with sqlite3.connect(self.team / 'team.db') as db:
            db.execute("DELETE FROM team_project_members WHERE role='owner'")
        with self.assertRaisesRegex(RuntimeError, 'PROJECT_OWNER'):
            self.create()

    def test_binding_change_or_missing_access_table_blocks_admission(self):
        self.create()
        with sqlite3.connect(self.team / 'team.db') as db:
            db.execute("UPDATE team_gpt_profiles SET serviceToken='wrong-account'")
        with self.assertRaisesRegex(RuntimeError, 'PRIVACY_CHANGED'):
            checkpoint.admission(self.state, self.target)
        with sqlite3.connect(self.team / 'team.db') as db:
            db.execute('DROP TABLE team_receipts')
        with self.assertRaisesRegex(RuntimeError, 'TABLE_MISSING'):
            checkpoint.admission(self.state, self.target)

    def test_links_are_rejected_except_untouched_profile(self):
        (self.data / 'results/leak').symlink_to(self.state / 'config.json')
        with self.assertRaisesRegex(RuntimeError, 'CHECKPOINT_LINK'):
            self.create()
        (self.data / 'results/leak').unlink()
        self.config['hub']['databasePath'] = str(self.state / 'outside.db')
        with self.assertRaisesRegex(RuntimeError, 'STORAGE_OUTSIDE_DATA'):
            checkpoint.team_layout(self.state, self.config)

    def test_private_identity_and_restore_admission_flag_cannot_disappear(self):
        with sqlite3.connect(self.team / 'team.db') as db:
            db.execute("INSERT INTO team_meta VALUES('nativeAdmission','blocked')")
        self.create()
        with sqlite3.connect(self.data / 'app.db') as db:
            db.execute("UPDATE threads SET codexThreadId='another-native-thread'")
        with self.assertRaisesRegex(RuntimeError, 'PRIVATE_IDENTITY_CHANGED'):
            checkpoint.admission(self.state, self.target)
        with sqlite3.connect(self.team / 'team.db') as db:
            db.execute("DELETE FROM team_meta WHERE key='nativeAdmission'")
        with self.assertRaisesRegex(RuntimeError, 'PRIVACY_CHANGED'):
            checkpoint.admission(self.state, self.target)

    def test_wal_data_included_without_mutating_checkpoint(self):
        db = sqlite3.connect(self.team / 'users' / MEMBER / 'app.db')
        self.addCleanup(db.close)
        db.execute('PRAGMA journal_mode=WAL')
        db.execute("INSERT INTO content VALUES('wal-thread','committed WAL')")
        db.commit()
        self.create()
        checkpoint.verify(self.target)
        checkpoint.verify(self.target)
        with checkpoint.database(self.target / 'data/team/users' / MEMBER / 'app.db') as saved:
            self.assertEqual(saved.execute("SELECT value FROM content WHERE id='wal-thread'").fetchone(), ('committed WAL',))

    def test_wal_removed_during_asset_copy_preserves_committed_data(self):
        path = self.team / 'team.db'
        db = sqlite3.connect(path)
        db.execute('PRAGMA journal_mode=WAL')
        db.execute("INSERT INTO team_audit VALUES(1,'committed before shutdown')")
        db.commit()
        original = checkpoint.copy_inventory
        def copy(source, target, entries, *args, **kwargs):
            if source == self.data:
                self.assertTrue(Path(str(path) + '-wal').exists())
                db.close()  # Last connection checkpoints and removes the WAL.
                self.assertFalse(Path(str(path) + '-wal').exists())
            return original(source, target, entries, *args, **kwargs)
        try:
            with patch.object(checkpoint, 'copy_inventory', copy):
                self.create()
        finally:
            db.close()
        checkpoint.verify(self.target)
        with sqlite3.connect(self.target / 'data/team/team.db') as saved:
            self.assertEqual(saved.execute('SELECT action FROM team_audit').fetchall(), [('committed before shutdown',)])
        self.assertFalse((self.target / 'data/team/team.db-wal').exists())


class WarmCheckpointTest(unittest.TestCase):
    setUp = CheckpointTest.setUp

    def test_live_changes_are_finalized_with_fresh_wal_and_exact_restore(self):
        unchanged = self.data / 'results/private.bin'
        changed = self.team / 'shared-results/shared.bin'
        old = changed.stat()
        removed = self.data / 'results/removed'
        removed.write_bytes(b'remove after preparation')
        prepared = checkpoint.prepare(self.state, self.target, 'aaaaaaa')
        self.assertFalse((self.target / 'checkpoint.json').exists())
        self.assertFalse((self.target / 'data/app.db').exists())
        # Same size and restored mtime still invalidate the source via ctime.
        changed.write_bytes(b'changed result!!')
        self.assertEqual(changed.stat().st_size, old.st_size)
        os.utime(changed, ns=(old.st_atime_ns, old.st_mtime_ns))
        removed.unlink()
        (self.data / 'results/new').write_bytes(b'arrived while online')
        with sqlite3.connect(self.data / 'app.db') as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute("INSERT INTO content VALUES('last-write','after warm copy')")
            db.commit()
            checkpoint.create(self.state, self.target, 'aaaaaaa', prepared=prepared)
        checkpoint.verify(self.target)
        checkpoint.admission(self.state, self.target, prepared=prepared)
        self.assertEqual((self.target / 'data/team/shared-results/shared.bin').read_bytes(), b'changed result!!')
        self.assertFalse((self.target / 'data/results/removed').exists())
        unchanged.write_bytes(b'broken after snapshot')
        checkpoint.restore(self.state, self.target)
        self.assertEqual(unchanged.read_bytes(), b'private result')
        with sqlite3.connect(self.data / 'app.db') as db:
            self.assertEqual(db.execute("SELECT value FROM content WHERE id='last-write'").fetchone(), ('after warm copy',))

    def test_unchanged_payload_is_neither_copied_nor_rehashed_during_closed_window(self):
        prepared = checkpoint.prepare(self.state, self.target, 'aaaaaaa')
        opened, copied = [], []
        original_open, original_copy = Path.open, checkpoint.shutil.copyfile
        def open_file(path, *args, **kwargs):
            if path.name == 'private.bin': opened.append(path)
            return original_open(path, *args, **kwargs)
        def copy_file(source, target, *args, **kwargs):
            if Path(source).name == 'private.bin': copied.append(source)
            return original_copy(source, target, *args, **kwargs)
        with patch.object(Path, 'open', open_file), patch.object(checkpoint.shutil, 'copyfile', copy_file):
            checkpoint.create(self.state, self.target, 'aaaaaaa', prepared=prepared)
            checkpoint.admission(self.state, self.target, prepared=prepared)
        self.assertEqual(opened, [])
        self.assertEqual(copied, [])
        # Independent verification/rollback does not trust a persisted hash cache.
        checkpoint.verify(self.target)

    def test_integrity_scans_are_reused_only_for_identical_database_files(self):
        scans = []
        connect = sqlite3.connect
        def traced(path, *args, **kwargs):
            db = connect(path, *args, **kwargs)
            db.set_trace_callback(lambda sql: scans.append(str(path)) if sql == 'PRAGMA quick_check' else None)
            return db
        with patch.object(checkpoint.sqlite3, 'connect', traced):
            prepared = checkpoint.prepare(self.state, self.target, 'aaaaaaa')
            checkpoint.create(self.state, self.target, 'aaaaaaa', prepared=prepared)
            checkpoint.admission(self.state, self.target, prepared=prepared)
        self.assertEqual(len(scans), len(set(scans)), 'unchanged DB scanned more than once')
        self.assertEqual(len(scans), 6, 'three source and three independent saved DBs')
        self.assertNotIn('database_checks', (self.target / 'checkpoint.json').read_text())
        self.assertIn('checkpointValidationMs', prepared.timings)
        scans.clear()
        with patch.object(checkpoint.sqlite3, 'connect', traced):
            checkpoint.verify(self.target)
        self.assertEqual(len(scans), 3, 'standalone verification must scan again')

    def test_cached_integrity_invalidates_on_wal_and_same_size_mtime_changes(self):
        path = self.team / 'team.db'
        checks = {}
        checkpoint.database(path, checks).close()
        previous = path.stat()
        with sqlite3.connect(path) as db:
            db.execute("UPDATE team_namespaces SET userId='99999999-9999-4999-8999-999999999999' WHERE userId=?", (MEMBER,))
        os.utime(path, ns=(previous.st_atime_ns, previous.st_mtime_ns))
        self.assertEqual(path.stat().st_size, previous.st_size)
        with self.assertRaisesRegex(RuntimeError, 'FOREIGN_KEY'):
            checkpoint.database(path, checks)
        with sqlite3.connect(path) as db:
            db.execute("UPDATE team_namespaces SET userId=? WHERE userId='99999999-9999-4999-8999-999999999999'", (MEMBER,))
        writer = sqlite3.connect(path)
        try:
            writer.execute('PRAGMA journal_mode=WAL')
            writer.execute('PRAGMA wal_autocheckpoint=0')
            checkpoint.database(path, checks).close()
            before = checkpoint.fingerprint(path)
            writer.execute("UPDATE team_namespaces SET userId='99999999-9999-4999-8999-999999999999' WHERE userId=?", (MEMBER,))
            writer.commit()
            self.assertEqual(checkpoint.fingerprint(path), before, 'only WAL changed')
            with self.assertRaisesRegex(RuntimeError, 'FOREIGN_KEY'):
                checkpoint.database(path, checks)
        finally:
            writer.close()

    def test_corrupt_warm_copy_is_replaced_and_later_tampering_is_rejected(self):
        prepared = checkpoint.prepare(self.state, self.target, 'aaaaaaa')
        saved = self.target / 'data/results/private.bin'
        saved.write_bytes(b'corrupt preparation')
        checkpoint.create(self.state, self.target, 'aaaaaaa', prepared=prepared)
        self.assertEqual(saved.read_bytes(), b'private result')
        saved.write_bytes(b'corrupt final copy')
        with self.assertRaisesRegex(RuntimeError, 'CHECKSUM'):
            checkpoint.admission(self.state, self.target, prepared=prepared)
        with self.assertRaisesRegex(RuntimeError, 'CHECKSUM'):
            checkpoint.restore(self.state, self.target)

    def test_file_directory_replacement_and_new_symlink_during_preparation(self):
        path = self.data / 'results/changing'
        path.mkdir()
        (path / 'child').write_text('old')
        prepared = checkpoint.prepare(self.state, self.target, 'aaaaaaa')
        (path / 'child').unlink()
        path.rmdir()
        path.write_text('now a file')
        checkpoint.create(self.state, self.target, 'aaaaaaa', prepared=prepared)
        self.assertEqual((self.target / 'data/results/changing').read_text(), 'now a file')
        other = self.state / 'backups/second'
        prepared = checkpoint.prepare(self.state, other, 'aaaaaaa')
        (self.data / 'results/link').symlink_to(self.state / 'config.json')
        with self.assertRaisesRegex(RuntimeError, 'CHECKPOINT_LINK'):
            checkpoint.create(self.state, other, 'aaaaaaa', prepared=prepared)


class UpgraderTest(unittest.TestCase):
    setUp = CheckpointTest.setUp

    def execute(self, failure=None, check=False, busy=False, force=False):
        spec = importlib.util.spec_from_file_location('upgrade', 'ops/linux/upgrade-engine.py')
        upgrade = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(upgrade)
        release = self.state / 'release'
        release.mkdir()
        proof = self.state / 'verification.json'
        proof.write_text(json.dumps(dict(revision='ccccccc', schema=28, **{k: True for k in ['build', 'typecheck', 'repositoryChecks', 'tests', 'browsers', 'imageSmoke', 'teamCheckpoint', 'teamRollback', 'teamUpgradeAdmission', 'codexContinuityPreflight']})))
        events = []
        failed = False
        if failure == 'backup':
            (self.data / 'results/unsafe').symlink_to(self.state / 'config.json')
        def run(args, **kwargs):
            nonlocal failed
            events.append(args)
            if 'stop' in args and args[-1] == 'codex-web-hub':
                warm = next((self.state / 'backups').glob('before-team-engine-*'))
                self.assertTrue((warm / 'data/results/private.bin').exists())
                self.assertTrue((warm / 'restore-check/results/private.bin').exists())
                self.assertFalse((warm / 'checkpoint.json').exists())
                if failure == 'cold_backup':
                    (self.data / 'results/unsafe').symlink_to(self.state / 'config.json')
            if 'dist/maintenance-check.js' in args:
                return subprocess.CompletedProcess(args, 20 if busy else 0)
            candidate = 'ENGINE_REVISION=ccccccc' in (self.state / 'deploy.env').read_text()
            if 'compose' in args and args[-1] == 'engine' and candidate:
                # Simulate a candidate migration before an engine startup failure.
                (self.data / 'results/candidate-file').write_text('new engine wrote this')
                if failure == 'identity':
                    with sqlite3.connect(self.team / 'team.db') as db:
                        db.execute("UPDATE team_users SET passwordHash='wrong'")
                if failure == 'engine' and not failed:
                    failed = True
                    raise subprocess.CalledProcessError(1, args)
            if 'dist/publish-web.js' in args:
                (self.state / 'web-releases/current.json').write_text('{"id":"candidate-assets"}')
            if 'dist/doctor.js' in args and failure == 'after_admission':
                (self.data / 'results/new-user-write').write_text('accepted by new engine')
                raise subprocess.CalledProcessError(1, args)
            return subprocess.CompletedProcess(args, 0)
        def inspect(name):
            revision = 'ccccccc' if name == 'codex-web-hub:ccccccc' else 'aaaaaaa'
            labels = {'org.opencontainers.image.revision': revision}
            if failure == 'web_only' and revision == 'ccccccc':
                labels['io.codex-web.release-kind'] = 'web-only'
            return {'Config': {'Labels': labels}}
        def output(args, **kwargs):
            return 'c' * 40 if 'rev-parse' in args else ''
        argv = ['upgrade-engine.py', 'ccccccc', '--expected', 'aaaaaaa', '--state', str(self.state), '--release', str(release), '--verification', str(proof)]
        if check:
            argv.append('--check')
        if force:
            argv.append('--allow-owner-force')
        atomic = upgrade.atomic
        def write_status(path, value):
            atomic(path, value)
            if force and path.name == 'maintenance.json' and value['state'] == 'waiting':
                atomic(self.data / 'owner-update-request.json', dict(force=True, revision=value['revision'], startedAt=value['startedAt'], requestedAt=upgrade.time.time()*1000))
        with patch.object(upgrade, 'atomic', write_status), patch.object(sys, 'argv', argv), patch.object(upgrade, 'inspect', inspect), patch.object(upgrade.subprocess, 'run', run), patch.object(upgrade.subprocess, 'check_output', output), patch.object(upgrade.Path, 'home', lambda: self.state):
            if failure:
                with self.assertRaises((subprocess.CalledProcessError, RuntimeError, AssertionError)):
                    upgrade.main()
            else:
                upgrade.main()
        return events

    def test_busy_check_never_stops_or_copies_storage(self):
        events = self.execute(check=True, busy=True)
        self.assertFalse(any('stop' in event or 'compose' in event for event in events))
        self.assertFalse((self.state / 'backups').exists())

    def test_owner_force_bypasses_work_but_keeps_backup_and_admission(self):
        events = self.execute(busy=True, force=True)
        self.assertTrue(any('stop' in event for event in events))
        receipt = json.loads((self.state / 'deployment-ccccccc.json').read_text())
        self.assertTrue((Path(receipt['checkpoint']) / 'verified.json').exists())
        self.assertTrue((Path(receipt['checkpoint']) / 'admitted.json').exists())

    def test_success_checks_before_gateway_and_records_admission(self):
        events = self.execute()
        check = next(i for i, args in enumerate(events) if '--reserve-terminals' in args)
        stop = next(i for i, args in enumerate(events) if 'stop' in args)
        self.assertLess(check, stop)
        receipt = json.loads((self.state / 'deployment-ccccccc.json').read_text())
        saved = Path(receipt['checkpoint'])
        self.assertGreaterEqual(receipt['preparationMs'], 0)
        self.assertGreaterEqual(receipt['downtimeMs'], 0)
        for phase in ['stopMs', 'checkpointMs', 'engineStartMs', 'admissionMs', 'webStartMs']:
            self.assertGreaterEqual(receipt['stages'][phase], 0)
        self.assertIn('restoreRehearsalMs', receipt['stages']['checkpoint'])
        self.assertTrue((saved / 'admitted.json').exists())
        self.assertTrue((saved / 'verified.json').exists())
        self.assertEqual(json.loads((self.state / 'web-releases/maintenance.json').read_text())['state'], 'installed')

    def test_web_only_image_rejected_before_touching_running_services(self):
        events = self.execute(failure='web_only')
        self.assertFalse(events)
        self.assertFalse((self.state / 'backups').exists())

    def test_warm_backup_failure_leaves_running_services_untouched(self):
        events = self.execute(failure='backup')
        self.assertFalse(any('compose' in args for args in events))
        self.assertFalse(any('stop' in args or 'start' in args for args in events))
        self.assertIn('ENGINE_REVISION=aaaaaaa', (self.state / 'deploy.env').read_text())
        self.assertEqual(json.loads((self.state / 'web-releases/maintenance.json').read_text())['code'], 'BACKUP_PREPARATION_FAILED')

    def test_failed_engine_restores_both_databases_and_exact_previous_pair(self):
        events = self.execute(failure='engine')
        self.assertEqual((self.state / 'deploy.env').read_text(), 'ENGINE_REVISION=aaaaaaa\nWEB_REVISION=bbbbbbb\n')
        self.assertEqual((self.state / 'web-releases/current.json').read_text(), '{"id":"old-assets"}')
        self.assertFalse((self.data / 'results/candidate-file').exists())
        self.assertTrue(any('compose' in args and args[-2:] == ['engine', 'hub'] for args in events))
        self.assertEqual(json.loads((self.state / 'web-releases/maintenance.json').read_text())['state'], 'rolled_back')

    def test_cold_backup_failure_restarts_original_services(self):
        events = self.execute(failure='cold_backup')
        self.assertTrue(any('start' in args and args[-1] == 'codex-web-engine' for args in events))
        self.assertTrue(any('start' in args and args[-1] == 'codex-web-hub' for args in events))
        self.assertFalse(any('compose' in args for args in events))
        self.assertIn('ENGINE_REVISION=aaaaaaa', (self.state / 'deploy.env').read_text())
        self.assertEqual(json.loads((self.state / 'web-releases/maintenance.json').read_text())['code'], 'BACKUP_FAILED')

    def test_wrong_identity_never_reaches_public_gateway(self):
        events = self.execute(failure='identity')
        self.assertFalse(any('compose' in args and args[-1:] == ['hub'] and args[-2:] != ['engine', 'hub'] for args in events))
        with sqlite3.connect(self.team / 'team.db') as db:
            self.assertEqual(db.execute('SELECT DISTINCT passwordHash FROM team_users').fetchall(), [('same-password-hash',)])

    def test_failure_after_admission_retains_new_writes(self):
        events = self.execute(failure='after_admission')
        self.assertTrue((self.data / 'results/new-user-write').exists())
        self.assertIn('ENGINE_REVISION=ccccccc', (self.state / 'deploy.env').read_text())
        self.assertFalse(any('compose' in args and args[-2:] == ['engine', 'hub'] for args in events))
        saved = next((self.state / 'backups').glob('before-team-engine-*'))
        with self.assertRaisesRegex(RuntimeError, 'ALREADY_ADMITTED'):
            checkpoint.restore(self.state, saved)


class FrozenHubTest(unittest.TestCase):
    setUp = CheckpointTest.setUp

    def test_warm_changes_deletions_and_wal_receipts_are_reconciled_when_stopped(self):
        # Frozen output must be outside the live installation.
        self.target = Path(self.temp.name).parent / (Path(self.temp.name).name + '-frozen')
        self.addCleanup(lambda: __import__('shutil').rmtree(self.target, ignore_errors=True))
        frozen = checkpoint.FrozenHub(self.state, self.target)
        old = self.data / 'results/private.bin'
        (self.data / 'old-backup').mkdir()
        (self.data / 'old-backup/nested.db').write_bytes(b'not an input')
        frozen.prepare()
        old.unlink()
        (self.data / 'results/new.bin').write_bytes(b'new after preparation')
        with sqlite3.connect(self.data / 'app.db') as db:
            db.execute("UPDATE receipts SET state='confirmed'")
        frozen.seal()
        self.assertFalse((self.target / 'data/results/private.bin').exists())
        self.assertEqual((self.target / 'data/results/new.bin').read_bytes(), b'new after preparation')
        with sqlite3.connect(self.target / 'data/app.db') as db:
            self.assertEqual(db.execute('SELECT state FROM receipts').fetchone(), ('confirmed',))
        self.assertFalse((self.target / self.profile.relative_to(self.state)).exists())
        self.assertFalse((self.target / 'data/old-backup').exists())
        self.assertEqual(json.loads((self.target / 'config.json').read_text()), self.config)
        # Live changes after resume cannot alter the CLI's isolated input.
        (self.data / 'results/new.bin').write_bytes(b'later live edit')
        self.assertEqual((self.target / 'data/results/new.bin').read_bytes(), b'new after preparation')

    def test_same_size_mtime_replacement_is_not_reused_from_warm_cache(self):
        self.target = Path(self.temp.name).parent / (Path(self.temp.name).name + '-frozen')
        self.addCleanup(lambda: __import__('shutil').rmtree(self.target, ignore_errors=True))
        frozen = checkpoint.FrozenHub(self.state, self.target)
        frozen.prepare()
        file = self.data / 'results/private.bin'
        before = file.stat()
        file.write_bytes(b'x' * before.st_size)
        os.utime(file, ns=(before.st_atime_ns, before.st_mtime_ns))
        frozen.seal()
        self.assertEqual((self.target / 'data/results/private.bin').read_bytes(), b'x' * before.st_size)


if __name__ == '__main__':
    os.umask(0o077)
    unittest.main()
