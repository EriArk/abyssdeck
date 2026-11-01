# Надёжное обновление локального Codex

## Запуск

### Compatibility gate (2026-11-01)

Before creating an activation intent or draining the existing worker, Queue now
launches the candidate with the actual owner profile for read-only initialization,
account/read (no token refresh), model/list and one harmless executor command.
It creates no thread/turn and never sends a chat message. The preserved Hub owner
binding is checked by the installed engine's account matcher over the existing
private SSH connection. Account data stays in pipes/memory; the receipt contains
only version, model count, time and success. An old engine without this gate or
an incompatible candidate fails before activation; the selected runtime stays live.

Account identity excludes documented mutable presentation fields (planType and
workspaceName). Unknown fields and actual person/provider changes still fail
closed. An older metadata-bearing hash migrates only after an exact match against
the observed old representation. We never clear the stored identity to fix an update.

If account validation rejects a newly created maintenance runtime, Hub requests
capability-bound idle-close before detaching. The broker refuses this with active
turns, pending questions or calls. Confirmed closure permits the coordinator's
existing childless rollback; activity/uncertainty still prevents it. Ordinary
reconnection never closes a runtime on identity mismatch. Maintenance diagnostics
retain the nested native error code instead of just HTTP 409.

This addresses the 0.166 incident: isolated unauthenticated protocol tests passed,
but account/read added workspaceName and the old fingerprint treated it as an
identity change. The running idle child then prevented rollback. Preflight must
exercise the real account contract, not just package layout or anonymous probes.

Для владельца существующего Windows Companion и его приватного SSH-подключения
к Hub:

```powershell
& .\ops\windows\Queue-CodexRuntimeUpdate.ps1 `
  -Version 0.166.0 -HubSshTarget books-server -MachineId main-windows
```

Команда проверяет полный официальный пакет, сохраняет предыдущую и будущую
конфигурации, закрепляет SID пользователя, исходный аккаунт-владелец Hub,
идентификатор устройства, задачу Companion, пути и хеши. Новая конфигурация
меняет только `codexCommand`; рабочие каталоги и прочие настройки сохраняются.
Она регистрирует **Limited / Interactive** задачу `CodexWebRuntimeUpdate`.
Вызов не останавливает Codex и сам не получает блокировку Hub.

Это отдельная задача обслуживания CLI, не перенос Companion, не обновление
Store-приложения и не новая установка глобального Codex в PATH. UI мастера
Companion пока не подключён к этой команде. Установка рассчитана на владельца
Hub с уже настроенным административным SSH-маршрутом, не на аккаунты гостей.

## Независимость и восстановление

Планировщик запускает координатор вне дерева процессов/Windows Job native Codex.
Проверка предков отвергает ручной запуск координатора из Codex/Companion до
обращения к maintenance. Исходная ошибка отложенного `Start-Process` поэтому не
повторяется: остановка native runtime не должна убить координатор обновления.

Задание запускается раз в минуту и при входе владельца в Windows, без повышения
прав. `IgnoreNew` и отдельная файловая блокировка исключают конкурирующие запуски.
Один проход ограничен тремя минутами; после прерывания следующий проход читает
сохранённое состояние и сверяет фактические эффекты. Работа при полном выходе
пользователя не заявляется: Interactive-задача продолжит при следующем входе,
как и его Companion. Перезагрузка ПК ради проверки не выполнялась.

Журнал расположен в:

`%LOCALAPPDATA%\CodexWeb\companion-persistent\updates\coordinator`

- `active.json`: точная операция и версия кода координатора.
- `operations/<id>/plan.json`, `seal.json`: привязки и хеши.
- `previous.json`, `candidate.json`: снимки конфигурации операции.
- `state.json`: стадия, время, последняя ошибка, результат и состояние очистки.
- `host.json`: подтверждение независимого запуска и цепочка родителей.
- `launcher-error.json`: ошибка самого запуска, если он не дошёл до координатора.

`launcher-error.json` может относиться к предыдущему запуску: сопоставляйте его
время с `host.json`, состоянием задания и журналом операции.

Координатор записывает намерение **до** внешнего действия, а JSON-журнал заменяет
атомарно с flush. Потерянное подтверждение не равно невыполненной операции.
Повторный проход использует тот же operation ID, читает серверную блокировку,
точные хеши конфигурации, состояние задачи и реальные процессы.

## Порядок переключения

1. Проверить подготовленный пакет и неизменность конфигурации/задачи.
2. Получить штатный `workerMaintenance/acquire`. Пока Hub видит активную или
   неопределённую работу, остаётся `waitingIdle`; работа чатов не блокируется.
3. После `drained` убедиться в отсутствии дочернего native процесса и остановить
   только точную задачу брокера. Атомарно выбрать подготовленную конфигурацию.
4. Запустить ту же задачу брокера; подтвердить её pipe readiness.
5. Выполнить `release`: Hub проверит сохранённую привязку аккаунта. Затем проверить
   точный путь native дочернего процесса и обновить receipt установленного worker.
6. Только после доказанной активации выполнять retention.

При отсутствии простоя четыре часа отменяется лишь ещё не начатое обновление.
После возможного/подтверждённого `acquire` таймер не снимает серверную защиту.
Если запуск новой версии не подтверждается две минуты и у брокера нет native
детей, координатор возвращает прежнюю конфигурацию и проверяет её через тот же
Hub release. Сбой сети или потеря ответа release не разрешают остановку уже
запущенной новой версии: следующий проход сначала читает серверный результат.

Изменившийся аккаунт, посторонние изменения конфигурации/задачи, неожиданные
дочерние процессы и потеря привязки не обходятся принудительно. Они сохраняются
в журнале для проверки. При конфликте конфигурации координатор не затирает
изменения. Это сознательная граница автоматического восстановления, а не
обещание снять любую блокировку независимо от её причины.

Ни одна стадия не отправляет сообщения, не возобновляет чат, не подтверждает
вопросы модели и не перезапускает Hub, GPT, браузер или Computer Use.

## Хранение версий

Полные пакеты остаются в одном `companion-persistent/runtime/<version>`.
Повторная подготовка версии переиспользует проверенный пакет. После успешной
активации удерживаются три последних активированных управляемых пакета, а также
текущая/предыдущая версия операции и пакеты, занятые процессами. Хеш-каталоги
старых установщиков без activation receipt не удаляются автоматически.
Очистка не меняет результат здорового обновления; при ошибке она повторяется
отдельно и не блокирует чаты. Исходный пакет остаётся неизменяемым: activation
receipts хранятся рядом с журналами координатора, не внутри runtime.

## Проверки 13 октября

- 17 focused tests: staging/integrity, Hub maintenance и автомат состояний
  координатора. В модели сбоев проверена потеря процесса после каждой записи
  журнала и каждого внешнего эффекта, включая потерянный ответ release.
- Проверены ожидание занятого native, истечение до acquire, потеря связи,
  восстановление после drain, посторонняя правка config, несовпадение аккаунта,
  откат при неудачном старте и ошибка retention.
- Настоящая disposable-задача Windows завершилась после выхода команды запуска;
  её предки: PowerShell → svchost → services → wininit, без Codex.
- Установленная `CodexWebRuntimeUpdate` также подтвердила независимую цепочку и
  завершила проход с `waitingIdle`, без блокировки текущего чата.

Это не доказательство физической перезагрузки ПК или завершённого переключения
CLI. Фактическое `completed` проверяется отдельно по журналу, Hub и процессу.
