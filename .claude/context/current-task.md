# Current Task

## Status

done

## Task ID

CR-064 — Russian formatters + UI terminology mapping

## Goal

`docs/design.md` §14 names CR-063/CR-064 as hard prerequisites for CR-011 (User
registration) — the first real screen. CR-063 (design tokens) is done. CR-064 puts the
Russian number/unit formatters (§7) and the Russian UI terminology mapping (§13) into
`packages/ui` as one shared, unit-tested module, so every future screen formats numbers
and status/type labels the same way instead of re-deriving Russian formatting rules per
component.

## Requirements

- Lives in `packages/ui` (confirmed by `project-state.md`/`architecture-map.md`/
  `docs/decisions.md` ADR-012, all already naming CR-064's output as `packages/ui`'s
  next real content after tokens), unit-tested with Vitest — `packages/ui` had no test
  script; this task added one (mirrors `packages/maps-2gis`'s Vitest setup, `node`
  environment — no DOM needed for pure formatting logic).
- Formatters (§7), value+unit always joined by NBSP, decimal separator is a comma,
  thousands separator is NBSP:
  - distance: 1 decimal — `42,3 км`
  - elevation: whole meters, NBSP-grouped — `1 250 м`
  - speed/pace: 1 decimal — `24,5 км/ч`
  - duration: `< 1h` → minutes (`45 мин`); `>= 1h` → hours + minutes (`2 ч 30 мин`)
  - date: day + genitive month, year only if not the reference year — `12 мая`,
    `12 мая 2027`
  - time: 24-hour — `07:30`
  - price: whole rubles, NBSP-grouped — `1 500 ₽`; zero/free = `Бесплатно`
  - participants: `12 из 20`
  - missing/`null`/`undefined` numeric input renders as `—` (em dash), never `0`
    (`.claude/rules/frontend.md` §Metrics / `docs/design.md` §6) — a formatter-level
    concern so every future consumer (CR-065's `MetricTile`, etc.) gets it for free
    instead of re-implementing the check.
- Terminology (§13), one lookup per domain enum, tone included for status:
  - ride status (7 values, matches `docs/product.md`'s lifecycle enum keys exactly:
    `draft`/`published`/`registration_open`/`registration_closed`/`started`/`finished`/
    `cancelled`) with tone (`neutral`/`success`/`warning`/`info`/`danger`)
  - bicycle type (`road`/`gravel`/`mtb`/`any`)
  - services (10 values) — **no DB enum exists yet** (`packages/db` has zero domain
    tables); `docs/product.md` §Services only gives free-text English names, not enum
    keys. Provisional snake_case keys minted here; recorded as KI-021 since whichever CR
    defines the real `RideService` DB enum must match these keys or this map needs
    updating.
  - registration action/state labels (`Зарегистрироваться` / `Отменить регистрацию` /
    `В списке ожидания` / `Мест не осталось`) — same provisional-key caveat, no
    `Registration` status enum exists yet either.
- Out of scope for this task (not started): §6's `MetricTile`/`DifficultyScale`
  components (CR-065), difficulty-scale words (also CR-065/§6, not §13), the
  ride-start timezone-hint _decoration_ mentioned in §7 (needs a viewer-timezone source
  and a place name that don't exist as data yet — deferred to whichever CR first
  renders a ride's start time, e.g. CR-011/CR-026). Basic 24h time formatting against an
  explicit IANA zone _is_ in scope (§7's Time row; low-risk, fully testable) — done.

## Acceptance criteria

- `packages/ui` exports formatters + terminology maps from its package entry point —
  met (`export * from './format'`/`'./terminology'` in `src/index.ts`).
- Every formatter has unit tests covering the documented example plus a missing-value
  (`—`) case where applicable — met, 31 tests total.
- Ride status / bicycle type keys match `docs/product.md` exactly — met, verified by a
  dedicated "exactly these seven keys" test.
- Services/registration provisional keys documented as provisional in-code and recorded
  in `known-issues.md` — met (KI-021).
- `packages/ui` gets a real `test` script wired into `turbo test` — met.
- `turbo run lint typecheck build test --force` green — met, 25/25.
- `docs/tasks.md`, `docs/changelog.md`, `project-state.md` updated — met. CR-065 named
  as next.

## Planned files

- `packages/ui/src/format.ts` (new) — the formatter module
- `packages/ui/src/format.test.ts` (new)
- `packages/ui/src/terminology.ts` (new) — the terminology maps
- `packages/ui/src/terminology.test.ts` (new)
- `packages/ui/src/index.ts` — re-export both modules
- `packages/ui/package.json` — `test` script, `vitest`/`vite`/`config` devDependencies
- `packages/ui/vitest.config.ts` (new)
- `pnpm-lock.yaml`, `.claude/context/{current-task,project-state,known-issues,
architecture-map}.md`, `docs/{changelog,tasks}.md`

## Implementation progress

- [x] Read `docs/design.md` §6/§7/§13/§14, `docs/product.md` (lifecycle, services,
      bicycle type), `docs/decisions.md` ADR-012, `.claude/rules/frontend.md`
- [x] Confirmed target package (`packages/ui`) from `project-state.md`/
      `architecture-map.md`/ADR-012 cross-references
- [x] Wrote `format.ts` (distance/elevation/speed/duration/date/time/price/participants,
      NBSP joining/grouping, comma decimals, em-dash missing-value handling) + tests
- [x] Wrote `terminology.ts` (ride status+tone, bicycle type, services, registration
      labels) + tests
- [x] Wired `packages/ui`'s Vitest (`node` environment via `config/vitest/node-library`,
      same fragment as `packages/maps-2gis`) + `package.json` `test` script/deps
- [x] `pnpm install` (zero new packages downloaded — vite/vitest already resolvable from
      the existing dependency tree; only new lockfile entries for `packages/ui`)
- [x] Fixed a real bug found during validation: two doc comments in `format.ts`
      contained a literal NBSP character instead of a regular space (copy-paste from
      thinking about the NBSP constant), tripping ESLint's `no-irregular-whitespace` —
      fixed by replacing those two comment occurrences with plain text
- [x] Fixed a real test bug found during validation: the IANA-timezone `formatDate` test
      crossed a year boundary (Dec 31 → Jan 1) while asserting "same year", which is
      simply wrong once the timezone shift is applied — rewritten to cross a day
      boundary within the same month instead, isolating what the test actually checks
- [x] Ran `prettier --write` on the four new/changed source files after they failed
      `format:check` (line-wrapping only, no logic change)
- [x] Validated: `turbo run lint typecheck build test --force` (25/25),
      `pnpm --filter ui test` (31/31), `format:check`/`lint:root`
- [x] Updated project context + docs (this file, project-state.md, architecture-map.md,
      known-issues.md KI-021, changelog.md, tasks.md)
- [x] Reviewed `git diff`/`git status` — only intended files changed (plus the
      pre-existing untracked `skills-lock.json`, unrelated to this task, left alone)

## Validation

- [x] `npx turbo run lint typecheck build test --force` — 25/25 green (all 9 workspace
      members)
- [x] `pnpm --filter ui test` — 31/31 passing (`format.test.ts` 25, `terminology.test.ts` 6)
- [x] `pnpm --filter ui exec eslint .` — clean, after fixing the irregular-whitespace
      finding above
- [x] `pnpm format:check` / `pnpm lint:root` — clean
- [x] `git status`/`git diff` reviewed — only intended files changed

## Discovered issues

- KI-021 (new, recorded in `known-issues.md`): `RideService`/registration-state keys in
  `terminology.ts` are provisional — no DB enum exists yet to source them from. Ride
  status/bicycle type are unaffected (already sourced from `docs/product.md`).
- Two doc-comment NBSP characters and one test's year-boundary logic error, both found
  and fixed during this session's own validation pass (see Implementation progress
  above) — not carried over as known issues since both were fixed before completion.

## Final result

Done. `packages/ui/src/format.ts` implements every row of `docs/design.md` §7 (distance,
elevation, speed/pace, duration, date, time, price, participants) with the comma
decimal/NBSP-grouping/NBSP-unit-join rules applied uniformly, plus the missing-value
em-dash rule from `.claude/rules/frontend.md`/§6 handled once at the formatter level.
`packages/ui/src/terminology.ts` implements §13's ride-status (with tone), bicycle-type,
services, and registration-label lookups; ride status and bicycle type use enum keys
copied verbatim from `docs/product.md`, while services/registration-state keys are
provisional (no DB enum exists yet) and flagged both in-code and as KI-021.
`packages/ui` gained its first real Vitest suite (31 tests, `node` environment) and its
first real exports (`src/index.ts`, previously `export {}` since CR-007). Two real bugs
(an irregular-whitespace lint violation from stray NBSP characters in doc comments, and
a self-contradictory test crossing a year boundary) were found and fixed during this
session's own validation, not left for a later pass. `turbo run lint typecheck build
test --force` 25/25 green; `format:check`/`lint:root` clean. Deliberately deferred: the
§7 ride-start timezone-hint decoration (needs a viewer-timezone source and a place name
that don't exist as data yet). Both `docs/design.md` §14-named prerequisites for CR-011
(CR-063 tokens, CR-064 formatters/terminology) are now done. Next logical task: CR-065
(Metric presentation components — `MetricTile`, `MetricRow`, `StatusBadge`,
`DifficultyScale`, `docs/design.md` §6), which also needs to resolve KI-020 (shadcn
CLI's vendoring target) before its first component.
