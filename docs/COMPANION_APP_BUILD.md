# Companion: сборка и первый Windows UI

Этот пакет — окно/трей над существующими исполнителями. Он не заменяет broker,
Computer Use, Delivery или account/device pairing. Наличие local `deviceId` —
подпись маршрута, не разрешение Hub. В этой версии нет native writer, сетевого
listener, automatic send/replay, lifecycle recovery работников или auto-update.

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
ops/windows/Build-CompanionApp.ps1 -Dotnet dotnet -OutputDirectory D:\builds\companion-ui-0.2.0
dotnet run --project tests/companion-app/CompanionApp.Checks.csproj -c Release
```

Build требует locked restore и новую выходную папку. Manifest содержит version,
sourceRevision/sourceDirty и точные SHA-256 всех файлов. Для выпуска `sourceDirty`
должен быть false. Локальный hash manifest — проверка exact owner-reviewed
пакета; он **не заменяет** подписанный manifest будущего auto-updater.

## Отдельная установка UI

```powershell
ops/windows/Install-CompanionApp.ps1 -PackageDirectory D:\builds\companion-ui-0.2.0 `
  -HubOrigin https://your-hub.example -DeviceId your-device-id -Route 'LAN SSH'
```

Установка под текущим Windows SID: `%LOCALAPPDATA%\CodexWeb\companion-app`.
Сначала проверяется полный пакет, затем копируется immutable release. Pointer
`current.json` и стабильный `Start-CompanionApp.ps1` не зависят от desktop Codex.
Старые releases/pointers сохраняются. Повторная установка не перезаписывает
профиль; несовпадение SID и ссылки в путях отвергаются. Профиль не содержит
паролей, токенов или прав аккаунта. Пакет одинаковый для владельца и участников.

Автозапуск — только собственный `HKCU\...\Run\CodexWebCompanionApp`; ярлык —
меню «Пуск → CodexWeb → CodexWeb Companion». Никакая из девяти прежних Scheduled
Tasks не изменяется. При входе UI появляется в трее; запуск ярлыка поднимает
существующее окно. Второй UI не запускает второго работника. Current-user/session
named pipe принимает только `SHOW`, без shell/команд и без TCP.

## Доступное поведение

Обзор показывает public HTTPS health Hub, текущую Windows identity и уже выбранные
рабочие папки persistent Companion. Вход в Hub, users/invitations остаются в вебе:
кнопка открывает известный HTTPS origin, не заимствует cookie/пароль браузера.
Изменение origin сбрасывает местную подпись старого device/route.

«Компоненты» читает девять собственных Interactive tasks, проверяет файл task/module
и короткий passive PING broker/bridge. Computer Use отвечает только на `status`,
подтверждая ту же интерактивную сессию. Native runtime не создаётся и controller
не захватывается. Ready workers отображаются «Готов по запросу», не как ошибка.
Невозможность чтения остаётся «Неизвестно»; чужие задачи не дают readiness.

Проверка при открытии/возврате, вручную и раз в минуту объединяет параллельные
запросы. Новая identity generation не получает устаревший ответ. Slow tick не
отменяет предыдущий. Таймауты ограничены; после восстановления связи состояние
обновляется автоматически без отправки native-команд. При временной ошибке
проверки сохраняется предыдущий snapshot с его временем.

Крестик скрывает окно; «Выйти из интерфейса» завершает только UI. Четыре темы
используют semantic web palettes и один layout. Настройки сохраняют тему,
автозапуск и адрес Hub. «Сохранить отчёт» пишет локальный JSON без логов,
credentials, содержимого чатов и полного worker config; отмена сохраняет окно.

Первый native UI не означает завершения migration/auth/updater. Следующий этап —
scoped Hub device pairing, подтверждённые роли, preconfigured owner binding и
resumable настройка участника. Auto-update/recovery и перенос workers остаются
следующими отдельно согласованными этапами.
