"""Same-installation Team checkpoints with optional online file preparation.

The caller holds the deployment and GPT-host locks. Final create requires closed
public admission and a stopped engine; prepare alone is never a valid snapshot.
Restore is allowed only before the replacement gateway starts.
"""
import hashlib
from contextlib import ExitStack
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import time


def require(value, code):
    if not value:
        raise RuntimeError(code)


def canonical(path):
    path = Path(path)
    require(path.is_absolute() and path.resolve() == path, 'CHECKPOINT_PATH')
    return path


def fingerprint(path):
    info = path.lstat()
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def file_hash(path, cache=None):
    before = fingerprint(path)
    require(stat.S_ISREG(before[2]), 'CHECKPOINT_FILE')
    if cache is not None and path in cache and cache[path][0] == before:
        return cache[path][1]
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    result = digest.hexdigest()
    # In-memory evidence only; ctime also invalidates same-size/mtime replacements.
    # A racing warm read is never reusable during the final stopped snapshot.
    if cache is not None and fingerprint(path) == before:
        cache[path] = (before, result)
    return result


def write_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())


def database_fingerprint(path):
    # WAL and rollback journals carry committed pages absent from the main DB.
    # Never persist this evidence; an independent restore validates from scratch.
    files = [path, Path(str(path) + '-wal'), Path(str(path) + '-journal')]
    def observed(item):
        try:
            return fingerprint(item)
        except FileNotFoundError:
            return None  # A live SQLite reader can remove a now-unused WAL.
    return tuple(observed(item) for item in files)


def database(path, checks=None):
    canonical(path)
    require(path.is_file() and not path.is_symlink(), 'CHECKPOINT_DATABASE_MISSING')
    before = database_fingerprint(path)
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    try:
        if checks is None or checks.get(path) != before:
            require(db.execute('PRAGMA quick_check').fetchall() == [('ok',)], 'CHECKPOINT_DATABASE_INTEGRITY')
            require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'CHECKPOINT_DATABASE_FOREIGN_KEY')
            if checks is not None:
                checks.pop(path, None)
                if database_fingerprint(path) == before:
                    checks[path] = before
        return db
    except BaseException:
        db.close()
        raise


def team_layout(state, config, data=None, checks=None):
    """Validate every account, including disabled and not-yet-opened namespaces."""
    data = canonical(data or state / 'data')
    configured_data = canonical(state / 'data')
    require(config.get('team', {}).get('enabled'), 'CHECKPOINT_TEAM_REQUIRED')
    team = canonical(config['team']['root'])
    owner_db = canonical(config['hub']['databasePath'])
    results = canonical(config['hub']['resultsPath'])
    for path in (team, owner_db, results):
        require(path != configured_data and path.is_relative_to(configured_data), 'CHECKPOINT_STORAGE_OUTSIDE_DATA')
    require(not owner_db.is_relative_to(team) and not results.is_relative_to(team), 'CHECKPOINT_STORAGE_OVERLAP')
    require(not owner_db.is_relative_to(results) and not team.is_relative_to(results), 'CHECKPOINT_STORAGE_OVERLAP')
    relative_team = team.relative_to(configured_data)
    registry = data / relative_team / 'team.db'
    db = database(registry, checks)
    try:
        owner = db.execute("SELECT value FROM team_meta WHERE key='originalOwner'").fetchone()
        require(owner and re.fullmatch(r'[a-f0-9-]{36}', owner[0]), 'CHECKPOINT_OWNER')
        users = db.execute('SELECT u.id,u.legacy,n.initialized FROM team_users u LEFT JOIN team_namespaces n ON n.userId=u.id ORDER BY u.id').fetchall()
        require(1 <= len(users) <= 10 and [u[0] for u in users if u[1]] == [owner[0]], 'CHECKPOINT_OWNER_MAPPING')
        require(all(re.fullmatch(r'[a-f0-9-]{36}', u[0]) and u[1] in (0, 1) and u[2] in (0, 1) for u in users), 'CHECKPOINT_NAMESPACE')
        require(not db.execute("SELECT p.id FROM team_projects p WHERE (SELECT count(*) FROM team_project_members m WHERE m.projectId=p.id AND m.role='owner' AND m.state='active') != 1 OR NOT EXISTS (SELECT 1 FROM team_project_members m WHERE m.projectId=p.id AND m.userId=p.ownerId AND m.role='owner' AND m.state='active')").fetchall(), 'CHECKPOINT_PROJECT_OWNER')
        databases = [registry.relative_to(data).as_posix()]
        for user, legacy, initialized in users:
            require(not legacy or initialized, 'CHECKPOINT_OWNER_STORAGE')
            if initialized:
                path = owner_db.relative_to(configured_data) if legacy else relative_team / 'users' / user / 'app.db'
                selected = database(data / path, checks)
                selected.close()
                databases.append(path.as_posix())
        # Exclude entire browser mounts, not just Chromium lock files. These live
        # containers keep the same profile inodes throughout update and rollback.
        protected = [(relative_team / 'gpt-host.lock').as_posix()]
        protected += [(relative_team / 'users' / u[0] / 'gpt').as_posix() for u in users]
        return dict(ownerId=owner[0], users=users, databases=databases, protected=sorted(protected))
    finally:
        db.close()


