"""Real-host checks on two labelled disposable instances; never a user's disk.

Only successful probes are deleted. A failure stops exact owned test instances
and leaves them for diagnosis. No test credentials are copied from a real user.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time
import uuid

from policy import PROJECT, POOL, GATEWAY, IMAGE_ALIAS, IMAGE_SERVER, MARKER, profile
from prepare import command


def path(name, suffix=''):
    if not re.fullmatch(r'cw-check-[a-f0-9]{12}-[ab]', name):
        raise RuntimeError('PROBE_NAME_INVALID')
    return '/1.0/instances/' + name + suffix + '?project=' + PROJECT


def owned(setup, name):
    value = setup.api.get(path(name), missing=True)
    if value is not None and (value.get('config', {}).get('user.codexweb.probe') !=
                              setup.state['probeRun']['id'] or value.get('description') != MARKER):
        raise RuntimeError('PROBE_OWNERSHIP_MISMATCH')
    return value


def state(setup, name, action, force=False):
    if owned(setup, name) is None:
        raise RuntimeError('PROBE_MISSING')
    setup.api.wait(setup.api.request('PUT', path(name, '/state'),
                                    {'action': action, 'timeout': 30, 'force': force}))


def execute(name, argv, input=None, timeout=60):
    path(name)  # validate before constructing any runtime arguments
    return command(['incus', '--project', PROJECT, 'exec', name, '--mode=non-interactive',
                    '--', *argv], input=input, timeout=timeout)


def shell(name, script, timeout=60):
    return execute(name, ['sh', '-eu', '-s'], input=script, timeout=timeout)


def wait_ssh(options, address):
    last = None
    for _ in range(20):
        try:
            return command(['ssh', *options, 'root@' + address, 'id -u'], timeout=8)
        except (RuntimeError, subprocess.TimeoutExpired) as error:
            last = error
            time.sleep(1)
    raise RuntimeError('PROBE_SSH_NOT_READY') from last


def verify(setup):
    if setup.state.get('probeRun', {}).get('phase') == 'completed':
        return setup.state['probeRun']['checks']
    if 'probeRun' not in setup.state:
        setup.state['probeRun'] = {'id': uuid.uuid4().hex[:12], 'phase': 'creating'}
        setup.save()
    run = setup.state['probeRun']
    names = ['cw-check-' + run['id'] + '-' + letter for letter in ('a', 'b')]
    addresses = ['10.203.0.10', '10.203.0.11']
    checks = []
    passed = False
    try:
        for name, address in zip(names, addresses):
            devices = profile()['devices']
            devices['root']['size'] = '2GiB'  # bounded ENOSPC proof, not a 16-GiB write
            devices['eth0']['ipv4.address'] = address
            source = {'type': 'image', 'mode': 'pull', 'server': IMAGE_SERVER,
                      'protocol': 'simplestreams', 'alias': IMAGE_ALIAS}
            if run.get('fingerprint'):
                source = {'type': 'image', 'fingerprint': run['fingerprint']}
            setup.ensure('/1.0/instances', {
                'name': name, 'description': MARKER, 'type': 'container',
                'profiles': ['personal-linux'], 'source': source,
                'config': {'user.codexweb.probe': run['id']}, 'devices': devices,
            }, scoped=True)
            instance = owned(setup, name)
            fingerprint = instance['config']['volatile.base_image']
            if not re.fullmatch('[a-f0-9]{64}', fingerprint):
                raise RuntimeError('PROBE_IMAGE_INVALID')
            if run.get('fingerprint') and run['fingerprint'] != fingerprint:
                raise RuntimeError('PROBE_IMAGE_CHANGED')
            run['fingerprint'] = fingerprint
            setup.save()
            if instance['status'] != 'Running':
                state(setup, name, 'start')
            # Fixed guest script only, run in our labelled disposable instance.
            shell(name, '''
for attempt in $(seq 1 30); do
  test -d /run/systemd/system && break
  sleep 1
done
printf 'nameserver 1.1.1.1\nnameserver 9.9.9.9\n' >/etc/cw-public-resolv.conf
ln -sf /etc/cw-public-resolv.conf /etc/resolv.conf
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends openssh-server python3 curl git ca-certificates
mkdir -p /workspace /root/.ssh /etc/ssh/sshd_config.d
chmod 700 /root/.ssh
ssh-keygen -A
cat >/etc/ssh/sshd_config.d/00-cw-probe.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
cat >/etc/systemd/system/cw-personal-check.service <<'EOF'
[Unit]
Description=Disposable personal Linux service check
After=network.target
[Service]
WorkingDirectory=/workspace
ExecStart=/usr/bin/python3 -m http.server 18765 --bind 0.0.0.0
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
printf 'persistent-service-proof\n' >/workspace/persistent.txt
systemctl daemon-reload
systemctl enable --now cw-personal-check.service ssh.service
systemctl restart ssh.service
''', timeout=600)
        a, b = names
        maps = [execute(name, ['cat', '/proc/self/uid_map']) for name in names]
        ranges = []
        for mapping in maps:
            rows = [list(map(int, line.split())) for line in mapping.splitlines()]
            if len(rows) != 1 or rows[0][0] != 0 or rows[0][1] == 0:
                raise RuntimeError('UNPRIVILEGED_MAPPING_REQUIRED')
            ranges.append(range(rows[0][1], rows[0][1] + rows[0][2]))
        if ranges[0].start < ranges[1].stop and ranges[1].start < ranges[0].stop:
            raise RuntimeError('OWNER_UID_MAPS_OVERLAP')
        checks.append('distinct-unprivileged-uid-maps')
        for name in names:
            shell(name, '''
test "$(cat /sys/fs/cgroup/memory.max)" = 2147483648
test "$(cat /sys/fs/cgroup/memory.swap.max)" = 0
test "$(cat /sys/fs/cgroup/pids.max)" = 512
python3 -c 'q,p=open("/sys/fs/cgroup/cpu.max").read().split(); assert q != "max" and 0 < int(q) <= 2*int(p)'
grep -Eq '^Seccomp:[[:space:]]+2$' /proc/self/status
test ! -e /var/lib/incus/unix.socket
test ! -e /var/run/docker.sock
test ! -e /srv/codex-workspaces
if (echo max >/sys/fs/cgroup/memory.max) 2>/dev/null; then exit 1; fi
''')
        checks.append('cpu-memory-swap-pids-seccomp-host-path-boundary')
        # A real listening host endpoint and a listening sibling remove the
        # false-positive case where an already closed port looks isolated.
        with socket.socket() as listener:
            listener.bind((GATEWAY, 0))
            listener.listen(4)
            port = listener.getsockname()[1]
            for origin, sibling in ((a, addresses[1]), (b, addresses[0])):
                script = '''import socket,sys
for address, port in %s:
    try:
        connection=socket.create_connection((address,port),timeout=2)
    except OSError:
        continue
    connection.close()
    raise SystemExit('PRIVATE_BOUNDARY_OPEN')
print('denied')
''' % repr([(GATEWAY, port), (sibling, 18765)])
                execute(origin, ['curl', '--fail', '--retry', '5', '--retry-connrefused',
                                 '--max-time', '5', 'http://127.0.0.1:18765/persistent.txt'])
                execute(origin, ['python3', '-c', script], timeout=10)
        checks.append('live-host-and-live-sibling-connections-denied')
        execute(a, ['curl', '--fail', '--max-time', '20', 'https://example.com'])
        checks.append('public-dns-https-and-system-package-install')
        quota = shell(a, '''
python3 - <<'PY'
import errno, os
name='/workspace/cw-disposable-quota-proof'
try:
    with open(name,'xb') as stream:
        try:
            os.posix_fallocate(stream.fileno(),0,2*1024**3)
        except OSError as error:
            if error.errno not in (errno.ENOSPC,errno.EDQUOT): raise
            print('quota-enforced')
        else:
            raise SystemExit('DISK_QUOTA_NOT_ENFORCED')
finally:
    os.unlink(name)
PY
''')
        if quota != 'quota-enforced':
            raise RuntimeError('DISK_QUOTA_CHECK_INVALID')
        checks.append('actual-root-disk-quota-enospc')
        with tempfile.TemporaryDirectory(prefix='ssh-probe-', dir=setup.directory) as temporary:
            directory = Path(temporary)
            key = directory / 'identity'
            command(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key)])
            execute(a, ['sh', '-c', 'umask 077; cat >/root/.ssh/authorized_keys'],
                    input=key.with_suffix('.pub').read_text())
            host_key = execute(a, ['cat', '/etc/ssh/ssh_host_ed25519_key.pub']).split()
            known = directory / 'known_hosts'
            known.write_text(addresses[0] + ' ' + ' '.join(host_key[:2]) + '\n')
            options = ['-i', str(key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                       '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=4',
                       '-o', 'UserKnownHostsFile=' + str(known), '-o', 'ForwardAgent=no']
            if wait_ssh(options, addresses[0]) != '0':
                raise RuntimeError('SSH_CONTAINER_ADMIN_REQUIRED')
            upload = directory / 'upload.bin'
            download = directory / 'download.bin'
            upload.write_bytes(os.urandom(32768))
            batch = directory / 'sftp.batch'
            batch.write_text(f'put {upload} /workspace/sftp-check.bin\n'
                             f'get /workspace/sftp-check.bin {download}\n')
            command(['sftp', *options, '-b', str(batch), 'root@' + addresses[0]])
            if upload.read_bytes() != download.read_bytes():
                raise RuntimeError('SFTP_BYTES_MISMATCH')
            checks.append('key-only-ssh-and-binary-sftp')
            state(setup, a, 'restart')
            wait_ssh(options, addresses[0])
            reply = command(['ssh', *options, 'root@' + addresses[0],
                             'curl --fail --retry 10 --retry-connrefused --max-time 5 '
                             'http://127.0.0.1:18765/persistent.txt'])
            if reply != 'persistent-service-proof':
                raise RuntimeError('SERVICE_RESTART_PERSISTENCE_FAILED')
            actual = execute(a, ['sha256sum', '/workspace/sftp-check.bin']).split()[0]
            if actual != hashlib.sha256(upload.read_bytes()).hexdigest():
                raise RuntimeError('FILE_RESTART_PERSISTENCE_FAILED')
            checks.append('service-and-files-survive-disconnect-and-restart')
        passed = True
    finally:
        errors = []
        for name in names:
            try:
                value = owned(setup, name)
                if value is None:
                    continue
                if value['status'] != 'Stopped':
                    state(setup, name, 'stop', force=True)
                if passed:
                    setup.api.wait(setup.api.request('DELETE', path(name)))
            except Exception as error:
                errors.append(str(error))
        if errors:
            run['cleanupErrors'] = errors
            setup.save()
            raise RuntimeError('PROBE_CLEANUP_INCOMPLETE; inspect labelled probes')
    run.update(phase='completed', checks=checks, completedAt=int(time.time()))
    setup.save()
    return checks
