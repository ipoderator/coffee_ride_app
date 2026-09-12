# Current Task

## Status

done

## Task ID

CR-008 — Configure Vitest/Playwright

## Goal

Wire the test runners the fixed stack already commits to
(`.claude/CLAUDE.md`: "Tests: Vitest + Playwright") into the workspace
members that already have real logic worth testing, same "tooling first,
real content only where there's a justified consumer" discipline as
CR-004..CR-007.

## Requirements

(see prior version of this file / `docs/changelog.md` CR-008 entry for the
full list — all delivered.)

## Acceptance criteria

- `turbo test` runs real, passing tests for `apps/api`, `packages/maps-2gis`,
  `apps/web` — met (5 + 11 + 1 = 17 tests, all passing);
- packages with nothing to test are silently skipped by turbo — met
  (`packages/db`/`types`/`ui`/`maps-core`/`config` have no `test` script);
- `apps/web`'s Playwright e2e smoke spec passes locally against `next dev` —
  met, run live;
- `turbo lint`/`typecheck`/`build` stay green across all 8 workspace
  members — met (24/24 tasks green);
- `pnpm format:check` clean — met;
- context/docs updated honestly, including the CI-e2e gap staying open
  (KI-007) rather than silently closed — met;
- `git diff` reviewed — met.

## Planned files

Delivered as planned — see `docs/changelog.md`'s CR-008 entry's Files line
for the exact list, including two files not originally planned: `apps/api/
src/app.ts` (small logger tweak, discovered necessary) and `packages/
{types,maps-core,maps-2gis}/tsconfig.json` + `packages/config/tsconfig/
node-library.json` (KI-018 fix, discovered necessary).

## Implementation progress

- [x] `packages/config`: shared Vitest node-library fragment
      (`vitest/node-library.js`, plain JS)
- [x] `apps/api`: Vitest config + 5 tests (`buildApp()` + `.inject()`)
- [x] `packages/maps-2gis`: Vitest config + 11 tests (`fetch` mocked)
- [x] `apps/web`: Vitest config (jsdom + RTL) + 1 unit test
- [x] `apps/web`: Playwright config + 1 e2e smoke spec
- [x] `pnpm install` — 85 packages added, no unmet-peer errors
- [x] validate: `turbo run test lint typecheck build --force` — 24/24 green
- [x] `pnpm format:check` / `pnpm lint:root` — both clean (one prettier
      --write pass needed on 6 new/touched files first)
- [x] live: Playwright browsers installed, `playwright test` run and passed
      against a real `next dev` server
- [x] update context/docs (this file, project-state, architecture-map,
      known-issues — KI-018 added and resolved same session —
      docs/tasks.md, docs/changelog.md)

## Validation

- [x] `turbo run test lint typecheck build --force` — 24/24 tasks green,
      17 tests total (5 api + 11 maps-2gis + 1 web), 0 failures
- [x] `pnpm format:check` — clean
- [x] `pnpm lint:root` — clean
- [x] live Playwright e2e run against real `next dev` (not just config-
      checked) — 1 passed
- [x] `git status`/`git diff` reviewed — only intended files changed

## Discovered issues

- KI-018 (found and resolved this session): `packages/config`'s shared
  tsconfig fragment's chained `extends` broke under Vite 8's `vite:oxc`
  transform (used by Vitest 5) the moment a package going through that
  chain (`packages/maps-2gis`) got a `vitest.config.ts` — `tsc` itself was
  never affected and stayed green throughout. Root cause: oxc resolves a
  nested `extends` relative to the _original_ consuming tsconfig's
  directory, not each intermediate fragment's own directory (a real
  divergence from `tsc`'s per-file-relative resolution). Fixed by having
  every consumer of `packages/config/tsconfig/node-library.json` extend
  both it and `tsconfig.base.json` directly as a TS 5+ `extends` array,
  removing the chain entirely.
- A small, deliberate `apps/api/src/app.ts` change (not originally planned):
  `NODE_ENV=test` now gets `logger.level: 'silent'` with no `pino-pretty`
  transport, since `buildApp()` is called once per test case and spawning a
  pretty-printer worker thread per instance was both noisy and needlessly
  slow. `buildApp()`'s signature/behavior is otherwise unchanged.

## Final result

Done. Vitest wired and producing real, passing tests for the three
workspace members with logic worth testing (`apps/api`: 5, `packages/
maps-2gis`: 11, `apps/web`: 1 — 17 total); Playwright wired for `apps/web`
e2e and live-verified against a real `next dev` server. The five packages
with nothing real to test (`db`/`types`/`ui`/`maps-core`/`config`) correctly
got no `test` script — `turbo test` skips them by design. A genuine tooling
bug (KI-018) was discovered and fixed in the same session rather than
worked around. All 8 workspace members stay lint/typecheck/build clean;
`pnpm format:check`/`lint:root` clean. CI's existing `Test` step will now
run something real; a Playwright CI job stays deliberately deferred to
CR-080 (KI-007 unchanged). `docs/tasks.md`, `known-issues.md` (KI-018),
`project-state.md`, `architecture-map.md`, `docs/changelog.md` all updated.
Next logical task: CR-009 (Configure Docker Compose).
