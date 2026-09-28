# Терминал: прокрутка вывода и исправление установки

На IMG_0703 виден exit 125 от `podman ps -aq`; IMG_0705 показывает исходную
ошибку `cannot chdir to /home/abysscloud: Permission denied`. Служебный пользователь
не имеет доступа в домашнюю папку владельца, а `runuser` сам cwd не менял.
Проблема затрагивала как первоначальную проверку prerequisites, так и новый пакет.

Общий `podman_command(uid)` в `ops/workspaces/policy.py` использует фиксированные
учётную запись/HOME, `env --ignore-environment --chdir=...`, явные PATH/runtime/DBus.
Установка и автоматическая приёмка используют его; bash prerequisites исправлен
аналогично. Служба broker также имеет явный WorkingDirectory. Права домашней папки
владельца и системная политика AppArmor не меняются. Исходная ошибка Podman выводится
вместо двух traceback с полным списком аргументов. Реальная проверка служебной
учётной записи требует повторного sudo шага; это не завершение #170/#198.

Терминал xterm 6 теперь обрабатывает вертикальный свайп непосредственно над выводом.
Только один палец и вертикальное движение после порога; боковая полоса остаётся
штатной. Используются публичные buffer/scroll API, без ввода в PTY, внутренних полей
xterm и глобальной блокировки жестов. Слушатели удаляются при смене/закрытии терминала.
При чтении истории новый вывод сохраняет положение. Кнопка «К последнему выводу»
появляется в существующей строке статуса; клавиши стрелок снизу остаются вводом оболочки.
Справка дополнена. Закрытие окна не останавливает работающую сессию.

Проверки: 17 Python/Linux-тестов, включая реальный запуск env из чужого cwd и удаление
унаследованных настроек контейнеров/proxy; web TypeScript/build. Chromium с CDP touch
и WebKit с DOM touch проверяют свайп, отсутствие PTY-ввода, сохранение позиции при новом
выводе, возврат вниз, существующие password/paste/reconnect сценарии. Снимки всех четырёх
тем и телефонного viewport с клавиатурой. Физический iPhone не объявляется проверенным.

Справка о поведении Podman с закрытым cwd: [upstream issue](https://github.com/podman-container-tools/podman/issues/24247).

## Установка

Исходники `b0327b4` находятся в `main`. Web-only опубликован штатным publisher:
`02869d8723f3fb01a01505bc13ffbb47a394019a4e2ab82fe1d1c52148215af1`.
Публичный version endpoint совпадает с установленным manifest; старые и новые файлы
сверены по хешам. Backup: `backups/web-before-b0327b4.json`.
ID/StartedAt/image engine, gateway и обоих native-контейнеров неизменны.
Квитанция: `/home/abysscloud/codex-web-native-lab/terminal-scroll-web-activation.json`.

Исправленный host-пакет подготовлен отдельно:
`/home/abysscloud/services/codex-web/workspace-setup-b0327b4`.
Manifest/checksums и dry-run прошли, runtime-образ сохранён прежним. Реальная установка
и host-приёмка ожидают sudo-пароля владельца в `codexweb://terminal/hub-host`:

```sh
sudo python3 /home/abysscloud/services/codex-web/workspace-setup-b0327b4/apply-bundle.py --apply
```

Это ещё не завершение серверных окружений: после host-приёмки остаётся интеграция
Linux Files/Git/Terminal/Codex, личного доступа, backup/restore и закрытого preview.

Позднее владелец выполнил этот шаг: cwd исправлен, но выявлено различие Docker index
и Podman config ID. Host-команда выше историческая; актуальный пакет — `2796e31`,
см. `CURRENT_STATUS.md`. Терминальный web-релиз `b0327b4` остаётся установленным.
