# Current Task

## Status

complete

## Task ID

CR-011 — User registration

## Goal

First real screen, first domain table in `packages/db`, first consumer of every shared
`packages/ui`/`packages/types` piece built by CR-063..CR-066. Implements
`POST /v1/auth/register` and `POST /v1/auth/verify-email` (full verification cycle, per
user decision this session — real email delivery stays out of scope pending ADR-007) plus
the `/register` web screen. Login/session is CR-012, not this ticket.

Full plan: `/Users/glebchurkin/.claude/plans/lively-discovering-dahl.md`.

## Requirements

See the plan file — implemented as specified, no deviations to requirements (only
implementation-detail decisions, recorded below).

## Acceptance criteria

All met — see Validation below for exact results against each one from the plan.

## Planned files

See plan file's "Files" section — implemented as specified; final file list is in
`docs/changelog.md`'s CR-011 entry.

## Implementation progress

- [x] Plan approved (ExitPlanMode)
- [x] `packages/db`: schema + migration, live-applied to scratch Postgres
- [x] `packages/types`: `User` domain type + auth contract schemas
- [x] `apps/api`: db plugin, env change, auth module, rate limiting, tests
- [x] `packages/ui`: Button/Input/FormField/Card + tests
- [x] `apps/web`: proxy config, register feature module, route, tests
- [x] Live check (both servers + real Postgres, browser-automation for `/register`)
- [x] Full validation (`turbo run lint typecheck build test`, format/lint:root)
- [x] Context/docs updated (changelog, project-state, architecture-map, known-issues,
      tasks.md)
- [x] `git diff`/`git status` reviewed

## Validation

- `pnpm --filter db db:generate` → clean migration (`0000_majestic_silver_fox.sql`),
  applied to a scratch local Postgres (`coffee_ride_dev`, Homebrew Postgres 14) via
  `pnpm --filter db db:migrate`; schema shape confirmed with `\d users` / `\d
email_verification_tokens`. PASS.
- `pnpm --filter api test` — 15/15 (2 files). `pnpm --filter ui test` — 82/82 (13
  files). `pnpm --filter web test` — 8/8 (2 files). All against
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`. PASS.
- Live check: `apps/api` (`tsx watch`) + `apps/web` (`next dev`) run together against
  the real scratch Postgres. `curl` exercised register → duplicate-email (409) →
  verify-email (200) → verify-email again (400 already-used) → unknown token (400) →
  validation failure (400) — RFC 9457 envelope and rate-limit headers all correct.
  `/register` driven live via the browser-automation skill: filled + submitted the
  real form, success state appeared with the dev-only verification note, 0 console
  errors / 0 failed requests. Screenshotted in light theme and in dark (`.dark` class
  toggled — this app's dark mode is class-based, not `prefers-color-scheme`; both
  screenshots visually reviewed, correct tokens/contrast in both). PASS.
- `npx turbo run lint / typecheck / build / test` — each run **separately** (a combined
  `lint typecheck build test` invocation raced `web:typecheck` against `web:build` over
  the same `.next` dir and produced a spurious failure — not a real bug, an artifact of
  running them concurrently against one package via one turbo invocation). All four
  green individually across all 8 workspace packages. PASS.
- `pnpm format:check` / `pnpm lint:root` — clean after one `pnpm format` pass (19 new
  files needed Prettier's formatting). PASS.
- `git status`/`git diff` reviewed — see Final result.

## Discovered issues

- `apps/web/vitest.setup.ts` never registered React Testing Library's cleanup (no
  `test.globals`, so RTL's own auto-cleanup never self-registers) — every render in a
  multi-test component file leaked into the next test's DOM. Fixed: explicit
  `afterEach(cleanup)`. Root-caused and fixed in this session, not deferred.
- `packages/types` is `apps/web`'s first bundler-based (webpack, via Next.js) consumer
  of a NodeNext-style package (`.js`-suffixed relative imports pointing at `.ts`
  files) — webpack doesn't resolve that by default. Fixed with a `resolve.
extensionAlias` entry in `next.config.ts`. Scoped to webpack/`apps/web` only.
- KI-017 (previously an unverified prediction) is now **confirmed live and blocking**:
  `NODE_ENV=production node dist/server.js` crashes immediately, because `packages/db`
  (a real runtime consumer starting this ticket) exports raw TS source its own
  package.json points at, which plain `node` can't resolve the way `tsx`/`tsc` do.
  Not fixed in this ticket — the fix (dist-based package exports + a dev-time build
  step, or a bundler for `apps/api`'s own build) is an architecture/tooling decision
  needing its own ADR per `.claude/rules/architecture.md`'s change control, and this
  compiled-boot check is not one of CR-011's own acceptance criteria (which use `tsx`/
  `vitest`/`tsc`, none of which hit this path). Documented in
  `.claude/context/known-issues.md` (KI-017 updated) instead of silently fixed or
  silently ignored.
- New interim-security-posture gap recorded as KI-022: auth endpoints ship with
  in-memory per-IP-only rate limiting (no Redis/per-account — CR-058) and no
  `@fastify/helmet`/CSRF (CR-061) yet — both explicit, documented scope boundaries from
  the approved plan, not oversights, but worth a known-issue entry so a future session
  doesn't mistake CR-011 as having covered them.

## Final result

Done. `git status` shows only the files listed in `docs/changelog.md`'s CR-011 entry
changed/added (plus the pre-existing, unrelated `docs/product.md` edit and
`skills-lock.json` that were already present before this task started — left untouched,
out of scope). All acceptance criteria met; no known CRITICAL/HIGH issues remain open
against CR-011's own scope. Two real gaps were found and either fixed in-session
(RTL cleanup, webpack extension alias) or correctly deferred with a documented reason
and a known-issue entry (KI-017 confirmed-blocking status, KI-022 new). Next logical
task: CR-012 (Login/logout/session).
