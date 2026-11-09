"""Explicit owner PC replacement, applied only inside a sealed Team checkpoint.

The plan is private installation data. No authentication, namespace, receipt,
thread identity or original artifact provenance is rewritten.
"""
import copy
import hashlib
import json
import ntpath
from pathlib import PurePosixPath
import sqlite3


def require(value, code):
    if not value:
        raise RuntimeError(code)


def path_map(value, plan):
    if not value or value.startswith('/'):
        return value
    source = ntpath.normpath(value)
    for item in sorted(plan['paths'], key=lambda p: len(p['from']), reverse=True):
        old = ntpath.normpath(item['from'])
        if source.casefold() == old.casefold() or source.casefold().startswith(old.casefold().rstrip('\\') + '\\'):
            suffix = source[len(old):].lstrip('\\').split('\\')
            result = str(PurePosixPath(item['to']).joinpath(*[p for p in suffix if p]))
            require('..' not in PurePosixPath(result).parts, 'RECOVERY_PATH_ESCAPE')
            return result
    raise RuntimeError('RECOVERY_PATH_UNMAPPED')


def candidate(original, plan):
    require(set(plan) == {'format', 'configHash', 'machineId', 'machine', 'device', 'paths', 'saveNativeHistory'}, 'RECOVERY_PLAN_FIELDS')
    require(plan['format'] == 1 and plan['saveNativeHistory'] is True, 'RECOVERY_PLAN_FORMAT')
    machine_id = plan['machineId']
    old = [m for m in original['machines'] if m['id'] == machine_id]
    require(len(old) == 1 and old[0]['type'] == 'ssh-windows', 'RECOVERY_SOURCE_MACHINE')
    new = plan['machine']
    require(new['id'] == machine_id and new['type'] == 'ssh-linux' and new['codex']['appServerSocket'].startswith('/'), 'RECOVERY_TARGET_MACHINE')
    require(new.get('ssh', {}).get('target') and new['codex'].get('persistent'), 'RECOVERY_TARGET_TRANSPORT')
    require(plan['paths'] and all(set(p) == {'from', 'to'} and ntpath.isabs(p['from']) and p['to'].startswith('/') and '..' not in PurePosixPath(p['to']).parts for p in plan['paths']), 'RECOVERY_PATHS')
    result = copy.deepcopy(original)
    result['machines'] = [copy.deepcopy(new) if m['id'] == machine_id else m for m in result['machines']]
    for p in result['projects']:
        if p['machineId'] == machine_id:
            p['workingDirectory'] = path_map(p['workingDirectory'], plan)
    if plan['device'] is not None:
        device = plan['device']
        require(device['id'] == machine_id and device['platform'] == 'linux', 'RECOVERY_DEVICE')
        require(sum(d['id'] == machine_id for d in result['devices']) == 1, 'RECOVERY_DEVICE_SOURCE')
        result['devices'] = [copy.deepcopy(device) if d['id'] == machine_id else d for d in result['devices']]
    return result


def load(state, path):
    plan = json.loads(path.read_text())
    raw = (state / 'config.json').read_bytes()
    require(hashlib.sha256(raw).hexdigest() == plan['configHash'], 'RECOVERY_CONFIG_CHANGED')
    original = json.loads(raw)
    candidate(original, plan)
    return plan


def transform_database(database, original, plan):
    """One transaction: only owner catalog paths and native read-only mode."""
    with sqlite3.connect(database) as db:
        db.row_factory = sqlite3.Row
        projects = {p['id'] for p in original['projects'] if p['machineId'] == plan['machineId']}
        projects.add('unassigned-' + plan['machineId'])
        changed_projects = 0
        for row in db.execute('SELECT * FROM catalog_projects WHERE machineId=?', (plan['machineId'],)).fetchall():
            projects.add(row['id'])
            value = json.loads(row['value'])
            value['workingDirectory'] = path_map(value['workingDirectory'], plan)
            value['roots'] = [path_map(p, plan) for p in value.get('roots', [])]
            if value.get('sourceId'):
                value['recoverySourceId'] = value.pop('sourceId')
            db.execute('UPDATE catalog_projects SET value=? WHERE id=?', (json.dumps(value, ensure_ascii=False), row['id']))
            changed_projects += 1
        changed_threads = 0
        for row in db.execute('SELECT id,projectId,workingDirectory FROM threads').fetchall():
            if row['projectId'] not in projects:
                continue
            db.execute("UPDATE threads SET workingDirectory=?,historyMode='saved' WHERE id=?", (path_map(row['workingDirectory'], plan), row['id']))
            changed_threads += 1
        return {'projects': changed_projects, 'savedThreads': changed_threads}


def apply(state, original, plan):
    transformed = candidate(original, plan)
    counts = transform_database(original['hub']['databasePath'], original, plan)
    temporary = state / 'config.recovery.tmp'
    temporary.write_text(json.dumps(transformed, ensure_ascii=False, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(state / 'config.json')
    return counts
