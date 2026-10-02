# Сверка задач — 2 октября 2026

Сверены 40 открытых на начало прохода issues, current source, датированные
release receipts и текущая установка. Эта таблица отделяет готовую основу
от конкретного остатка. Она не объявляет все большие trackers завершёнными.

На GitHub закрыты восемь: #10, #14, #166, #184, #202, #213, #220, #229.
#10/#14/#184 закрыты как отменённые/заменённые, остальные — по реализации
или завершённой диагностике. #185, #188, #173, #233 получили актуальный остаток.
Отдельный аппаратный QA удалён по прямому решению владельца.

Источники: [журнал установки](STATUS_HISTORY_2026-10-02.md),
[read isolation](GPT_READ_ISOLATION_2026-09-27.md),
[Results handoffs](RESULT_HANDOFFS_AND_GPT_RECOVERY_2026-09-27.md),
[Communication](COMMUNICATION_READING_2026-09-28.md),
[Server Workspaces](SERVER_WORKSPACES_2026-09-28.md),
[предыдущий аудит](ISSUE_AUDIT_2026-09-26.md). Исторические следующие этапы
из этих документов не заменяют [текущую очередь](CURRENT_STATUS.md).

| Issue | Текущее состояние / остаток |
| --- | --- |
| [#233](https://github.com/EriArk/codex-web-interface/issues/233) | Открыт узкий forensic-остаток: причина старого unknown не доказана. Текущий close/Enter исправлен bb4cc01 и проверен на SSH; не блокер обновления. |
| [#229](https://github.com/EriArk/codex-web-interface/issues/229) | Закрыт: persistent runtime установлен; обычные Hub updates сохраняют native работу. Чужие ПК и reboot самого Windows этим не покрываются. |
| [#228](https://github.com/EriArk/codex-web-interface/issues/228) | Открыт для обсуждения polish. Каталог экранов готов; новые визуальные изменения после обсуждения владельца. |
| [#220](https://github.com/EriArk/codex-web-interface/issues/220) | Закрыт: независимые read/media/write lanes и scoped mutation admission установлены, native capability проверена. Прочие сбои GPT остаются #185. |
| [#215](https://github.com/EriArk/codex-web-interface/issues/215) | Базовые Spaces и реальный двухпользовательский цикл уже есть. Остаток — конкретные UX edge cases; не повторять первое подключение. |
| [#213](https://github.com/EriArk/codex-web-interface/issues/213) | Закрыт: handoffs Work/Intake, immutable HTML sidecars/modules и copy reclamation установлены. |
| [#209](https://github.com/EriArk/codex-web-interface/issues/209) | Роли Work/Intake/Project GPT/Brainstorm GPT/Doctor существуют. Остаток — согласовать lifecycle tracker с фактическими ролями, без обязательного глобального AI helper. |
| [#207](https://github.com/EriArk/codex-web-interface/issues/207) | Optional CODEXWEB.md работает; обязательная публикация отменена. Полный Runtime Access manifest зависит от #170. |
| [#206](https://github.com/EriArk/codex-web-interface/issues/206) | Не входит в текущий выбранный проход; глобальный AI operator ранее отвергнут/отложен. Не блокирует обычные роли. |
| [#205](https://github.com/EriArk/codex-web-interface/issues/205) | Internal notifications и отдельные GPT ответы реализованы; GitHub attention перенесён в Activity. Старый unified Inbox не восстанавливать; полный архив GitHub не обещан. |
| [#204](https://github.com/EriArk/codex-web-interface/issues/204) | Snapshot → Project wizard → private Project GPT реализован. Остаток проверять по конкретной ошибке recipient flow, без отдельного обязательного hardware этапа. |
| [#203](https://github.com/EriArk/codex-web-interface/issues/203) | Room board/chat/drawing и voice есть. Собственный AudioWorklet relay не равен Fluxer parity; реальные audio/touch проблемы разбираются при использовании. |
| [#202](https://github.com/EriArk/codex-web-interface/issues/202) | Закрыт: DM/groups/files, membership, search, unread, presence и rename установлены (6b75d45/67afe15/e1c9d17). |
| [#198](https://github.com/EriArk/codex-web-interface/issues/198) | Provenance/sync/conflict choices реализованы. Полные изолированные test services/accounts зависят от активации #170. |
| [#197](https://github.com/EriArk/codex-web-interface/issues/197) | GitHub Issues/PR/reviews/CI и internal chat links реализованы. Старые зависимости #181/attention не являются отсутствующей базой; остаток полного coverage уточнять отдельно. |
| [#195](https://github.com/EriArk/codex-web-interface/issues/195) | Собственные working copies и права работают. Остаток — согласование owner-authoritative RO projection с текущими direct/integration permissions, не новая копия системы. |
| [#194](https://github.com/EriArk/codex-web-interface/issues/194) | Общий tracker. Реальный функциональный остаток главным образом #170/#198; Communication/Results не считать нереализованными. |
| [#189](https://github.com/EriArk/codex-web-interface/issues/189) | Composer/draft/cached history и независимые reads реализованы. Свежие loading/send сбои вести с точным воспроизведением в #185, не повторять старую архитектуру. |
| [#188](https://github.com/EriArk/codex-web-interface/issues/188) | Открыт: upstream canonical full GET. Hub cache/native delta IPC/body reuse уже установлены; поддерживаемый upstream delta пока не установлен. |
| [#185](https://github.com/EriArk/codex-web-interface/issues/185) | В e934ed1 исправлена сверка принятого сообщения после native parent replacement; adapter установлен, настоящий Altar job завершён без повторной отправки. Другие истории ещё упирались в NATIVE_RATE_LIMITED; tracker открыт. |
| [#184](https://github.com/EriArk/codex-web-interface/issues/184) | Закрыт как заменённый: владелец выбрал direct universal viewer вместо отдельной Preview-кнопки/inspector. |
| [#182](https://github.com/EriArk/codex-web-interface/issues/182) | Отложенное сравнение Remote providers; не входит в выбранный проход. |
| [#180](https://github.com/EriArk/codex-web-interface/issues/180) | Run and show реализован. Ремонт старой FileLaunch task доступен в установленном Companion 0.5.6; реальное UAC не подтверждено, прежняя задача сохранена. |
| [#179](https://github.com/EriArk/codex-web-interface/issues/179) | Частные причины jitter исправлены. Новая работа требует конкретного сценария; не превращать в бесконечный общий косметический этап. |
| [#178](https://github.com/EriArk/codex-web-interface/issues/178) | Защита больших сообщений и прежние исправления есть. Остаток — конкретная воспроизводимая регрессия больших ответов; не переписывать renderer без неё. |
| [#176](https://github.com/EriArk/codex-web-interface/issues/176) | CURRENT_STATUS сокращён до действующей очереди, журнал вынесен в архив, Roadmap исправлен. Большой архитектурный doc tracker не объявляется целиком закрытым. |
| [#173](https://github.com/EriArk/codex-web-interface/issues/173) | UI Companion 0.5.6 и подписанный feed установлены с явного разрешения владельца; Browser обновлён. FileLaunch ждёт UAC, persistent worker — idle admission. См. COMPANION_GPT_WORKSPACES_2026-10-02.md. |
| [#170](https://github.com/EriArk/codex-web-interface/issues/170) | Runtime/features уже активированы 28 сентября. Первый реальный create вернул 503/WORKSPACE_MISSING; исправлен acceptance scaffold, подготовлен sudo repair. Личное окружение и его Codex ещё не приняты. |
| [#167](https://github.com/EriArk/codex-web-interface/issues/167) | STEP/IGES/STL/OBJ/GLB/3MF/SVG и ограниченный DXF viewer реализованы. Не обещать полную CAD-метрологию; вопросы полноты DXF остаются предметом scope. |
| [#166](https://github.com/EriArk/codex-web-interface/issues/166) | Закрыт: native-host ограничение диагностировано; после отдельного разрешения владельца установлен независимый GUI MCP. Upstream pipe не объявлен исправленным. |
| [#159](https://github.com/EriArk/codex-web-interface/issues/159) | Исторический team foundation tracker перекрывается #194. Не повторять реализацию; недостающий server workspace явно #170. |
| [#158](https://github.com/EriArk/codex-web-interface/issues/158) | Offboarding/revocation/audit/paired backup реализованы. Не отключать реального участника ради повторного теста; точное соответствие всей старой спецификации остаётся сверкой. |
| [#157](https://github.com/EriArk/codex-web-interface/issues/157) | Authorship/revisions/assignments/Activity реализованы. Старые shared Plans/Reports нужно согласовывать с GitHub-first; Reports не возвращать. |
| [#155](https://github.com/EriArk/codex-web-interface/issues/155) | Историческая Bridge UI заменена Spaces; bounded relays остаются внутренним механизмом. Не возвращать старую навигацию. |
| [#152](https://github.com/EriArk/codex-web-interface/issues/152) | Owned-machine enrollment/Tailnet/approval реализованы. Недоступный друг — состояние устройства, не повод заново проектировать onboarding. |
| [#37](https://github.com/EriArk/codex-web-interface/issues/37) | Multimachine/Tailnet transport реализован. Offline друга не отменяет ранее подтверждённый двухпользовательский цикл. |
| [#14](https://github.com/EriArk/codex-web-interface/issues/14) | Закрыт как исторический tracker; действующая очередь находится в CURRENT_STATUS, прежние release proposals архивированы. |
| [#11](https://github.com/EriArk/codex-web-interface/issues/11) | Отдельный self-hosted Hub installer отложен; не путать с готовым Companion для подключения к существующему Hub. |
| [#10](https://github.com/EriArk/codex-web-interface/issues/10) | Закрыт как отменённый владельцем отдельный QA-этап. Ошибки устройств разбираются по мере использования; физическая приёмка не заявляется выполненной. |
| [#6](https://github.com/EriArk/codex-web-interface/issues/6) | Configured roots реализованы. Разрешённый legacy-owner режим с undefined roots сохраняется; это текущий scope, не новая недоделка безопасности. |
