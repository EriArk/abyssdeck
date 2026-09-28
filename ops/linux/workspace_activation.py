"""Exact optional config delta for first activation, under engine maintenance."""
import json
from pathlib import Path
import subprocess


def settings(state):
    return {'ssh': {'target': 'hub-host', 'configFile': str(state / 'ssh/config')},
            'keyFile': str(state / 'workspaces/hub.key')}


def candidate(state, original):
    if not original.get('team', {}).get('enabled') or original.get('serverWorkspaces'):
        raise RuntimeError('WORKSPACE_FIRST_ACTIVATION_ONLY')
    return dict(original, serverWorkspaces=settings(state))


def verify_host(state, image):
    if not image or not image.startswith('sha256:') or len(image) != 71:
        raise RuntimeError('WORKSPACE_IMAGE_REQUIRED')
    host = json.loads(Path('/etc/codex-workspaces/config.json').read_text())
    readiness = json.loads((state / 'workspaces/host-readiness.json').read_text())
    if host['hubUid'] != state.stat().st_uid or host['image'] != image or readiness.get('image') != image or readiness.get('accepted') is not True:
        raise RuntimeError('WORKSPACE_HOST_NOT_ACCEPTED')
    for path in [state / 'ssh/config', state / 'workspaces/hub.key']:
        if path.resolve() != path or not path.is_file(): raise RuntimeError('WORKSPACE_HOST_PATH')
    for unit in ['codex-workspace-broker.service', 'codex-workspace-network.service', 'codex-workspace-checkpoint.timer']:
        subprocess.run(['systemctl', 'is-active', '--quiet', unit], check=True)
