# Server Workspaces — состояние подготовки

Владелец включил #170 и оставшиеся тестовые окружения #198 в текущий проход.
Обычные личные integration copies уже реализованы; не подменять ими серверную изоляцию.

28 сентября на books-server подтверждены Docker и cgroup v2, но нет Podman,
newuidmap/slirp4netns; непривилегированный unshare получает EPERM. sudo требует
интерактивный пароль. Пароль не запрашивается в чате и не сохраняется в файлах.

По уточнению владельца сначала дорабатывается терминал внутри веб-интерфейса:
точный переход к устройству из сообщения, ввод команд и отдельное скрытое поле.
Существующее подключение `hub-host` уже ведёт на сервер владельца. Права участника
на устройство не расширяются ссылкой.

Терминал установлен в `6c151b5`, реальный SSH/PTY проверен. Владелец получил
команду `sudo bash /home/abysscloud/services/codex-web/releases/6c151b5/ops/linux/prepare-server-workspaces.sh --apply`
для ввода внутри веб-приложения. Владелец подтвердил выполнение. Повторное чтение
сервера подтвердило Podman 4.9.3, uidmap/slirp4netns/fuse-overlayfs, отдельного
пользователя `codex-workspaces` (UID 1001), домашний каталог с правами 0700,
диапазоны subuid/subgid по 65536 и активный `user@1001.service` с linger.
Повторный запуск контейнера под служебной учётной записью из сессии агента пока
не выполнялся; это подтверждение подготовки, а не приёмка изоляции Workspace.

`ops/linux/prepare-server-workspaces.sh` — проверяемый административный шаг для
Ubuntu 24.04. Без аргумента он лишь перечисляет изменения. `--apply` устанавливает
пакеты, создаёт отдельную закрытую служебную учётную запись, включает её user manager
и проверяет rootless/cgroup v2. Не меняет Docker, общую политику AppArmor или сетевые
порты, не копирует аккаунты владельца. Повтор использует ту же служебную запись;
несовпадающие путь/оболочка/владелец останавливают подготовку.

## Подготовленный host-пакет, ещё не установлен

В `ops/workspaces` реализован отдельный rootless broker: точная подпись владельца
и операции, короткие capabilities, устойчивые квитанции без повтора exec, потоки
stdin/stdout/stderr, ограничение конкурентности, отдельный отзыв доступа.
Запрос не может задавать runtime-флаги, image, host-mount или публичный порт.
Потеря подтверждения создания сверяется по точному контейнеру без повторного запуска.

Установщик готовит четыре фиксированных ext4-диска по 16 GiB (64 GiB суммарно),
ограничения 2 CPU / 2 GiB / 384 процесса на окружение, read-only базу и ограниченные
tmpfs. Отдельная nftables-таблица ограничивает только служебный UID: закрывает
host-local, LAN/Tailnet, metadata и IPv6, оставляя публичный IPv4 для зависимостей.
Действующие Docker/UFW-таблицы не переписываются. Подготовлен образ с Git/gh,
Node, Python/venv, build tools и Codex CLI 0.158.0; образ и архив закреплены хешами.

15 целевых Linux-проверок проходят, включая настоящий Unix socket, проверку peer UID,
подмену подписи/владельца, потерянное подтверждение, повтор nonce после рестарта,
разделение двух владельцев, отзыв и бинарный обмен с реальным дочерним процессом.
Это **не проверка реальной контейнерной изоляции**: она требует установки системного
пакета через терминал с sudo. Подготовлена автоматическая проверка двух временных
окружений, квоты ENOSPC, cgroup/namespace/seccomp, сети и сохранности после
рестарта. При ошибке broker останавливается; приватный отчёт остаётся в
`workspaces/host-readiness.json`. Учётные записи Codex/GitHub не копируются.

Учтена особенность штатного Podman 4.9: rootless-контейнеры не получают отдельный
AppArmor-профиль. Host AppArmor/userns-политика Ubuntu сохраняется включённой;
она не выдаётся за дополнительную контейнерную защиту. Установщик проверяет
rootless/cgroup/seccomp и реальные ограничения, без privileged и отключения AppArmor.
Таймаут/неверный отчёт приёмки останавливают broker; чужой mount проверяется до chown.

Это **ещё не готовая пользовательская функция Server Workspace**. До включения
остаются реальная host-приёмка, нормальный Linux-транспорт Files/Git/Terminal/Codex,
связь с личными runtime и отзывом Team, согласованный backup/restore томов и registry,
проектные сервисы и защищённый preview. До этого UI не показывает недоступную машину.
Подробности и контракт: [host boundary](../ops/workspaces/README.md).

## Подготовленная установка `fded2b9`

Исходники находятся в `main`. Пакет из точного git archive размещён на books-server:
`/home/abysscloud/services/codex-web/workspace-setup-fded2b9`.
Проверка manifest и запуск без `--apply` прошли. Владелец запустил root-установку
28 сентября в 07:05 по журналу сервера; sudo-сессия завершилась через две секунды.
Каталоги `/srv/codex-workspaces`, `/etc/codex-workspaces`, `/opt/codex-workspace-broker`
и readiness-отчёт отсутствуют; обе службы inactive. Остановка произошла до системных
изменений. IMG_0705 подтвердил `cannot chdir to /home/abysscloud: Permission denied`:
`runuser` сохранял недоступную рабочую папку владельца. Использованная команда:

```sh
sudo python3 /home/abysscloud/services/codex-web/workspace-setup-fded2b9/apply-bundle.py --apply
```

Image ID: `sha256:2dfe22e60b1cc06c94fd2bb189a2468a71cab22b471b024f0064cb8b49720a9c`.
Архив: 399573504 bytes, SHA-256
`a274f722a972641c0103385a91b75224ab66c48a0e129eb7629123786c09127e`.
Образ закреплён на Node digest и Codex CLI 0.158.0; runtime archive повторно сверен
после копирования. Системный шаг выделяет 64 GiB для четырёх частных дисков.
Приёмка работает до пользовательского enrollment, с двумя временными контейнерами.
После неё читать `workspaces/host-readiness.json`, не считать dry-run host-приёмкой.

Работающие engine/gateway остаются `6c151b5`, native owner/member — `25f09b8`;
ID контейнеров `a8a302224bfb` / `e4d9a82808a6` / `e2e02ae8c128` / `0c4aae142698`.
Web-only обновлён до `b0327b4` для прокрутки терминала; engine/native не перезапускались.

## Исправленный пакет `b0327b4`

Общий запуск Podman теперь использует HOME служебного пользователя как cwd и чистое
фиксированное окружение. Prerequisites и systemd WorkingDirectory исправлены также.
Исходная ошибка preflight выводится кратко без двойного traceback. 17 Python-проверок
прошли. Пакет `/home/abysscloud/services/codex-web/workspace-setup-b0327b4` подготовлен
из точного commit; manifest, хеш runtime archive и dry-run проверены. Образ прежний.
Административный шаг **ещё не выполнен**:

```sh
sudo python3 /home/abysscloud/services/codex-web/workspace-setup-b0327b4/apply-bundle.py --apply
```

Не повторять сборку и prerequisites: после запуска проверить настоящий readiness-отчёт.
Первоначальная Podman-проверка prerequisites тоже падала; установленные пакеты и активный
user manager сами по себе не доказывают работоспособность rootless-контейнеров.

Основания для prerequisites: [Podman rootless requirements](https://github.com/podman-container-tools/podman/blob/main/docs/tutorials/rootless_tutorial.md),
[ограничения AppArmor в Ubuntu 24.04](https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/).
Не отключать ограничения user namespaces глобально ради установки.
