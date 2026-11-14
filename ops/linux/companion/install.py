#!/usr/bin/env python3
"""Install local controls in the home filesystem; never restart during install."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--projects', required=True, type=Path)
    parser.add_argument('--disk-uuid', required=True)
    parser.add_argument('--node', required=True, type=Path)
    parser.add_argument('--ws-module', required=True, type=Path)
    parser.add_argument('--ssh-helper', required=True, type=Path)
    parser.add_argument('--url', required=True)
    args = parser.parse_args()
    for path in (args.projects, args.node, args.ws_module, args.ssh_helper):
        if not path.is_absolute() or not path.exists():
            parser.error(f'Existing absolute path required: {path}')
    if not args.url.startswith('https://'):
        parser.error('HTTPS URL required')
    home = Path.home()
    target = home / '.local/share/abyssdeck/companion'
    target.mkdir(parents=True, exist_ok=True)
    for name in ('control.py', 'window.py', 'native-status.mjs'):
        shutil.copyfile(Path(__file__).with_name(name), target / name)
    config = home / '.config/abyssdeck/companion.json'
    config.parent.mkdir(parents=True, exist_ok=True)
    data = dict(projects=str(args.projects), diskUuid=args.disk_uuid, node=str(args.node),
                wsModule=str(args.ws_module), sshHelper=str(args.ssh_helper), url=args.url,
                socket=f'/run/user/{__import__("os").getuid()}/abyssdeck/codex.sock')
    config.write_text(json.dumps(data, indent=2) + '\n')
    config.chmod(0o600)
    dropin = home / '.config/systemd/user/abyssdeck-codex.service.d/20-project-disk.conf'
    dropin.parent.mkdir(parents=True, exist_ok=True)
    command = json.dumps(str(target / 'control.py'))
    dropin.write_text('[Unit]\nStartLimitIntervalSec=0\n\n[Service]\n'
                      f'ExecStartPre=/usr/bin/python3 {command} check-disk\n'
                      'Restart=on-failure\nRestartSec=10\nTimeoutStartSec=30\n')
    desktop = home / '.local/share/applications/org.abyssdeck.Companion.desktop'
    desktop.parent.mkdir(parents=True, exist_ok=True)
    desktop.write_text('[Desktop Entry]\nType=Application\nName=AbyssDeck Companion\n'
                       'Comment=Запуск и восстановление AbyssDeck\n'
                       f'Exec=/usr/bin/python3 {command}\n'
                       'Icon=utilities-system-monitor\nTerminal=false\nCategories=Development;Utility;\n'
                       'StartupNotify=true\n')
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', 'abyssdeck-codex.service'], check=True)
    print(f'Installed: {desktop}\nNo running service restarted.')


if __name__ == '__main__':
    main()
