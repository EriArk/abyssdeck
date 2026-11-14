#!/usr/bin/env python3
"""Local recovery controls. No listener, token copying or message submission."""
import argparse
import json
from pathlib import Path
import subprocess
import time

CONFIG = Path.home() / '.config/abyssdeck/companion.json'
UNIT = 'abyssdeck-codex.service'


def execute(argv, timeout=25):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                            cwd=Path.home(), stdin=subprocess.DEVNULL)
    if result.returncode:
        raise RuntimeError((result.stderr.strip() or result.stdout.strip() or
                            f'Команда завершилась с кодом {result.returncode}')[-1500:])
    return result.stdout.strip()


class Control:
    def __init__(self, config, run=execute):
        self.config, self.run = config, run

    def check_disk(self):
        # Access the existing directory first, triggering systemd automount.
        # Never create a replacement Projects directory on the system disk.
        root = Path(self.config['projects'])
        if not root.is_dir():
            raise RuntimeError('Папка проектов недоступна. Проверь подключение Data.')
        uuid = self.run(['findmnt', '-rn', '-o', 'UUID', '--target', str(root)])
        if uuid != self.config['diskUuid']:
            raise RuntimeError('По пути проектов подключён другой диск. Запуск остановлен.')
        return 'Data подключён; папка проектов доступна'

    def remote(self, command, timeout=25):
        return self.run([self.config['sshHelper'], command], timeout=timeout)

    def native(self):
        return json.loads(self.run([self.config['node'], str(Path(__file__).with_name('native-status.mjs')),
                                   self.config['socket'], self.config['wsModule']], timeout=25))

    def wait_client(self):
        deadline = time.monotonic() + 20
        while True:
            try:
                return self.native()
            except Exception as error:
                # Type=simple becomes active before its Unix socket is listening.
                # Retry only connection establishment, never a message or command.
                if time.monotonic() >= deadline or not any(code in str(error) for code in ('ENOENT', 'ECONNREFUSED')):
                    raise
                time.sleep(0.25)

    def status(self):
        rows = []
        def inspect(title, action):
            try:
                rows.append(f'{title}: {action()}')
            except Exception as error:
                rows.append(f'{title}: недоступно — {error}')
        inspect('Диск', self.check_disk)
        inspect('Служба Codex', lambda: self.run(['systemctl', '--user', 'is-active', UNIT]))
        inspect('Автозапуск Codex', lambda: self.run(['systemctl', '--user', 'is-enabled', UNIT]))
        def native():
            data = self.native()
            return f"{data['version']}; вход {'выполнен' if data['signedIn'] else 'не выполнен'}; моделей {data['models']}"
        inspect('Подключение Codex', native)
        def server():
            data = json.loads(self.remote("docker inspect --format '{{json .}}' codex-web-hub codex-web-engine | "
                                         "python3 -c 'import sys,json; print(json.dumps([{\"name\":d[\"Name\"],\"status\":d[\"State\"][\"Status\"],\"health\":d[\"State\"].get(\"Health\",{}).get(\"Status\",\"unknown\"),\"restart\":d[\"HostConfig\"][\"RestartPolicy\"][\"Name\"]} for d in map(json.loads,sys.stdin)]))'"))
            if len(data) != 2:
                raise RuntimeError('Не получено состояние обеих служб')
            return '\n' + '\n'.join(f"  {d['name'].lstrip('/')}: {d['status']} / {d['health']}; автозапуск {d['restart']}" for d in data)
        inspect('Сервер', server)
        return '\n\n'.join(rows)

    def action(self, action, confirmed=False):
        if action in ('restart-client', 'restart-server') and not confirmed:
            raise RuntimeError('Перезапуск требует явного подтверждения остановки текущих задач.')
        if action in ('start', 'restart-client'):
            self.check_disk()
            self.run(['systemctl', '--user', 'start' if action == 'start' else 'restart', UNIT], timeout=60)
            self.wait_client()
            return 'Codex запущен и отвечает.'
        if action == 'restart-server':
            self.remote('docker restart --timeout 45 codex-web-engine codex-web-hub', timeout=120)
            return 'Серверные службы перезапущены. Проверяю подключение…'
        if action == 'open':
            self.run(['xdg-open', self.config['url']])
            return 'Сайт открыт в браузере.'
        raise ValueError('Неизвестное действие')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', nargs='?', default='gui',
                        choices=['gui', 'status', 'check-disk', 'start', 'restart-client', 'restart-server', 'open'])
    parser.add_argument('--config', type=Path, default=CONFIG)
    parser.add_argument('--confirm-interruption', action='store_true')
    parser.add_argument('--smoke', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    control = Control(json.loads(args.config.read_text()))
    if args.action == 'gui':
        from window import show
        show(control, smoke=args.smoke)
    elif args.action == 'status':
        print(control.status())
    elif args.action == 'check-disk':
        print(control.check_disk())
    else:
        print(control.action(args.action, args.confirm_interruption))


if __name__ == '__main__':
    main()
