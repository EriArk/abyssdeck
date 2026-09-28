#!/usr/bin/python3
"""Reviewed, explicit administrator step; does not activate Hub/member access.

Run --apply --hub-user USER --hub-state PATH --image-archive PATH --image-id sha256:...
after building the reviewed development image. No password/token argument exists.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tarfile
import time
from policy import SLOTS, DISK_GIB, ROOT, HOME, RUNTIME, podman_command


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def runtime_read(command):
    try:
        return subprocess.check_output(command, stderr=subprocess.PIPE, text=True, timeout=45)
    except subprocess.CalledProcessError as error:
        # Fixed installation probes only; preserve the useful Podman error,
        # instead of burying it under two complete Python command tracebacks.
        detail = (error.stderr or '').strip()[-4000:]
        raise RuntimeError(f'PODMAN_PREFLIGHT_FAILED ({error.returncode}): {detail}') from None
    except subprocess.TimeoutExpired:
        raise RuntimeError('PODMAN_PREFLIGHT_TIMEOUT') from None


def archive_image_id(archive):
    """Podman image identity is the config digest, not Docker's OCI index ID.

    Read metadata only from the already checksum-verified docker-save archive;
    never extract paths, resolve tags or choose an arbitrary loaded image.
    """
    with tarfile.open(archive, mode='r:') as bundle:
        def read_member(name, limit):
            matches = [member for member in bundle.getmembers() if member.name == name]
            if len(matches) != 1 or not matches[0].isfile() or not 0 < matches[0].size <= limit:
                raise RuntimeError('IMAGE_ARCHIVE_METADATA_INVALID')
            with bundle.extractfile(matches[0]) as file:
                return file.read(limit + 1)
        manifest = json.loads(read_member('manifest.json', 1024 * 1024))
        if not isinstance(manifest, list) or len(manifest) != 1 or not isinstance(manifest[0], dict):
            raise RuntimeError('IMAGE_ARCHIVE_REQUIRES_ONE_IMAGE')
        name = manifest[0].get('Config', '')
        if not isinstance(name, str) or not re.fullmatch(r'(?:blobs/sha256/[a-f0-9]{64}|[a-f0-9]{64}\.json)', name):
            raise RuntimeError('IMAGE_ARCHIVE_CONFIG_INVALID')
        config = read_member(name, 4 * 1024 * 1024)
        digest = hashlib.sha256(config).hexdigest()
        expected = name.rsplit('/', 1)[-1].removesuffix('.json')
        if digest != expected:
            raise RuntimeError('IMAGE_ARCHIVE_CONFIG_HASH_MISMATCH')
        return 'sha256:' + digest


def load_image(podman, archive, image_id):
    # Run before provisioning disks/services. The archive and config digest were
    # checked before this call; a tag printed by `load` never grants identity.
    with archive.open('rb') as file:
        run(podman + ['load'], stdin=file)
    actual = runtime_read(podman + ['image', 'inspect', image_id, '--format', '{{.Id}}']).strip()
    if actual.removeprefix('sha256:') != image_id.removeprefix('sha256:'):
        raise RuntimeError('IMAGE_ID_MISMATCH')


def write(path, text, mode=0o644):
    path = Path(path)
    if path.is_symlink():
        raise RuntimeError('SYMLINK_DESTINATION')
    temp = path.with_suffix(path.suffix + '.new')
    fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(text); file.flush(); os.fsync(file.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def check_mount(mount, image):
    # Verify the actual backing device before chown: an unrelated preexisting
    # mount must never have its ownership changed by this installer.
    if mount.is_symlink() or not mount.is_mount() or mount.resolve() != mount:
        raise RuntimeError('QUOTA_MOUNT_MISSING')
    value = json.loads(subprocess.check_output(
        ['findmnt', '-J', '-M', str(mount), '-o', 'SOURCE,FSTYPE,OPTIONS'], text=True))['filesystems'][0]
    if value['fstype'] != 'ext4' or not {'rw', 'nosuid', 'nodev'} <= set(value['options'].split(',')):
        raise RuntimeError('QUOTA_MOUNT_INVALID')
    backing = subprocess.check_output(['losetup', '--noheadings', '--output', 'BACK-FILE', value['source']], text=True).strip()
    if backing != str(image):
        raise RuntimeError('DISK_BINDING_INVALID')


def acceptance_evidence(image, service):
    evidence = {'image': image, 'checkedAt': int(time.time()), 'accepted': False}
    try:
        result = subprocess.run(['/usr/bin/python3', '/opt/codex-workspace-broker/acceptance.py'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=360)
        if result.returncode == 0:
            evidence['checks'] = json.loads(result.stdout)
            evidence['accepted'] = True
        else:
            evidence['failure'] = result.stderr[-4000:]
    except (subprocess.TimeoutExpired, OSError, ValueError):
        evidence['failure'] = 'ACCEPTANCE_INCOMPLETE'
    finally:
        if not evidence['accepted']:
            run(['systemctl', 'stop', service])
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--hub-user')
    parser.add_argument('--hub-state')
    parser.add_argument('--image-archive')
    parser.add_argument('--image-id')
    parser.add_argument('--archive-sha256')
    args = parser.parse_args()
    if not args.apply:
        print(f'Creates {SLOTS} private {DISK_GIB} GiB ext4 disks, dedicated rootless broker, '
              'UID-scoped private-network firewall and local authenticated Unix socket. '
              'No host ports, member login, Hub restart or private credentials are changed.')
        return
    if os.geteuid() != 0:
        parser.error('Use sudo in your private terminal.')
    if not all([args.hub_user, args.hub_state, args.image_archive, args.image_id, args.archive_sha256]):
        parser.error('All explicit installation arguments are required with --apply.')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', args.image_id):
        parser.error('Use the exact reviewed local image ID.')
    account = pwd.getpwnam('codex-workspaces'); hub = pwd.getpwnam(args.hub_user)
    if account.pw_dir != HOME or account.pw_shell != '/usr/sbin/nologin' or hub.pw_uid == account.pw_uid:
        raise RuntimeError('ACCOUNT_INVALID')
    state = Path(args.hub_state)
    if not state.is_absolute() or state.resolve() != state or state.stat().st_uid != hub.pw_uid:
        raise RuntimeError('HUB_STATE_INVALID')
    archive = Path(args.image_archive)
    if archive.resolve() != archive or not archive.is_file():
        raise RuntimeError('IMAGE_ARCHIVE_INVALID')
    if archive.stat().st_size > 4 * 1024**3 or not re.fullmatch('[a-f0-9]{64}', args.archive_sha256):
        raise RuntimeError('IMAGE_ARCHIVE_INVALID')
    with archive.open('rb') as file:
        if hashlib.file_digest(file, 'sha256').hexdigest() != args.archive_sha256:
            raise RuntimeError('IMAGE_ARCHIVE_HASH_MISMATCH')
    if archive_image_id(archive) != args.image_id:
        raise RuntimeError('IMAGE_ID_MUST_MATCH_ARCHIVE_CONFIG: rebuild setup manifest using the archive config digest')
    # Refuse replacing the runtime under any existing container/workspace.
    podman = podman_command(account.pw_uid)
    if runtime_read(podman + ['ps', '-aq']).strip():
        raise RuntimeError('EXISTING_WORKSPACES_REQUIRE_GUARDED_UPGRADE')
    info = json.loads(runtime_read(podman + ['info', '--format', 'json']))
    if not info['host']['security']['rootless'] or info['host']['cgroupVersion'] != 'v2' or not info['host']['security']['seccompEnabled']:
        raise RuntimeError('ROOTLESS_CGROUP_SECCOMP_REQUIRED')
    # Stock Podman 4.9 rootless does not apply container AppArmor profiles.
    # Keep Ubuntu's host/userns policy enabled, but never count it as an extra
    # container confinement layer. Real acceptance verifies the effective limits.
    if Path('/sys/module/apparmor/parameters/enabled').read_text().strip() != 'Y':
        raise RuntimeError('HOST_APPARMOR_DISABLED')
    service = 'codex-workspace-broker.service'
    if subprocess.run(['systemctl', 'is-active', '--quiet', service]).returncode == 0:
        raise RuntimeError('BROKER_ALREADY_ACTIVE')
    load_image(podman, archive, args.image_id)
    for path in [ROOT, ROOT+'/images', ROOT+'/slots', '/opt/codex-workspace-broker', '/etc/codex-workspaces']:
        p = Path(path)
        if p.exists() and (p.resolve() != p or p.stat().st_uid != 0):
            raise RuntimeError('HOST_DIRECTORY_INVALID')
        p.mkdir(mode=0o755, exist_ok=True)
    required = sum(DISK_GIB * 1024**3 for i in range(SLOTS) if not (Path(ROOT)/'images'/f'slot{i}.ext4').exists())
    if shutil.disk_usage(ROOT).free < required + 20 * 1024**3:
        raise RuntimeError('INSUFFICIENT_DISK_RESERVE')
    source = Path(__file__).resolve().parent
    for name in ['broker.py', 'policy.py', 'host-check.py', 'client.py', 'acceptance.py']:
        write('/opt/codex-workspace-broker/'+name, (source/name).read_text())
    key = Path('/etc/codex-workspaces/hub.key')
    if not key.exists():
        fd = os.open(key, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o640)
        with os.fdopen(fd, 'wb') as file:
            file.write(secrets.token_bytes(32)); file.flush(); os.fsync(file.fileno())
        os.chown(key, 0, account.pw_gid)
    if key.is_symlink() or key.stat().st_uid != 0 or key.stat().st_gid != account.pw_gid or stat.S_IMODE(key.stat().st_mode) != 0o640 or len(key.read_bytes()) != 32:
        raise RuntimeError('KEY_INVALID')
    hub_dir = state/'workspaces'
    if hub_dir.exists() and (hub_dir.resolve() != hub_dir or hub_dir.stat().st_uid != hub.pw_uid):
        raise RuntimeError('HUB_DIRECTORY_INVALID')
    hub_dir.mkdir(mode=0o700, exist_ok=True); os.chown(hub_dir, hub.pw_uid, hub.pw_gid)
    hub_key = hub_dir/'hub.key'
    if hub_key.exists():
        if hub_key.is_symlink() or hub_key.read_bytes() != key.read_bytes():
            raise RuntimeError('HUB_KEY_MISMATCH')
    else:
        fd = os.open(hub_key, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as file: file.write(key.read_bytes())
        os.chown(hub_key, hub.pw_uid, hub.pw_gid)
    mounts = []
    for i in range(SLOTS):
        image = Path(ROOT)/'images'/f'slot{i}.ext4'; mount = Path(ROOT)/'slots'/str(i)
        if mount.exists() and (mount.is_symlink() or mount.resolve() != mount):
            raise RuntimeError('MOUNT_PATH_INVALID')
        mount.mkdir(mode=0o700, exist_ok=True)
        if not image.exists():
            if mount.is_mount() or any(mount.iterdir()):
                raise RuntimeError('SLOT_NOT_EMPTY')
            fd = os.open(image, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            try:
                os.posix_fallocate(fd, 0, DISK_GIB * 1024**3)
            finally:
                os.close(fd)
            # Never reformat an existing disk, including after interrupted installation.
            run(['/usr/sbin/mkfs.ext4', '-q', '-m', '0', str(image)])
        if image.is_symlink() or image.stat().st_uid != 0 or image.stat().st_size != DISK_GIB*1024**3:
            raise RuntimeError('EXISTING_DISK_INVALID')
        name = subprocess.check_output(['systemd-escape', '--path', '--suffix=mount', str(mount)], text=True).strip()
        mounts.append(name)
        write('/etc/systemd/system/'+name, '[Unit]\nDescription=CodexWeb fixed workspace disk '+str(i)+'\n\n[Mount]\nWhat='+str(image)+'\nWhere='+str(mount)+'\nType=ext4\nOptions=loop,nosuid,nodev,noatime,errors=remount-ro\n\n[Install]\nWantedBy=multi-user.target\n')
    run(['systemctl', 'daemon-reload'])
    for i, name in enumerate(mounts):
        run(['systemctl', 'enable', '--now', name])
        check_mount(Path(ROOT)/'slots'/str(i), Path(ROOT)/'images'/f'slot{i}.ext4')
        os.chown(Path(ROOT)/'slots'/str(i), account.pw_uid, account.pw_gid)
        os.chmod(Path(ROOT)/'slots'/str(i), 0o700)
    write('/etc/codex-workspaces/config.json', json.dumps({'uid':account.pw_uid, 'hubUid':hub.pw_uid, 'image':args.image_id}))
    write('/etc/systemd/system/codex-workspace-network.service', '''[Unit]
Description=CodexWeb workspace egress isolation
Before=codex-workspace-broker.service
After=network-pre.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/codex-workspace-broker/host-check.py network
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
''')
    write('/etc/systemd/system/'+service, '''[Unit]
Description=CodexWeb private rootless workspace broker
Requires=codex-workspace-network.service user@%d.service %s
After=codex-workspace-network.service user@%d.service %s
BindsTo=codex-workspace-network.service %s

[Service]
Type=simple
User=codex-workspaces
Group=codex-workspaces
WorkingDirectory=/var/lib/codex-workspaces
UMask=0077
RuntimeDirectory=codex-workspace-broker
RuntimeDirectoryMode=0755
Environment=HOME=%s
Environment=XDG_RUNTIME_DIR=/run/user/%d
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/%d/bus
ExecStartPre=+/usr/bin/python3 /opt/codex-workspace-broker/host-check.py
ExecStart=/usr/bin/python3 /opt/codex-workspace-broker/broker.py
Restart=on-failure
RestartSec=3
LimitNOFILE=8192
TasksMax=2048
MemoryMax=1G
CPUQuota=100%%

[Install]
WantedBy=multi-user.target
''' % (account.pw_uid, ' '.join(mounts), account.pw_uid, ' '.join(mounts), ' '.join(mounts), HOME, account.pw_uid, account.pw_uid))
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'enable', '--now', 'codex-workspace-network.service', service])
    run(['systemctl', 'is-active', '--quiet', service])
    for attempt in range(30):
        if Path(RUNTIME+'/control.sock').exists() and Path(HOME+'/registry.sqlite').exists(): break
        time.sleep(1)
    evidence = acceptance_evidence(args.image_id, service)
    report=hub_dir/'host-readiness.json'
    write(report,json.dumps(evidence),0o600);os.chown(report,hub.pw_uid,hub.pw_gid)
    if not evidence['accepted']:
        raise RuntimeError('ISOLATION_ACCEPTANCE_FAILED: see private host-readiness.json; broker stopped')
    print('Private workspace isolation passed on two disposable environments. Hub access remains disabled until integration.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, tarfile.TarError, subprocess.SubprocessError) as error:
        print('Workspace setup stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
