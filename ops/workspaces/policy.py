"""Fixed host policy. Request data can select an owner, never a runtime flag or mount."""
import hashlib
import re
import uuid

SLOTS = 4
DISK_GIB = 16
MEMORY = 2 * 1024**3
PIDS = 384
CPUS = 2
ROOT = '/srv/codex-workspaces'
HOME = '/var/lib/codex-workspaces'
RUNTIME = '/run/codex-workspace-broker'


def owner_id(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise ValueError('OWNER_INVALID')
    return value


def container_name(owner):
    return 'cw-' + hashlib.sha256(owner_id(owner).encode()).hexdigest()[:32]


def slot_path(slot):
    if type(slot) is not int or not 0 <= slot < SLOTS:
        raise ValueError('SLOT_INVALID')
    return f'{ROOT}/slots/{slot}'


def container_args(owner, slot, image):
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('IMAGE_INVALID')
    return [
        'run', '--detach', '--name', container_name(owner), '--pull=never',
        '--label', 'codexweb.owner=' + owner_id(owner),
        '--read-only', '--read-only-tmpfs=false', '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--pid=private', '--ipc=private', '--cgroupns=private',
        '--network=slirp4netns:allow_host_loopback=false,enable_ipv6=false',
        '--dns=1.1.1.1', '--no-hosts', '--http-proxy=false', '--log-driver=none',
        '--memory=' + str(MEMORY), '--memory-swap=' + str(MEMORY),
        '--cpus=' + str(CPUS), '--pids-limit=' + str(PIDS),
        '--ulimit=nofile=4096:4096', '--ulimit=core=0:0',
        '--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777',
        '--tmpfs=/run:rw,nosuid,nodev,noexec,size=16m,mode=755',
        '--shm-size=64m', '--user=0:0',
        '--mount=type=bind,src=' + slot_path(slot) + ',dst=/workspace,rw',
        '--env=HOME=/workspace/home', '--env=XDG_CONFIG_HOME=/workspace/home/.config',
        '--env=XDG_CACHE_HOME=/workspace/home/.cache',
        '--env=CODEX_HOME=/workspace/home/.codex', '--env=NPM_CONFIG_PREFIX=/workspace/home/.local',
        '--env=PATH=/workspace/home/.local/bin:/usr/local/bin:/usr/bin:/bin',
        '--workdir=/workspace', image, '/usr/local/bin/workspace-init',
    ]


def exec_args(owner, argv, cwd):
    if not isinstance(argv, list) or not 1 <= len(argv) <= 128:
        raise ValueError('ARGV_INVALID')
    if any(not isinstance(v, str) or '\0' in v or len(v) > 8192 for v in argv):
        raise ValueError('ARGV_INVALID')
    if not argv[0] or sum(len(v) for v in argv) > 32768:
        raise ValueError('ARGV_INVALID')
    if not isinstance(cwd, str) or not cwd.startswith('/') or len(cwd) > 2048 or '\0' in cwd:
        raise ValueError('CWD_INVALID')
    # argv starts AFTER the fixed container argument; there is never a host shell.
    return ['exec', '--interactive', '--workdir', cwd, '--', container_name(owner), *argv]


def firewall(uid):
    if type(uid) is not int or uid < 1000:
        raise ValueError('UID_INVALID')
    return '''table inet codex_workspaces {
  chain output {
    type filter hook output priority -10; policy accept;
    meta skuid %d jump workspace_egress
  }
  chain workspace_egress {
    meta nfproto ipv6 counter reject
    fib daddr type { local, broadcast, multicast } counter reject
    ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8,
      169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24,
      192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24,
      224.0.0.0/4, 240.0.0.0/4 } counter reject
  }
}
''' % uid
