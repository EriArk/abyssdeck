# Companion: текущая установка и сохранение работы владельца

Аудит 30 сентября 2026 через локальную Windows-инвентаризацию и приватный Hub SSH.
Это наблюдение на эту дату, не постоянные версии или PID. Последующий первый
UI/трей описан в [руководстве сборки](COMPANION_APP_BUILD.md); он устанавливается
отдельно от workers и не меняет прежние Scheduled Tasks/config/accounts.

## Установлено и подтверждено

| Часть | Evidence |
| --- | --- |
| Hub engine/gateway/web | После аудита обновлён до `95fd0b5`, schema 30, healthy; активация 15:19:14 UTC |
| Web identity | `37c2fbdd672001267f78a6680b87fb57fa521a7d4ea7e3aa1ff9b86088b011ad` |
| Persistent CLI | **0.159.2**, config → `companion-persistent/runtime/c6fe824d725f02d7/codex.exe` |
| Каталог моделей | `gpt-6.1-sol` подтверждена Hub → SSH → installed Companion, аккаунт совпал |
| CLI activation receipt | `verification-e7e0be8/runtime-activation.json`: `installed`, 13:18:48 UTC |
| Owner device | `main-windows`, прямой LAN SSH; private Devices Hub: `hub-host` |
| Companion UI | **0.2.0**, установлен 16:30 UTC; self-contained win-x64, source `24c20ce`, immutable manifest `fdd9fb689a83d0326affd7b7a28b7a7da38f7a5927e448d47e7f600aecc5bd72` |
| ОС | Windows 10 Home 22H2, build 19045, x64 |
| .NET | SDK нет; runtimes 8.0.28/9.0.7 есть. Новый пользовательский пакет автономный |
| Persistent roots | `D:\Projects\CodexWeb` в текущем config; не расширять молча |
| CUA host | Immutable runtime `4e5c5dc0189f2089afdbfd173b72f726459f59919df1e9c292dc9ab5477865eb` |

Hub receipt также подтверждает сохранение прежнего CLI runtime. Ожидание его
активации из предыдущего захода **завершилось**; повторная установка не нужна.
Обновление Hub `95fd0b5` исправило передачу ответов на вопросы; оно не ставило
новый Companion. Текущий native ход сохранился при обновлении, persistent PID
8248 запущен в 14:55:17 UTC и продолжил работу после активации Hub в 15:19 UTC.
Корневой `codex.command` Hub ещё содержит старый fallback 0.153.4, в отличие от
активного persistent launcher. Это конкретный остаток для общего updater;
в аудитном заходе live config не менялся.

Первый UI теперь установлен отдельно и преднастроен: Hub origin, `main-windows`,
LAN SSH, тема и собственный автозапуск. Проверка installed exe показывает Hub
на связи и 9/9 компонентов. Task XML SHA-256 и оба worker config SHA-256 совпадают
с сохранённым baseline; native PID 8248/14:55:17 UTC не менялся. Закрытие окна,
повторное открытие того же UI процесса, выход из UI и повторная установка
с сохранением профиля проверены. Работники и их receipts не переносились.
Локальные evidence находятся в `.local/companion-build`; исходники и build/installer
в `main`. Перезагрузка Windows и обычное использование меню трея владельцем
ещё не являются принятой приёмкой; не перезагружать ПК ради неё во время работы.

## Девять задач текущего ПК

| Scheduled Task | Наблюдённое состояние | Особенность |
| --- | --- | --- |
| CodexWebCompanion | Running | Legacy bridge, сохранить клиентов и pipe |
| CodexWebCompanionPersistent | Running | Владеет native runtime, не перезапускать при установке UI |
| CodexWebComputerUse | Running | Отдельный Limited/Interactive GUI host |
| CodexWebDelivery | Ready | Существующие mailbox/receipts |
| CodexWebDesktopRestart | Ready | Existing Highest/Interactive exception |
| CodexWebFileLaunch | Ready | Источник/receipts неизменны |
| CodexWebGitHubReleases | Ready | Собственный GitHub account |
| CodexWebGuiPreview | Ready | Optional preview |
| CodexWebProjectSetup | Ready | Собственные каталоги/receipts |

Все зарегистрированы для владельца EriArk, Interactive. Кроме desktop-restart,
уровень Limited. Legacy/persistent конфигурации раздельны; не объединять их по
одинаковому имени бинарника. Запущенные App Server/code-mode-host и GUI-клиенты
могут использовать разные immutable releases одновременно.

