#!/usr/bin/python3
"""Prepare and verify independent personal Linux; no migration or public listener.

Without --apply prints the plan. The administrator runs --apply in Devices.
All installation effects are scoped to a new Incus project/network/storage pool.
Legacy workspaces, Hub, GPT, Companion, host SSH and user accounts are untouched.
"""
import argparse
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import quote, urlsplit

from policy import (STATE, PROJECT, NETWORK, TABLE, MARKER, IMAGE_ALIAS, IMAGE_SERVER,
                    check_routes, firewall, matches, network, pool, profile, project)

REPORT = Path('/var/lib/codex-personal-linux-readiness.json')


def command(args, *, input=None, timeout=60):
    result = subprocess.run(args, input=input, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError('COMMAND_FAILED: ' + args[0] + ': ' + result.stderr[-2000:])
    return result.stdout.strip()


class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/lib/incus/unix.socket')


class Incus:
    def request(self, method, path, body=None, missing=False):
        if not path.startswith('/1.0') or urlsplit(path).netloc:
            raise RuntimeError('INCUS_PATH_INVALID')
        connection = UnixHTTP('localhost', timeout=330)
        try:
            connection.request(method, path, None if body is None else json.dumps(body),
                               {'Content-Type': 'application/json'})
            reply = connection.getresponse()
            data = reply.read(8 * 1024 * 1024 + 1)
            if missing and reply.status == 404:
                return None
            if len(data) > 8 * 1024 * 1024:
                raise RuntimeError('INCUS_REPLY_LIMIT')
            value = json.loads(data)
            if reply.status >= 400 or value.get('type') == 'error':
                raise RuntimeError('INCUS_REFUSED: ' + str(value.get('error', reply.status)))
            return value
        finally:
            connection.close()

    def get(self, path, missing=False):
        value = self.request('GET', path, missing=missing)
        return None if value is None else value['metadata']

    def wait(self, value):
        operation = value.get('operation')
        if operation:
            if not re.fullmatch(r'/1\.0/operations/[a-f0-9-]{36}(?:\?project=[a-z0-9-]+)?', operation):
                raise RuntimeError('INCUS_OPERATION_INVALID')
            parsed = urlsplit(operation)
            result = self.get(parsed.path + '/wait?timeout=300' +
                              ('&' + parsed.query if parsed.query else ''))
            if result.get('status_code') != 200:
                raise RuntimeError('INCUS_OPERATION_INCOMPLETE: ' + str(result.get('err', '')))
        return value


def atomic(path, value):
    path = Path(path)
    if path.is_symlink() or path.parent.resolve() != path.parent:
        raise RuntimeError('STATE_PATH_INVALID')
    temporary = path.with_suffix(path.suffix + '.new')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(json.dumps(value, indent=2) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


class Setup:
    def __init__(self, directory, api):
        self.directory = Path(directory)
        self.api = api
        self.receipt = self.directory / 'setup.json'
        self.state = json.loads(self.receipt.read_text()) if self.receipt.exists() else {
            'schema': 1, 'marker': MARKER, 'createdAt': int(time.time()), 'operations': {},
            'hostAccepted': False, 'userActivated': False,
        }
        if self.state.get('marker') != MARKER or self.state.get('schema') != 1:
            raise RuntimeError('SETUP_STATE_INVALID')

    def save(self):
        atomic(self.receipt, self.state)

    def ensure(self, collection, body, scoped=False):
        suffix = '?project=' + PROJECT if scoped else ''
        path = collection + '/' + quote(body['name'], safe='') + suffix
        intent = self.state['operations'].get(path)
        if intent and intent.get('operation') and intent['state'] != 'completed':
            self.api.wait({'operation': intent['operation']})
        found = self.api.get(path, missing=True)
        if found is not None:
            if not intent or not matches(found, body):
                raise RuntimeError('EXISTING_OBJECT_NOT_OWNED_OR_CHANGED: ' + path)
        else:
            if intent:
                # A lost POST acknowledgement is not permission to dispatch it again.
                raise RuntimeError('SETUP_OPERATION_UNCONFIRMED: ' + path)
            self.state['operations'][path] = {'state': 'accepted'}
            self.save()
            result = self.api.request('POST', collection + suffix, body)
            self.state['operations'][path]['operation'] = result.get('operation')
            self.save()
            self.api.wait(result)
            found = self.api.get(path)
            if not matches(found, body):
                raise RuntimeError('CREATED_OBJECT_MISMATCH: ' + path)
        self.state['operations'][path]['state'] = 'completed'
        self.save()
        return found


def write_fixed(path, text):
    path = Path(path)
    if path.is_symlink():
        raise RuntimeError('INSTALL_SYMLINK')
    if path.exists():
        if path.read_text() != text or path.stat().st_uid != 0:
            raise RuntimeError('INSTALL_FILE_CHANGED: ' + str(path))
        return
    with path.open('x') as stream:
        stream.write(text)
    path.chmod(0o600)


def publish_report(setup):
    # This report contains no credentials, owner IDs, command contents or private
    # instance inventory. The owner can read it without another sudo operation.
    report = {key: setup.state[key] for key in
              ('schema', 'marker', 'hostAccepted', 'userActivated', 'acceptedAt',
               'packages', 'checks', 'failure') if key in setup.state}
    report['checkedAt'] = int(time.time())
    atomic(REPORT, report)
    REPORT.chmod(0o644)


def install_firewall(setup):
    rules = firewall()
    rules_path = setup.directory / 'network.nft'
    write_fixed(rules_path, rules)
    unit = f'''[Unit]
Description=CodexWeb personal Linux host and private-network boundary
Before=incus.service
After=network-pre.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/nft -f {rules_path}
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
'''
    # No ExecStop flush: stopping this unit must not remove the boundary.
    path = '/etc/systemd/system/codex-personal-network.service'
    table = subprocess.run(['nft', 'list', 'table', 'inet', TABLE], capture_output=True)
    if table.returncode == 0 and not setup.state.get('firewallIntent'):
        raise RuntimeError('FIREWALL_TABLE_ALREADY_EXISTS')
    write_fixed(path, unit)
    setup.state['firewallIntent'] = hashlib.sha256(rules.encode()).hexdigest()
    setup.save()
    command(['nft', '--check', '--file', str(rules_path)])
    command(['systemctl', 'daemon-reload'])
    command(['systemctl', 'enable', '--now', 'codex-personal-network.service'])
    command(['nft', 'list', 'table', 'inet', TABLE])


def preflight():
    if sys.platform != 'linux':
        raise RuntimeError('LINUX_HOST_REQUIRED')
    release = Path('/etc/os-release').read_text()
    if 'ID=ubuntu' not in release or 'VERSION_ID="24.04"' not in release:
        raise RuntimeError('REVIEWED_HOST_IS_UBUNTU_24_04')
    if not Path('/sys/fs/cgroup/cgroup.controllers').is_file():
        raise RuntimeError('CGROUP_V2_REQUIRED')
    if shutil.disk_usage('/var/lib').free < 64 * 1024**3:
        raise RuntimeError('REQUIRES_64_GIB_FREE_FOR_NEW_POOL')
    memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    if int(memory['MemAvailable'].split()[0]) * 1024 < 5 * 1024**3:
        raise RuntimeError('REQUIRES_5_GIB_AVAILABLE_FOR_TWO_DISPOSABLE_PROBES')
    check_routes(json.loads(command(['ip', '-j', '-4', 'route', 'show', 'table', 'all'])))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    preflight()
    if not args.apply:
        print(json.dumps({'mode': 'plan', 'project': project(), 'profile': profile(),
                          'storage': pool(), 'network': network(),
                          'imageSource': IMAGE_SERVER + ' / ' + IMAGE_ALIAS,
                          'checks': ['unprivileged UID isolation', 'system packages and services',
                                     'SSH and SFTP with disposable key', 'restart persistence',
                                     'host and sibling denial', 'real disk quota'],
                          'publicListeners': [], 'migration': False,
                          'hubRestart': False, 'codexRequired': False}, indent=2))
        return
    if os.geteuid() != 0:
        raise RuntimeError('Run sudo in the private Devices terminal; never send the password in chat.')
    os.umask(0o077)
    directory = Path(STATE)
    if directory.is_symlink() or directory.resolve() != directory:
        raise RuntimeError('STATE_PATH_INVALID')
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.stat().st_uid != 0 or directory.stat().st_mode & 0o077:
        raise RuntimeError('STATE_PERMISSIONS_INVALID')
    with (directory / 'install.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        receipt = directory / 'setup.json'
        if receipt.exists():
            previous = json.loads(receipt.read_text())
            if previous.get('marker') != MARKER:
                raise RuntimeError('SETUP_STATE_INVALID')
            if previous.get('hostAccepted'):
                print(json.dumps({'mode': 'existing-receipt', 'receipt': str(receipt),
                                  'acceptedAt': previous['acceptedAt'],
                                  'userActivated': previous['userActivated']}, indent=2))
                return
        print('Installing supported Ubuntu packages; no existing service is restarted.', flush=True)
        command(['apt-get', 'update'], timeout=300)
        command(['env', 'DEBIAN_FRONTEND=noninteractive', 'NEEDRESTART_MODE=l',
                 'apt-get', 'install', '-y', '--no-install-recommends',
                 'incus', 'incus-client', 'btrfs-progs', 'nftables', 'openssh-client'], timeout=600)
        command(['systemctl', 'start', 'incus.service'])
        api = Incus()
        if api.get('/1.0')['config'].get('core.https_address'):
            raise RuntimeError('INCUS_MANAGEMENT_LISTENER_REQUIRES_REVIEW')
        setup = Setup(directory, api)
        setup.state['hostAccepted'] = False
        setup.state['packages'] = command(['dpkg-query', '-W', 'incus', 'incus-client', 'btrfs-progs'])
        setup.save()
        publish_report(setup)
        try:
            install_firewall(setup)
            setup.ensure('/1.0/networks', network())
            setup.ensure('/1.0/storage-pools', pool())
            setup.ensure('/1.0/projects', project())
            setup.ensure('/1.0/profiles', profile(), scoped=True)
            print('Dedicated host boundary prepared; testing disposable Linux instances.', flush=True)
            from acceptance import verify
            checks = verify(setup)
            setup.state['checks'] = checks
            setup.state['hostAccepted'] = True
            setup.state['acceptedAt'] = int(time.time())
            setup.state.pop('failure', None)
        except Exception as error:
            setup.state['failure'] = str(error)[-2000:]
            raise
        finally:
            setup.save()
            publish_report(setup)
        print(json.dumps({'hostAccepted': True, 'userActivated': False, 'checks': checks,
                          'receipt': str(setup.receipt)}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
