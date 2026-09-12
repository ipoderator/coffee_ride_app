# Current Task

## Status

done

## Task ID

CR-087 — прогон Prettier по всему репозиторию

## Goal

Закрыть KI-011: репозиторий никогда не соответствовал собственному `.prettierrc`,
из-за чего шаг Format check в CI падает независимо от содержания правок. Исправить
одним изолированным форматирующим коммитом (`.claude/rules/git.md`: не смешивать
с содержательными изменениями).

## Requirements

1. `prettier --write .` по всему репозиторию.
2. Никаких изменений содержания/поведения — проверить `git diff -w` и вручную.
3. `prettier --check .` проходит после правки.
4. Обновить `docs/tasks.md`, `known-issues.md`, `project-state.md`, `docs/changelog.md`.

## Acceptance criteria

- `prettier --check .` не находит проблем;
- diff не содержит смысловых изменений (проверено `git diff -w` + точечный обзор
  YAML/markdown файлов с наибольшим диффом);
- CR-087 отмечена выполненной в `docs/tasks.md`;
- KI-011 помечена решённой в `known-issues.md`;
- добавлена запись в changelog;
- git diff просмотрен перед коммитом.

## Planned files

Все 37 файлов, на которых `prettier --check .` изначально падал (markdown под
`.claude/`, `docs/`; `docker-compose.yml`; `.github/dependabot.yml`), плюс файлы
контекста/changelog/tasks выше.

## Implementation progress

- [x] запущен `npx prettier@3 --write .` (локального `node_modules`/pnpm install
      ещё нет — ожидаемо, CR-001 не выполнена)
- [x] `prettier --check .` теперь чист
- [x] проверен diff: межстрочные отступы в markdown, `*emphasis*` → `_emphasis_`,
      кавычки в YAML `"..."` → `'...'` (семантически идентично)
- [x] `docs/tasks.md` — CR-087 отмечена
- [x] `known-issues.md` — KI-011 помечена решённой
- [x] `docs/changelog.md` — добавлена запись
- [x] `project-state.md` — обновлён

## Validation

- [x] `prettier --check .` — проходит (было 37 падающих файлов)
- [x] `git diff -w` просмотрен — остались только вставки пустых строк и смена
      стиля кавычек, никаких изменений формулировок/значений
- [n/a] тесты/типы/линт/сборка — нет ни одного workspace-пакета (CR-001)

## Discovered issues

Новых не обнаружено.

## Final result

Выполнено. Репозиторий соответствует `.prettierrc`; KI-011 закрыта. Следующая
задача по `docs/tasks.md`: CR-001 (Initialize pnpm/Turborepo monorepo) — CR-073
(Zod env validation) остаётся отложенной, реализуется внутри CR-003.