## Найденные причины неудобства

- Setup/status рассыпаны по задачам и скриптам; существующий connection doctor
  не описывает целиком persistent/CUA и все workers.
- Enrollment участника пока ставит legacy bridge; сведения о готовности и
  версиях необходимо выровнять с persistent runtime.
- Часть member Tailscale-подсказок содержит конкретные identity друга/сети.
  Универсальное приложение должно брать их из выбранного enrollment.
- Config broker читается при запуске. Показ нового пути/версии без idle activation
  не обновляет работающий процесс.
- Поиск desktop CLI по свежести файла недостаточен; нужен полный bundle и
  проверенный native контракт, а затем согласование Hub fallback.
- Современного scoped входа Companion по Hub account пока нет; наличие веб-роли
  или enrollment report не даёт постоянного native device credential.

Это конкретные задачи реализации [универсального приложения](COMPANION_APP.md),
а не основания заново переустанавливать работающий текущий ПК.

## Переход в два шага

Сначала окно/трей только читает существующие конфигурации под exact Windows SID
и machine identity. Готовая owner-конфигурация включает нынешний Hub/машину,
маршрут и каталоги. Новое окно не захватывает controller, не меняет tasks/keys
и не начинает новый native-ход. Его закрытие/падение не меняет App Server PID.

Затем подготовленный release получает авторизованную owner-device привязку.
Private backup сохраняет task XML, configs, runtime pointers, хеши workers и
реестры receipts. Native credentials, проекты и приватные ключи не попадают в
дистрибутив или Git. Установка сохраняет Windows профиль и existing SSH identity.

Перед переносом исполнителей закрывается admission и проверяется полный простой
с выбранной lease. Только после этого переключаются проверенные pointers/task
definitions. Старые workers не остаются вторыми активными writers. Новый путь
проверяется через установленный Hub/SSH; admission открывается после успеха.
Откат возвращает точные сохранённые задачи/config/pointers до возобновления
приёма, не откатывая новые пользовательские данные.

Owner direct LAN не требует member enrollment/Tailscale или новой пары SSH.
Другой Windows account не получает owner конфигурацию. GUI task обновляется
отдельно от основного broker. Если состояние работы неизвестно, переход ждёт.

## Критерии законченного перехода

| Проверка | Ожидаемый результат |
| --- | --- |
| Установка/закрытие/перезапуск UI при текущей работе | Native процесс и source/turn identity сохранены |
| Открытие нового окна владельцем | Hub/ПК/roots уже выбраны; собственные аккаунты/проекты сохранены |
| Работающий ход при доступной версии | Обновление ждёт; форсирование по умолчанию отсутствует |
| Desktop CLI переехал после обновления | Полный кандидат проверен, immutable копия и metadata согласованы |
| Обрыв чтения и восстановление сети | Здоровье обновилось, ни одна отправка/команда не воспроизвелась |
| Повреждённый пакет/неверный аккаунт/протокол | До admission откат/отказ; прежний рабочий комплект сохранён |
| Выход/приостановка | Новая работа запрещена, принятая не прервана |
| Другой пользователь | Только свои identity/device/аккаунты, без owner state |
| ПК друга | Собственная реальная установка и вход, не fixture на owner PC |

На 30 сентября: аудит и проект подготовлены; первый native UI/трей реализован и
прошёл compatibility spike на текущем ПК. Свидетельства его отдельной установки
фиксируются в CURRENT_STATUS. Pairing, lifecycle/updater, перенос исполнителей
и установка на ПК друга ещё впереди. Проверки нынешнего Computer Use/CLI
не являются приёмкой этих будущих возможностей.

Владелец отдельно разрешил удалённое обновление зарегистрированного ПК друга
и проверку на нём с сохранением существующих личных входов. 30 сентября Hub
нашёл approved подключение `flores` (`Fima`), но exact member SSH не отвечает;
Tailnet Hub онлайн, Windows peer офлайн, последнее присутствие 28 сентября
09:54:17 UTC. На ПК ничего не установлено/изменено. При следующем доступе сначала
снять его собственный baseline, а перенос работников допускать только при
проверенном простое и с rollback. Общий пакет UI и будущий wizard не содержат
private identity/credentials владельца. Недоступность друга не блокирует разработку
следующего согласованного этапа или меняет прямой LAN-маршрут владельца.
