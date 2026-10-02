# Companion, GPT и Server Workspaces — 2 октября 2026

Владелец вернулся домой и явно разрешил обновить Companion, затем продолжить GPT
и Server Workspaces. Прежний запрет установки вдали от ПК снят.

## Установлено

- Companion UI **0.5.6**, source `721c469`, signed release
  `0e39718e62b02e61fd671afa43175f6f497bbf978504459e7c79ce8f69c8ad88`.
  Реальный updater завершил committed в 13:49:09 UTC. Девять конфигураций до/после
  совпадают; установленный executable сообщает Hub ready. Native Codex сохранён.
- Browser **1.0.1**, release
  `cd7e07e52c4aaf5e5861a274de0939ee652748d83cb8f8f6b07feffff50e3aee`,
  соответствует комплекту 0.5.6; независимый MCP отвечает. Fluxer загрузился
  с прежним входом и историей. Профиль сохранён.
- Native ChatGPT adapter **26.928.31416-e934ed1**. Замена прошла native idle check,
  прежний container сохранён для rollback; app version и профиль не менялись.
  Hub/engine/web остаются `79b3185`.

## Конкретные исправления

`721c469`: кнопки Companion снова доступны после завершения maintenance;
устаревшее сообщение операции browser не перекрывает подтверждённый текущий release.
Проверены реальный UI dispatcher и четыре темы; подписанный пакет принят Windows verifier.

`e934ed1`: native graph может заменить временного родителя уже принятого сообщения.
Раньше это давало NATIVE_SUBMISSION_MISMATCH даже при точном UUID и содержимом.
Для persisted intent существующего чата допускается исчезнувший старый parent,
если новый parent принадлежит той же canonical ancestor chain. Существующий другой
parent, несовпадение UUID/содержимого/вложений и новый чат по-прежнему отклоняются.
Проверка перед отправкой остаётся строгой. 67 renderer/dispatch tests прошли в Linux.

Настоящий job «Алтарь Главный Разбор Кода» после обновления сверён через Hub:
HTTP 200, completed, ответ получен; исходная квитанция побайтно прежняя.
Сообщения не отправлялись повторно. При заключительной проверке Altar и «Изучение
репозитория CodexWeb» вернули свежую историю (38 и 24 сообщения). Yuri вернул 53
сообщения из cache; точная native проверка — NATIVE_RATE_LIMITED. Это не доказательство
его полного исправления. Старый Yuri receipt отсутствует в текущей ветке и не объявляется успешно
завершённым по чужому ответу.

`a388a00`: подтверждённый локальный idle receipt больше не блокирует обновление
адаптера. Реальная native генерация и queued/preparing/running остаются проверками
допуска. Шесть Linux tests покрывают idle, активную генерацию и rollback.

`d7df9be`: acceptance удаляет пустые вложенные .codex/.config/.cache/.local/bin,
созданные workspace-init. Раньше они оставляли home непустым после проверки.
Два Linux tests проверяют настоящий layout и сохранность файлов/ссылок.

## Остаток установки

- FileLaunch: реальное окно UAC не получило разрешения Windows; старый компонент
  сохранён. Нужна повторная кнопка ремонта и подтверждение на ПК.
- Persistent worker: новый комплект подготовлен, замена ждёт обычного idle lease.
  Активный worker не останавливался. Legacy CSC даёт разные бинарные хеши при
  неизменном исходном коде; это отдельная причина лишних обновлений компонентов.
- Server Workspaces: runtime/features уже включены 28 сентября, readiness accepted,
  broker и network active. Документация ошибочно предлагала повторную активацию.
  Один реальный первый create вернул 503, host status WORKSPACE_MISSING; intent
  сохранён как creating. Без проверки результата create не повторялся.
  Владелец выполнил scaffold repair (IMG_0813, 17:22): applied=true, ready=false.
  В слотах 0/1 удалены пустые home/.local/bin, home/.local, home/.config, home/.cache;
  home осталась. Слоты 2/3 пусты. IMG_0814 показал .codex/tmp/arg0/codex-arg0….
  В отдельном network-none read-only контейнере с Codex 0.158.0 воспроизведено:
  --version оставляет четыре launcher symlink и пустой .lock. Очистка проверяет
  имена/точный target, пустой обычный lock и получает exclusive nonblocking flock.
  Постороннее содержимое, другой target и занятый lock сохраняются. Пять Linux tests
  и отдельный проход с реальным --version подтвердили очистку и повторный запуск.
  Обновлённый скрипт размещён на сервере; его новый sudo --apply ещё не подтверждён.
  После диагностики и ремонта нужно reconcile creating intent штатным API и завершить создание.

Подготовленная команда в Devices → Сервер → Терминал:

```sh
sudo python3 /home/abysscloud/services/codex-web/workspace-slot-repair-20261002/ops/workspaces/repair-empty-slots.py --apply
```

Без `--apply` скрипт только печатает метаданные слотов. С `--apply` удаляет известные
пустые каталоги и точный незанятый launcher residue Codex 0.158.0. Проверяет mounted
paths, владельца, пустой registry и отсутствие контейнеров; не форматирует диски,
не меняет разрешения и сохраняет все прочие файлы/ссылки. SSH пользователя abysscloud
не имеет безпарольного sudo.

## Свидетельства

- Локально `.local/companion-056-install/`: installed inventory и скрипты точной сверки.
- Hub: `verification-companion-721c469`, `verification-e934ed1/native-tests.log`,
  `verification-e934ed1/codex-web-gpt-native-lab/installed.json`.
- Подготовленный host repair: `workspace-slot-repair-20261002` под service root.

Технические проверки не подменяют полный пользовательский цикл Server Workspaces
или проверку всех GPT-чатов после upstream cooldown. #198 не закрывается проверкой
host foundation: managed integration copy требует своего объёма работ.