def privacy(data, registry, expected=None, checks=None):
    """Compare old access/binding columns even if an upgrade adds schema columns.

Sessions and audit can expire/grow at boot. Their exact bytes still belong to the
checkpoint; all durable Team access, content and operation tables must survive.
"""
    db = database(data / registry, checks)
    try:
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'team_%' ORDER BY name")]
        tables = [name for name in tables if name not in ('team_sessions', 'team_audit')]
        if expected:
            require(set(expected) <= set(tables), 'CHECKPOINT_PRIVACY_TABLE_MISSING')
            tables = list(expected)
        result = {}
        for table in tables:
            require(re.fullmatch(r'team_[a-z_]+', table), 'CHECKPOINT_TABLE')
            columns = expected[table]['columns'] if expected else [r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
            require(all(re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', column) for column in columns), 'CHECKPOINT_COLUMN')
            rows = db.execute('SELECT ' + ','.join('"' + c + '"' for c in columns) + f' FROM "{table}"' + (" WHERE key!='schema'" if table == 'team_meta' else '')).fetchall()
            serialized = sorted(json.dumps(row, separators=(',', ':')) for row in rows)
            result[table] = dict(columns=columns, hash=hashlib.sha256(json.dumps(serialized).encode()).hexdigest())
        return result
    finally:
        db.close()


def private_bindings(data, databases, expected=None, checks=None):
    result = {}
    for name in databases[1:]:
        db = database(data / name, checks)
        try:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            # Existing private table presence and stable identities must survive
            # boot. Native history/status can legitimately refresh independently.
            required = expected[name]['tables'] if expected else sorted(tables - {'sqlite_sequence'})
            require(set(required) <= tables, 'CHECKPOINT_PRIVATE_TABLE_MISSING')
            hashes = {}
            for table, columns in [('users', ['username', 'passwordHash']), ('threads', ['id', 'projectId', 'codexThreadId'])]:
                if table not in tables:
                    continue
                rows = db.execute('SELECT ' + ','.join(columns) + f' FROM "{table}" ORDER BY 1').fetchall()
                hashes[table] = hashlib.sha256(json.dumps(rows).encode()).hexdigest()
            result[name] = dict(tables=required, identities=hashes)
        finally:
            db.close()
    return result


def inventory(root, protected=(), databases=(), cache=None, warm=False, include=None):
    root = canonical(root)
    entries = {}
    volatile = {name + '-shm' for name in databases}
    def visit(folder):
        for path in sorted(folder.iterdir()):
            name = path.relative_to(root).as_posix()
            if include is not None and not any(name == item or name.startswith(item + '/') or item.startswith(name + '/') for item in include):
                continue
            if name in volatile:
                require(path.is_file() and not path.is_symlink(), 'CHECKPOINT_SQLITE_SHM')
                continue  # SQLite rebuilds its shared-memory index from the saved WAL.
            if name in protected:
                require(not path.is_symlink(), 'CHECKPOINT_PROTECTED_LINK')
                continue
            info = path.lstat()
            require(not path.is_symlink(), 'CHECKPOINT_LINK')
            require(len(path.relative_to(root).parts) <= 40, 'CHECKPOINT_DEPTH')
            if stat.S_ISDIR(info.st_mode):
                entries[name] = dict(kind='directory', mode=stat.S_IMODE(info.st_mode))
                visit(path)
            else:
                require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'CHECKPOINT_SPECIAL_FILE')
                try:
                    entries[name] = dict(kind='file', mode=stat.S_IMODE(info.st_mode), bytes=info.st_size, hash=file_hash(path, cache))
                except FileNotFoundError:
                    if not warm:
                        raise
            require(len(entries) <= 200000, 'CHECKPOINT_LIMIT')
    visit(root)
    return entries


def copy_inventory(source, target, entries, cache=None, warm=False):
    require(not target.exists(), 'CHECKPOINT_TARGET_EXISTS')
    target.mkdir(mode=0o700)
    for name, item in entries.items():
        path = target / name
        require(path.is_relative_to(target) and '..' not in Path(name).parts and not Path(name).is_absolute(), 'CHECKPOINT_ENTRY')
        if item['kind'] == 'directory':
            path.mkdir(mode=0o700)
        else:
            try:
                shutil.copyfile(source / name, path)
                path.chmod(0o600)
                matched = path.stat().st_size == item['bytes'] and file_hash(path, cache) == item['hash']
                require(matched or warm, 'CHECKPOINT_COPY_CHANGED')
            except FileNotFoundError:
                if not warm:
                    raise


def sync_inventory(source, target, entries, cache):
    """Finalize only changed files in our private, independently copied staging tree."""
    if not target.exists():
        return copy_inventory(source, target, entries, cache)
    old = inventory(target, cache=cache)
    for name in sorted(old, key=lambda p: len(Path(p).parts), reverse=True):
        if name not in entries or old[name]['kind'] != entries[name]['kind']:
            path = target / name
            require(path.is_relative_to(target), 'CHECKPOINT_ENTRY')
            path.rmdir() if old[name]['kind'] == 'directory' else path.unlink()
    for name, item in entries.items():
        path = target / name
        require(path.is_relative_to(target) and '..' not in Path(name).parts and not Path(name).is_absolute(), 'CHECKPOINT_ENTRY')
        if item['kind'] == 'directory':
            path.mkdir(mode=0o700, exist_ok=True)
        elif old.get(name, {}).get('hash') != item['hash'] or not path.exists():
            shutil.copyfile(source / name, path)
            path.chmod(0o600)
            require(path.stat().st_size == item['bytes'] and file_hash(path, cache) == item['hash'], 'CHECKPOINT_COPY_CHANGED')


class PreparedCheckpoint:
    """Warm copies are not a valid checkpoint until create seals the cold snapshot."""
    def __init__(self, state, destination, revision):
        self.state, self.destination, self.revision = canonical(state), canonical(destination), revision
        require(not self.destination.is_relative_to(self.state / 'data'), 'CHECKPOINT_DESTINATION')
        require(not self.destination.exists(), 'CHECKPOINT_TARGET_EXISTS')
        self.destination.mkdir(mode=0o700, parents=True)
        self.cache = {}
        self.database_checks = {}
        self.timings = {}


class FrozenHub:
    """Private input for the daily Team backup CLI, never itself a backup.

    Warm preparation is advisory. seal() runs only with the Hub stopped and
    re-enumerates all files and account databases. The CLI can then run against
    this isolated tree while the original installation resumes.
    """
    def __init__(self, state, destination):
        self.state, self.destination = canonical(state), canonical(destination)
        require(not self.destination.is_relative_to(self.state), 'CHECKPOINT_DESTINATION')
        self.destination.mkdir(mode=0o700)
        self.cache = {}

    def entries(self, warm=False):
        config = json.loads((self.state / 'config.json').read_text())
        layout = team_layout(self.state, config)
        excluded = layout['protected'] + [name + suffix for name in layout['databases'] for suffix in ('', '-wal', '-shm', '-journal')]
        data = self.state / 'data'
        team = Path(config['team']['root']).relative_to(data)
        # Match createTeamSnapshot's inputs, not everything stored beside them.
        # In particular, old restore rehearsals/backups are not backup inputs.
        include = layout['databases'] + [Path(config['hub']['resultsPath']).relative_to(data).as_posix()]
        include += [(team / name).as_posix() for name in ('shared-results', 'space-chat-files')]
        for name in layout['databases'][1:]:
            parent = Path(name).parent
            include.append((parent / 'push-keys.json').as_posix())
            if parent != Path(config['hub']['databasePath']).relative_to(data).parent:
                include.append((parent / 'results').as_posix())
        return config, layout, inventory(data, excluded, cache=self.cache, warm=warm, include=include)

    def prepare(self, reserve_bytes=0):
        try:
            _, layout, entries = self.entries(warm=True)
            # One warm tree and the eventual ordinary Team backup coexist.
            size = sum(item.get('bytes', 0) for item in entries.values())
            size += sum((self.state / 'data' / name).stat().st_size for name in layout['databases'])
            require(shutil.disk_usage(self.destination).free > reserve_bytes + 2 * size + 2 * 1024 ** 3, 'CHECKPOINT_DISK_SPACE')
            copy_inventory(self.state / 'data', self.destination / 'data', entries, self.cache, warm=True)
        except FileNotFoundError:
            pass  # A live deletion is reconciled by the stopped seal.

    def seal(self):
        config, layout, entries = self.entries()
        sync_inventory(self.state / 'data', self.destination / 'data', entries, self.cache)
        for name in layout['databases']:
            source = database(self.state / 'data' / name)
            target = None
            try:
                target = sqlite3.connect(self.destination / 'data' / name)
                source.backup(target)
                target.execute('PRAGMA journal_mode=DELETE')
            finally:
                source.close()
                if target is not None:
                    target.close()
            (self.destination / 'data' / name).chmod(0o600)
        require(self.entries() == (config, layout, entries), 'CHECKPOINT_SOURCE_CHANGED')
        write_json(self.destination / 'config.json', config)

    def grant_reader(self, uid, gid):
        # Only our isolated tree changes ownership, never live databases/profiles.
        for root, dirs, files in os.walk(self.destination):
            os.chown(root, uid, gid)
            for name in files:
                path = canonical(Path(root) / name)
                require(path.is_file() and not path.is_symlink(), 'CHECKPOINT_FILE')
                os.chown(path, uid, gid)


def prepare(state, destination, revision):
    prepared = PreparedCheckpoint(state, destination, revision)
    state, destination = prepared.state, prepared.destination
    config = json.loads((state / 'config.json').read_text())
    layout = team_layout(state, config, checks=prepared.database_checks)
    excluded = layout['protected'] + [name + suffix for name in layout['databases'] for suffix in ('', '-wal', '-shm')]
    # The live app may replace/remove files. A vanished source only loses this
    # warm optimization; final create re-enumerates after admission is closed.
    try:
        entries = inventory(state / 'data', excluded, cache=prepared.cache, warm=True)
        require(shutil.disk_usage(destination).free > 3 * sum(item.get('bytes', 0) for item in entries.values()) + 64 * 1024 ** 2, 'CHECKPOINT_DISK_SPACE')
        copy_inventory(state / 'data', destination / 'data', entries, prepared.cache, warm=True)
        copied = inventory(destination / 'data', cache=prepared.cache)
        copy_inventory(destination / 'data', destination / 'restore-check', copied, prepared.cache)
    except FileNotFoundError:
        pass
    return prepared


def verify(checkpoint, cache=None, checks=None):
    checks = {} if checks is None else checks
    canonical(checkpoint)
    require(not checkpoint.is_symlink(), 'CHECKPOINT_LINK')
    manifest = json.loads((checkpoint / 'checkpoint.json').read_text())
    require(manifest['kind'] == 'codex-web-engine-checkpoint' and manifest['format'] == 1, 'CHECKPOINT_FORMAT')
    actual = inventory(checkpoint / 'data', databases=manifest['layout']['databases'], cache=cache)
    # Copied files/directories have intentionally more restrictive permissions.
    comparable = lambda entries: {p: {k: v for k, v in item.items() if k != 'mode'} for p, item in entries.items()}
    require(comparable(actual) == comparable(manifest['entries']), 'CHECKPOINT_CHECKSUM')
    for name, digest in manifest['private'].items():
        require(name in ('config.json', 'deploy.env', 'web-pointer.json'), 'CHECKPOINT_PRIVATE_PATH')
        require(file_hash(checkpoint / name, cache) == digest, 'CHECKPOINT_CONFIG_CHECKSUM')
    config = json.loads((checkpoint / 'config.json').read_text())
    layout = team_layout(Path(manifest['state']), config, checkpoint / 'data', checks=checks)
    # JSON encodes database tuples as arrays.
    require(json.loads(json.dumps(layout)) == manifest['layout'], 'CHECKPOINT_MAPPING_CHANGED')
    require(privacy(checkpoint / 'data', layout['databases'][0], manifest['privacy'], checks=checks) == manifest['privacy'], 'CHECKPOINT_PRIVACY_CHANGED')
    require(private_bindings(checkpoint / 'data', layout['databases'], manifest['privateBindings'], checks=checks) == manifest['privateBindings'], 'CHECKPOINT_PRIVATE_IDENTITY_CHANGED')
    return manifest


def create(state, destination, revision, prepared=None):
    state, destination = canonical(state), canonical(destination)
    require(not destination.is_relative_to(state / 'data'), 'CHECKPOINT_DESTINATION')
    if prepared is None:
        prepared = PreparedCheckpoint(state, destination, revision)
    require((prepared.state, prepared.destination, prepared.revision) == (state, destination, revision), 'CHECKPOINT_PREPARATION')
    require(not (destination / 'checkpoint.json').exists(), 'CHECKPOINT_ALREADY_SEALED')
    cache, checks = prepared.cache, prepared.database_checks
    started = time.monotonic()
    def phase(name):
        nonlocal started
        now = time.monotonic()
        prepared.timings[name] = round((now - started) * 1000)
        started = now
    try:
        config = json.loads((state / 'config.json').read_text())
        layout = team_layout(state, config, checks=checks)
        phase('sourceValidationMs')
        # SQLite may remove WAL files when its final reader closes, even with
        # the engine stopped. Snapshot databases through SQLite, not file copies.
        excluded = layout['protected'] + [name + suffix for name in layout['databases'] for suffix in ('', '-wal', '-shm')]
        entries = inventory(state / 'data', excluded, cache=cache)
        require(shutil.disk_usage(destination).free > 3 * sum(item.get('bytes', 0) for item in entries.values()) + 64 * 1024 ** 2, 'CHECKPOINT_DISK_SPACE')
        sync_inventory(state / 'data', destination / 'data', entries, cache)
        phase('fileSyncMs')
        with ExitStack() as readers:
            for name in layout['databases']:
                source = database(state / 'data' / name, checks)
                readers.callback(source.close)
                target = destination / 'data' / name
                saved = sqlite3.connect(target)
                try:
                    source.backup(saved)
                    saved.execute('PRAGMA journal_mode=DELETE')
                finally:
                    saved.close()
                target.chmod(0o600)
        phase('databaseCopyMs')
        private = {}
        for name, source in [('config.json', state / 'config.json'), ('deploy.env', state / 'deploy.env'), ('web-pointer.json', state / 'web-releases/current.json')]:
            if source.exists():
                canonical(source)
                shutil.copyfile(source, destination / name)
                (destination / name).chmod(0o600)
                private[name] = file_hash(destination / name, cache)
        require(inventory(state / 'data', excluded, cache=cache) == entries, 'CHECKPOINT_SOURCE_CHANGED')
        entries = inventory(destination / 'data', databases=layout['databases'], cache=cache)
        manifest = dict(kind='codex-web-engine-checkpoint', format=1, revision=revision, state=str(state), layout=layout, entries=entries, private=private,
                        privacy=privacy(state / 'data', layout['databases'][0], checks=checks), privateBindings=private_bindings(state / 'data', layout['databases'], checks=checks), createdAt=time.time_ns())
        write_json(destination / 'checkpoint.json', manifest)
        phase('manifestMs')
        verify(destination, cache, checks)
        phase('checkpointValidationMs')
        # Rehearse the exact file copy used for rollback, offline and without any
        # App Server startup, migration or replay of unknown native operations.
        sync_inventory(destination / 'data', destination / 'restore-check', entries, cache)
        require(inventory(destination / 'restore-check', databases=layout['databases'], cache=cache) == inventory(destination / 'data', databases=layout['databases'], cache=cache), 'CHECKPOINT_REHEARSAL')
        # The rehearsal is byte-identical (including DB hashes) to the validated
        # checkpoint above. Another SQLite scan of those same bytes adds no
        # restore evidence. Standalone restore() still starts with full verify().
        shutil.rmtree(destination / 'restore-check')
        phase('restoreRehearsalMs')
        write_json(destination / 'verified.json', dict(restored=True, revision=revision))
        return destination
    except BaseException:
        # Keep incomplete evidence in a private, never-retained-as-valid folder.
        if destination.exists():
            destination.rename(destination.with_name(destination.name + '-incomplete-' + str(time.time_ns())))
        raise


def admission(state, checkpoint, workspace_activation=False, prepared=None):
    if prepared is not None:
        require((prepared.state, prepared.destination) == (canonical(state), canonical(checkpoint)), 'CHECKPOINT_PREPARATION')
    checks = prepared.database_checks if prepared else {}
    manifest = verify(checkpoint, prepared.cache if prepared else None, checks)
    require(str(canonical(state)) == manifest['state'], 'CHECKPOINT_INSTALLATION')
    if workspace_activation:
        # Permit one fixed addition only. Every prior setting, account and machine
        # remains exact; the verified checkpoint still contains rollback config.
        from workspace_activation import candidate
        expected = candidate(state, json.loads((checkpoint / 'config.json').read_text()))
        require(json.loads((state / 'config.json').read_text()) == expected, 'CHECKPOINT_CONFIG_CHANGED')
    else:
        require(file_hash(state / 'config.json') == manifest['private']['config.json'], 'CHECKPOINT_CONFIG_CHANGED')
    layout = team_layout(state, json.loads((state / 'config.json').read_text()), checks=checks)
    require(json.loads(json.dumps(layout)) == manifest['layout'], 'CHECKPOINT_MAPPING_CHANGED')
    require(privacy(state / 'data', layout['databases'][0], manifest['privacy'], checks=checks) == manifest['privacy'], 'CHECKPOINT_PRIVACY_CHANGED')
    require(private_bindings(state / 'data', layout['databases'], manifest['privateBindings'], checks=checks) == manifest['privateBindings'], 'CHECKPOINT_PRIVATE_IDENTITY_CHANGED')


def restore(state, checkpoint):
    manifest = verify(checkpoint)
    require(str(canonical(state)) == manifest['state'], 'CHECKPOINT_INSTALLATION')
    require(not (checkpoint / 'admitted.json').exists(), 'CHECKPOINT_ALREADY_ADMITTED')
    protected = manifest['layout']['protected']
    current = inventory(state / 'data', protected, manifest['layout']['databases'])
    staged = state / ('engine-restore-' + str(time.time_ns()))
    copy_inventory(checkpoint / 'data', staged, manifest['entries'])
    failed = state / ('engine-failed-' + str(time.time_ns()))
    failed.mkdir(mode=0o700)
    # Move only disjoint subtrees. Protected profile mounts and the held host-lock
    # inode remain in place; all failed engine data is retained, including new files.
    def units(names):
        result = []
        for name in sorted(names, key=lambda n: (len(Path(n).parts), n)):
            if any(name == p or p.startswith(name + '/') for p in protected):
                continue
            if not any(name.startswith(parent + '/') for parent in result):
                result.append(name)
        return result
    volatile = {name + '-shm' for name in manifest['layout']['databases'] if (state / 'data' / (name + '-shm')).exists()}
    targets = units(set(current) | set(manifest['entries']) | volatile)
    write_json(failed / 'restore-journal.json', dict(checkpoint=str(checkpoint), staged=str(staged), targets=targets))
    for name in targets:
        live = state / 'data' / name
        if live.exists():
            saved = failed / 'data' / name
            saved.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            live.rename(saved)
        source = staged / name
        if source.exists():
            live.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            source.rename(live)
    # Preserve engine-visible permission bits (e.g. owner-only executable helpers).
    for name, item in sorted(manifest['entries'].items(), reverse=True):
        (state / 'data' / name).chmod(item['mode'])
    for name, target in [('config.json', state / 'config.json'), ('deploy.env', state / 'deploy.env'), ('web-pointer.json', state / 'web-releases/current.json')]:
        if name in manifest['private']:
            temporary = target.with_name(target.name + '.rollback')
            shutil.copyfile(checkpoint / name, temporary)
            temporary.chmod(0o600)
            temporary.replace(target)
    admission(state, checkpoint)
    shutil.rmtree(staged)
    write_json(failed / 'restored.json', dict(ok=True, checkpoint=str(checkpoint)))
    return failed
