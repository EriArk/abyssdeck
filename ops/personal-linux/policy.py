"""Administrator-owned personal Linux policy, not browser-supplied runtime flags."""
import ipaddress

MARKER = 'CodexWeb personal Linux v1'
PROJECT = 'cw-personal'
POOL = 'cw-personal'
NETWORK = 'cwpersonal0'
SUBNET = ipaddress.ip_network('10.203.0.0/24')
GATEWAY = '10.203.0.1'
STATE = '/var/lib/codex-personal-linux'
TABLE = 'cw_personal_linux'
IMAGE_SERVER = 'https://images.linuxcontainers.org'
IMAGE_ALIAS = 'ubuntu/24.04'
PRIVATE = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
           '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
           '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
           '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4']


def project():
    return {'name': PROJECT, 'description': MARKER, 'config': {
        'features.images': 'true', 'features.profiles': 'true',
        'features.storage.volumes': 'true', 'features.networks': 'false',
        'restricted': 'true', 'restricted.containers.privilege': 'isolated',
        'restricted.containers.nesting': 'block',
        'restricted.devices.disk': 'managed', 'restricted.devices.nic': 'managed',
        'restricted.networks.access': NETWORK,
        # Start with two 2-GiB environments. The host also runs unrelated services.
        'limits.containers': '2', 'limits.virtual-machines': '0',
        'limits.cpu': '4', 'limits.memory': '4GiB', 'limits.processes': '1024',
    }}


def profile():
    return {'name': 'personal-linux', 'description': MARKER, 'config': {
        'security.privileged': 'false', 'security.idmap.isolated': 'true',
        'security.nesting': 'false', 'limits.cpu': '2', 'limits.cpu.allowance': '200%',
        'limits.memory': '2GiB', 'limits.memory.swap': 'false',
        'limits.processes': '512', 'boot.autostart': 'false',
    }, 'devices': {
        'root': {'type': 'disk', 'path': '/', 'pool': POOL, 'size': '16GiB'},
        'eth0': {'type': 'nic', 'network': NETWORK, 'name': 'eth0',
                 'security.mac_filtering': 'true', 'security.ipv4_filtering': 'true',
                 'security.ipv6_filtering': 'true',
                 'security.port_isolation': 'true', 'limits.max': '100Mbit'},
    }}


def network():
    return {'name': NETWORK, 'description': MARKER, 'type': 'bridge', 'config': {
        'ipv4.address': GATEWAY + '/24', 'ipv4.nat': 'true', 'ipv6.address': 'none',
        'dns.mode': 'none', 'ipv4.dhcp': 'true',
    }}


def pool():
    return {'name': POOL, 'description': MARKER, 'driver': 'btrfs',
            'config': {'size': '48GiB'}}


def check_routes(routes):
    """Do not allocate over an existing LAN, VPN or Docker route."""
    for row in routes:
        destination = row.get('dst', 'default')
        if destination == 'default':
            continue
        found = ipaddress.ip_network(destination, strict=False)
        if not found.overlaps(SUBNET):
            continue
        if row.get('dev') == NETWORK and found.subnet_of(SUBNET):
            continue
        raise RuntimeError('PERSONAL_NETWORK_OVERLAP: ' + destination)


def firewall():
    """Only the dedicated bridge; never flush/replace Docker, UFW or host policy.

    Conntrack reply traffic permits replies to deliberately admitted inbound
    services. New connections from guests still cannot reach host/private LAN.
    DHCP is the sole host service exception; guest DNS uses public resolvers.
    """
    return f'''table inet {TABLE} {{
  chain input {{
    type filter hook input priority -10; policy accept;
    iifname "{NETWORK}" ct direction reply ct state established,related accept
    iifname "{NETWORK}" meta nfproto ipv4 udp sport 68 udp dport 67 accept
    iifname "{NETWORK}" counter drop
  }}
  chain forward {{
    type filter hook forward priority -10; policy accept;
    iifname "{NETWORK}" oifname "{NETWORK}" counter drop
    iifname "{NETWORK}" meta nfproto ipv6 counter drop
    iifname "{NETWORK}" ct direction reply ct state established,related accept
    iifname "{NETWORK}" ip daddr {{ {', '.join(PRIVATE)} }} counter drop
    oifname "{NETWORK}" ct state established,related accept
    oifname "{NETWORK}" counter drop
  }}
}}
'''


def matches(actual, expected):
    """Existing objects must have our marker and exact explicit security policy."""
    if actual.get('description') != MARKER:
        return False
    for key in ('name', 'driver', 'type'):
        if key in expected and actual.get(key) != expected[key]:
            return False
    if any(actual.get('config', {}).get(k) != v for k, v in expected.get('config', {}).items()):
        return False
    if any(key.startswith(('raw.', 'security.', 'restricted.')) and
           key not in expected.get('config', {}) for key in actual.get('config', {})):
        return False
    if 'devices' in expected and actual.get('devices') != expected['devices']:
        return False
    if 'profiles' in expected and actual.get('profiles') != expected['profiles']:
        return False
    return True
