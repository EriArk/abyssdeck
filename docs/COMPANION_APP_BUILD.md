# Companion 0.4.1: сборка, вход и настройка Windows

Пакет содержит окно/трей, вход в Hub, мастер подключения ПК, проверку компонентов,
явный ремонт остановленных помощников и локальный терминал. Существующий исполнитель
Codex сохраняется. Наличие local `deviceId` не даёт прав Hub: сервер проверяет
аккаунт, действующий сеанс и собственную Windows identity. Подписанный UI updater и bounded recovery реализованы; статус установки указан в CURRENT_STATUS.md.

## Зафиксированная сборка

- Avalonia **12.1.3**, .NET SDK **10.0.401**, автономный .NET **10.0.12**, win-x64.
- `apps/companion/global.json` и `packages.lock.json` закрепляют toolchain/deps.
- На Windows 10 Home 22H2/build 19045/x64 выполнен реальный GUI compatibility
  spike: автономный exe открыл окно, read-only inventory и настройки при 125% DPI.
  Framework использует [нативный Win32](https://docs.avaloniaui.net/docs/supported-platforms)
  и [TrayIcon](https://docs.avaloniaui.net/controls/navigation/trayicon/).
- SDK нужен только для сборки. Publish содержит runtime, не использует SDK или
  глобальный .NET на пользовательской машине. Linux packaging — будущий этап.

```powershell
# Подставить установленный SDK 10.0.401; в рабочем checkout он может быть .local.
ops/windows/Build-CompanionApp.ps1 -Dotnet dotnet -OutputDirectory D:\builds\companion-ui-0.4.0
dotnet run --project tests/companion-app/CompanionApp.Checks.csproj -c Release
```

Build требует locked restore и новую выходную папку. Manifest содержит version,
sourceRevision/sourceDirty и точные SHA-256 всех файлов. Для выпуска `sourceDirty`
должен быть false. Локальный hash manifest — проверка exact owner-reviewed
пакета; он **не заменяет** подписанный manifest auto-updater.

## Подписанное обновление UI 0.4

Проверенная первоначальная установка закрепляет публичный RSA-3072 ключ в exe.
Hub проверяет тот же ключ; серверный URL или локальный флаг не меняют доверие.
Приватный ключ находится только в gitignored `.local/companion-signing` с DACL
текущего пользователя/SYSTEM; его нельзя включать в архив, передавать на Hub
или печатать в журнал. Ротация ключа требует отдельного проверенного выпуска.

После чистой сборки создать ZIP только из файлов пакета, без верхней папки и
directory entries. Затем подписать локально:

```powershell
node ops/companion/publish-update.mjs D:\builds\companion-ui-0.4.0 D:\builds\companion.zip D:\private\publisher.pem D:\builds\signed
```

На Hub передаются только `<sha256>.zip` и `latest.json` в
`dirname(databasePath)/companion-releases`. ZIP сохраняется неизменяемым;
`latest.json` заменяется атомарно после копирования архива. Endpoint доступен
только действующему purpose-bound Companion grant, без browser cookies.
Updater проверяет подпись, platform/OS/protocol, version/монотонную sequence,
размер и SHA архива, exact file inventory/manifest SHA и каждый файл.
Повреждённый journal не отменяет anti-rollback. Staging ограничен тремя папками;
старые установленные releases сохраняются для rollback/действующих клиентов.

Проверка при старте и раз в шесть часов; после неудачной/пустой проверки — не чаще
раза в десять минут. Ручная проверка доступна в Настройках/трее. Background
activation ждёт скрытия окна, завершения setup/recovery и сохранения полей ввода.
Установщик ждёт точный старый UI PID/start/exe, меняет только current pointer,
запускает новый UI и подтверждает nonce/PID/start/version/release. При неудаче
возвращает точный старый pointer и интерфейс. Профиль, DPAPI grant, task definitions,
native accounts и активные workers не меняются. Отдельное окно терминала продолжает
работать. Health подтверждает UI/config, а не замену native backend.

Kit `helpers/` входит в подписанный inventory. Автовосстановление сохраняет SID,
task digest и backoff до эффекта; свежая проверка task XML повторяется перед
действием. Только собственные известные Ready auxiliaries: остановленный Computer
Use либо отсутствующий файл модуля. Demand Ready с целым файлом исправен.
Running/Disabled/foreign/absent/unknown tasks, desktop elevation и оба native
writers не затрагиваются. После трёх неудач пауза 15 минут; повреждённый recovery
journal требует ручного разбора. Настройки отключают автоматические функции.

Полное обновление CLI/broker/native desktop runtime — следующий отдельный этап
с idle lease и protocol/account/model acceptance; UI updater его не имитирует.

## Отдельная установка UI

```powershell
ops/windows/Install-CompanionApp.ps1 -PackageDirectory D:\builds\companion-ui-0.4.0 `
  -HubOrigin https://your-hub.example -DeviceId your-device-id -Route 'LAN SSH'
```

Установка под текущим Windows SID: `%LOCALAPPDATA%\CodexWeb\companion-app`.
Сначала проверяется полный пакет, затем копируется immutable release. Pointer
`current.json` и стабильный `Start-CompanionApp.ps1` не зависят от desktop Codex.
Старые releases/pointers сохраняются. Повторная установка не перезаписывает
профиль; несовпадение SID и ссылки в путях отвергаются. Профиль не содержит
паролей, токенов или прав аккаунта. Отдельный `device-session.bin` зашифрован DPAPI
текущего пользователя; содержит только ограниченный Companion grant, связанный с
сеансом Hub. Выход отзывает этот grant, сохраняя браузерный и native accounts.
Пакет одинаковый для владельца и участников; `Install.cmd` запускает установку,
`README.txt` содержит инструкцию первого запуска. Новый профиль сразу открывает окно.

Автозапуск — только собственный `HKCU\...\Run\CodexWebCompanionApp`; ярлык —
меню «Пуск → CodexWeb → CodexWeb Companion». Никакая из девяти прежних Scheduled
Tasks не изменяется. При входе UI появляется в трее; запуск ярлыка поднимает
существующее окно. Второй UI не запускает второго работника. Current-user/session
named pipe принимает `SHOW` и фиксированные действия открытия терминала/подстановки
логина или установки программы. Произвольные команды не принимает; подстановка
не исполняется, отправка требует отдельного действия в терминале. TCP listener нет.

## Доступное поведение

Обзор показывает public HTTPS health Hub, текущую Windows identity и уже выбранные
рабочие папки persistent Companion. Вход в Hub выполняется в Companion; пароль
используется только для входа и не сохраняется. Users/invitations остаются в вебе:
кнопка управления видна после подтверждения роли сервером. Владельцу можно принять
его существующий LAN-профиль через operator-only preconfiguration с SSH-проверкой
SID/MachineGuid, без копирования native account credentials.
Изменение origin сбрасывает местную подпись старого device/route.

«Компоненты» читает девять собственных Interactive tasks, проверяет файл task/module
и короткий passive PING broker/bridge. Computer Use отвечает только на `status`,
подтверждая ту же интерактивную сессию. Native runtime не создаётся и controller
не захватывается. Ready workers отображаются «Готов по запросу», не как ошибка.
Невозможность чтения остаётся «Неизвестно»; чужие задачи не дают readiness.
Готовые компоненты получают галочку; остановленный долгоживущий процесс требует
внимания, demand worker в Ready исправен. Неиспользуемый альтернативный broker
не считается неисправным. Ремонт сверяет SID и точный hash task XML, отказывается
трогать Running и сохраняет копию модуля перед восстановлением файлов. Одновременно
может идти только один ремонт данного компонента. Замена native writer требует
отдельной idle migration. Desktop maintenance при переустановке вызывает обычный
same-user UAC; вход другим Windows account отвергается.

На новом ПК после входа мастер автоматически проходит пять шагов: приватная сеть,
рабочие папки, программы и личные входы, SSH, отчёт Hub. Номер enrollment и token
сохраняются до запроса; в окне виден весь список шагов с готовностью, текущий шаг
не получает галочку до завершения проверки. Финальный отчёт требует ответа Hub.
Повторная попытка использует то же подключение. Bootstrap
проверяется SHA-256, checkpoint связан с SID/MachineGuid. Личные входы и запросы
Windows остаются видимыми. Подтверждение администратором выполняется в вебе.
Истёкшее подключение требует нового входа; незавершённый шаг не повторяется
параллельно уже запущенному мастеру.

Локальный терминал работает через ConPTY ещё до появления SSH. Есть отдельные поля
команды и скрытого пароля, «Вставить» и отдельная отправка, Enter/Esc/Tab/Ctrl+C и
стрелки. Кнопки логина Codex/GitHub лишь подставляют команду. Вывод ограничен,
переносится и следует вниз, пока пользователь сам не отмотал; на диск не пишется.
Это текстовый терминал, не полноценная эмуляция графических TUI. Закрытие завершает
только его собственную shell, без повторов ввода и остановки native workers.

Проверка при открытии/возврате, вручную и раз в 30 секунд объединяет параллельные
запросы. Новая identity generation не получает устаревший ответ. Slow tick не
отменяет предыдущий. Таймауты ограничены; после восстановления связи состояние
обновляется автоматически без отправки native-команд. При временной ошибке
проверки сохраняется предыдущий snapshot с его временем.

Крестик скрывает окно; «Выйти из интерфейса» завершает только UI. Четыре темы
используют semantic web palettes и один layout. Настройки сохраняют тему,
автозапуск и адрес Hub. «Сохранить отчёт» пишет локальный JSON без логов,
credentials, содержимого чатов и полного worker config; отмена сохраняет окно.
Диалог отчёта начинает выбор в «Документах», а не внутри immutable runtime.

## Установка владельца — 30 сентября 2026

UI 0.2.0 установлен в 16:30 UTC, source `24c20ce`, manifest
`fdd9fb689a83d0326affd7b7a28b7a7da38f7a5927e448d47e7f600aecc5bd72`.
Hub/`main-windows`/LAN SSH преднастроены; собственный автозапуск и ярлык созданы.
9 focused checks и отрицательные package path/hash fixtures прошли. Реальная
GUI-проверка выявила и устранила конфликт родителей при смене темы; повторная
установка выявила и устранила лишний SACL privilege request (меняется только DACL).
На установленном exe проверены Hub health, девять компонентов, собственные roots,
settings, светлые/тёмные темы, scrolling, report JSON, hide/reopen same process
и UI-only exit. Полный before/after task/config hash baseline и native process
creation timestamp сохранены. Действия меню трея и вход после перезагрузки
Windows — последующая обычная приёмка владельцем, без перезагрузки текущей работы.

Финальный **UI 0.3.0 установлен 30 сентября в 20:50 UTC**, source `d527751`,
manifest `0d479f09ff38a8213837630c954d52692d887059783e65f7eb92fc5eb37e1d3a`.
Проверены SHA-256 всех 227 установленных файлов. Hub `93d1f87` активирован
обычным idle upgrade с paired checkpoint. Владелец преднастроен через SSH
SID/MachineGuid-проверку и ограниченный DPAPI grant; native accounts не копировались.
Временный plaintext grant удалён после подтверждения установленного подключения.
Сеанс Companion восстанавливается при повторном запуске UI; истечение или отзыв
родительского сеанса требует нового входа в Hub.

На установленном exe проверены Hub/account/device, галочки компонентов, реальный
локальный терминал и четыре темы. Тема возвращена к classic-dark с восстановлением
исходных байтов профиля. Девять task definitions, helper configs и native PID/start
сохранены. 16 C# checks включают ConPTY I/O, DPAPI и состояния шагов; task repair
проверен пятью fixtures без намеренной поломки исправной установки владельца.
Полный первый мастер на другом физическом ПК ещё не принят: peer друга offline.
Пакет `CodexWeb-Companion-0.3.0-win-x64.zip` содержит Install.cmd/README; старые
immutable releases сохранены. Перенос workers остаются
следующими отдельно согласованными этапами. Актуальная приёмка — CURRENT_STATUS.md.
