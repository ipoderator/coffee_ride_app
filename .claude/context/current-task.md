# Current task — CR-169: contact editing for a published ride (KI-081)

> Handoff for a fresh session. CR-168 is **done, committed and pushed**
> (`6983c7b`); this file was its task record and has been replaced by the next
> task's. CR-168's full story is in `docs/changelog.md` (last entry) — read it
> only if you need its context.

## Состояние на входе

- Ветка `main`, синхронна с `origin/main`, рабочее дерево чистое.
- Последний коммит: `6983c7b feat: CR-168 resend email verification`.
- `docs/tasks.md`: невыполненных пунктов **ноль** — бэклог MVP закрыт. Роль
  бэклога де-факто перешла к `.claude/context/known-issues.md` (10 открытых
  записей). Из них code-actionable только две: **KI-081** (эта задача) и
  KI-021 (уборка без влияния на пользователя). Остальные упираются во внешние
  факторы на стороне владельца: `EMAIL_FROM_ADDRESS` (KI-026/042),
  DNS/сеть до `unisender.ru` (KI-055) и 2GIS (KI-056), коммерческий ключ 2GIS
  (KI-075), реальный хост + DNS (KI-045).
- Владелец выбрал KI-081 следующей задачей.

## Goal

У опубликованного заезда организатор не может исправить свой контакт из
приложения. Дать ему контрол — не ослабляя read-only правило формы.

## Контекст задачи (проверено в коде, не по памяти)

**Бэкенд уже готов, доделывать там нечего.**

- `PUT /v1/rides/:id/contact` (`apps/api/src/modules/rides/rides.routes.ts:476`)
  принимает изменение **в любом статусе** — намеренно, CR-165: протухший после
  публикации контакт (сменился номер, удалён аккаунт) обязан оставаться
  исправимым. `PATCH` остался draft-only.
- `setRideContact` (`rides.service.ts:1315`): owner-only через
  `resolveOwnOrganizerProfileId`, 404 и для чужого, и для несуществующего
  заезда (не раскрывать разницу), пишет `updatedBy`/`updatedAt`.
- Тесты эндпоинта: `apps/api/src/modules/rides/ride-contact.routes.test.ts`
  (24 случая, включая авторизацию без `OrganizerProfile`).

**Чего нет — только UI.** `EditRideForm` после `draft` рендерит всю форму
read-only (`RIDE_EDIT_TERMS.notEditable`), и контактные поля выключены вместе
со всеми: `apps/web/.../components/EditRideForm.tsx:808` —
`disabled={isPending || !isDraft}`. Там же в коде лежит комментарий, прямо
указывающий на это решение: «the UI for it belongs with the published-ride
controls, not in this deliberately read-only form».

## Прецедент, по которому делать (важно — не изобретать свой)

**CR-162 / KI-065**, `docs/changelog.md` строка ~2328. Там решена ровно та же
задача «поле должно оставаться редактируемым после публикации»:

- чекбокс `participantsVisible` **остался в той же форме**, не переехал на
  отдельный экран;
- после публикации он **не выключен**, а сохраняется немедленно по изменению
  отдельным запросом (`handleParticipantsVisibleChange`,
  `EditRideForm.tsx:425`), в обход общего draft-only submit;
- у него свой hint для опубликованного состояния
  (`RIDE_EDIT_TERMS.participantsVisibleHintPublished`) — см.
  `EditRideForm.tsx:777-795`, это буквальный шаблон для контактов;
- отдельное состояние загрузки (`isSavingVisibility`), чтобы не путать с
  общим `isPending`.

Формулировка «Next action» в KI-081 говорит то же самое: вынести контрол на
поверхность опубликованного заезда рядом с переключателем видимости
участников, **а не ослаблять read-only правило формы**.

## Requirements

1. В `EditRideForm` контактные поля (`RideContactFields`) остаются
   редактируемыми после публикации и сохраняются собственным запросом
   `PUT /v1/rides/:id/contact`, не общим submit.
