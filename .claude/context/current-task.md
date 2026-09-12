# Current Task

## Status
done

## Task ID
CR-067..CR-074 (pre-foundation hardening — необратимые решения до CR-001)

## Goal
Закрыть недочёты, которые дёшевы сейчас и дороги после появления кода: версии
инструментария, окружение turbo, контракт REST API (версионирование, пагинация,
формат ошибок), часовые пояса в модели данных, разделение ключей 2GIS, привязка
портов локальной инфраструктуры к loopback.

Отложенное (Dockerfile, деплой, бэкапы, мониторинг, Redis auth/persistence, e2e и
MinIO в CI) оформляется задачами, а не реализуется сейчас — см. `docs/tasks.md`
раздел Deployment.

## Requirements
1. Node 24 LTS, точная версия в `packageManager`, `env`/`globalEnv` в `turbo.json`.
2. `/v1` + пагинация в `docs/api.md`.
3. Единый формат ошибок (ADR).
4. Часовые пояса: `timestamptz` как правило модели.
5. Сессии + топология доменов web/api — требует решения пользователя.
6. Два ключа 2GIS: публичный MapGL + серверный Geocoder/Directions.
7. Валидация env через Zod — задача внутри CR-003 (нет `apps/api`).
8. Порты compose на 127.0.0.1.

## Acceptance criteria
- конфиги согласованы между собой (`.nvmrc` / `engines` / CI / `packageManager`);
- контракт в `docs/api.md` содержит версию, пагинацию и формат ошибок;
- решения записаны в `docs/decisions.md` (append-only);
- `docs/tasks.md`, `project-state.md`, `known-issues.md`, `docs/changelog.md` обновлены;
- YAML/JSON валидны; `git diff` просмотрен.

## Planned files
`.nvmrc`, `package.json`, `turbo.json`, `.github/workflows/ci.yml`,
`docker-compose.yml`, `.env.example`, `docs/api.md`, `docs/database.md`,
`.claude/rules/database.md`, `docs/decisions.md`, `docs/tasks.md`,
`.claude/context/{project-state,known-issues}.md`, `docs/changelog.md`.

## Implementation progress
- [x] 1 версии инструментария — Node 24 LTS, pnpm@10.34.5, CI (права токена + корневой линт)
- [x] 8 порты compose → 127.0.0.1 + комментарий, почему расширять нельзя
- [x] 6 ключи 2GIS разделены: NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY / MAPS_2GIS_API_KEY
- [x] 2 версионирование + пагинация — ADR-011, docs/api.md переписан
- [x] 3 формат ошибок — RFC 9457, ADR-011, rules/backend.md
- [x] 4 часовые пояса — ADR-012, docs/database.md, rules/database.md
- [x] 5 сессии/домены — ADR-013 (сессии в БД + один origin); ADR-006 получил указатель
- [x] 7 оформлено задачей CR-073 (реализуется внутри CR-003)
- [x] контекст, changelog, tasks.md, known-issues.md обновлены
- [x] устранён дрейф: README, rules/auth.md, rules/security.md

## Validation
- [x] JSON: package.json, turbo.json — валидны
- [x] YAML: docker-compose.yml, ci.yml, dependabot.yml — валидны
- [x] согласованность: не осталось упоминаний Node 20, pnpm@10, старого ключа 2GIS,
      нерешённого session store, эндпоинтов без /v1 (кроме исторических записей
      changelog/ADR-006, которые append-only и трогать нельзя)
- [x] git diff просмотрен
- [n/a] тесты/типы/сборка — нет ни одного workspace-пакета (CR-001)
- [!] prettier --check падает на 37 файлах, но так же падает и на исходном коммите —
      существовавшая проблема, вынесена в CR-087/KI-011, намеренно не смешана с этой задачей

## Discovered issues
См. отчёт аудита: 23 пункта, из них 8 реализуются сейчас, остальные — в бэклог.

## Final result
Выполнено. 8 из 8 пунктов закрыты (пункт 7 — как задача, требует apps/api).
Принято три ADR: 011 (контракт API), 012 (время), 013 (сессии + топология).
Отложенное оформлено задачами CR-074..CR-086 (Deployment, Contract & model follow-ups)
и CR-087 (форматирование). Следующая задача — CR-001.