2. Draft-путь не меняется: в черновике контакт по-прежнему уходит общим
   `PATCH`, как сейчас (иначе получится два пути сохранения одного поля в
   одном состоянии).
3. Свой hint/успех/ошибка для опубликованного состояния в
   `packages/ui/src/terminology.ts` (`RIDE_EDIT_TERMS`), без хардкода строк в
   компоненте (`.claude/rules/frontend.md`).
4. Отдельное состояние сохранения, по образцу `isSavingVisibility`.
5. Защита от двойной отправки; серверные ошибки показываются, а не глотаются.

## Acceptance criteria

- Организатор опубликованного заезда меняет контакт из приложения; после
  перезагрузки изменение на месте.
- Остальная форма у опубликованного заезда остаётся read-only — правило не
  ослаблено, `RIDE_EDIT_TERMS.notEditable` по-прежнему показывается.
- Черновик ведёт себя как раньше (регрессия на `rides.test.tsx`).
- Чужой заезд → 404 (уже покрыто на бэкенде; на фронте не должно появиться
  пути, который это обходит).
- typecheck + lint + relevant tests + Storybook (stories для изменённого
  состояния `RideContactFields` — у него уже есть
  `apps/web/src/stories/RideContactFields.stories.tsx`, дополнить, а не
  создавать новый файл).
- `pnpm coverage:check` не ниже baseline.

## Planned files

- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`
- `apps/web/src/features/organizer/rides/api.ts` (клиент для `PUT .../contact`
  — проверить, нет ли уже)
- `packages/ui/src/terminology.ts` (`RIDE_EDIT_TERMS`)
- `apps/web/src/features/organizer/rides/rides.test.tsx`
- `apps/web/src/stories/RideContactFields.stories.tsx`
- `.claude/context/known-issues.md` (закрыть KI-081 → перенести в
  `known-issues-archive.md` по правилу самого файла)
- `docs/changelog.md`, `docs/tasks.md`, `.claude/context/project-state.md`

## Implementation progress

- [ ] Клиент + состояние сохранения в `EditRideForm`
- [ ] Терминология
- [ ] Тесты (draft-регрессия + published-путь)
- [ ] Stories
- [ ] Валидация
- [ ] Docs/context, закрытие KI-081

## Validation results

(ещё не начато)

## Discovered issues

(пока нет)

## Final result

(пока нет)

---

## Операционные заметки для новой сессии (стоили времени в прошлой)

**Покрытие.** `pnpm coverage:check` без живых сервисов даёт **ложное** падение
(~4 пп в `modules/notifications`) — три live-сьюта пропускают сами себя.
Правильный запуск:

```bash
set -a && source .env && set +a
export REDIS_URL="redis://:redis-dev-only@127.0.0.1:6379"
export RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1
unset NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY
pnpm test:coverage && pnpm coverage:check
```

Два подвоха: в `.env` строка `REDIS_URL` закомментирована, а локальный Redis
поднят с `--requirepass redis-dev-only` (`docker-compose.yml`), поэтому
беспарольный URL из CI даёт `NOAUTH` и валит 3 теста. С полным стеком
`apps/api` — 546 passed / 0 skipped.

**Тестовая БД.** `apps/api` читает `TEST_DATABASE_URL`, не `DATABASE_URL`, и
нужен `127.0.0.1`, а не `localhost` (KI-049). Дев-сервер при этом работает с
`coffee_ride_dev` — это разные базы, не искать данные теста не в той.

**Storybook.** Правило владельца: любое изменение во фронтенде проверяется в
Storybook (:6006), у каждого используемого элемента должна быть story. Гонять
через MCP-инструмент `test-run`, не через npm-скрипты; axe стоит на
`test: 'error'`.

**Язык.** Весь текст для владельца — на русском, включая итоговые сводки и
короткие статусы между вызовами инструментов. Код, имена файлов, коммиты и
содержимое репозитория — по-английски, как есть.

**Формат ответа в конце прогона** (`.claude/CLAUDE.md`): ровно три секции —
`## Needs my input`, `## Changed`, `## Found`.
