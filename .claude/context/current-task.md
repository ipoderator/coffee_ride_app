# Current task

## Task ID

CR-095 — Give `apps/api`'s test suite its own disposable database
(`TEST_DATABASE_URL`), separate from `.env`'s `DATABASE_URL` (KI-049) —
already the pre-created ticket for this exact gap (`docs/tasks.md`, last
unchecked entry). Widened in this session to also cover the backup side of
the same incident (no working backup schedule existed anywhere). Interrupts
CR-086 (cover image pipeline), whose files are already in the working tree,
implemented but uncommitted, and left untouched by this task — see "Note on
CR-086" below.

## Goal

Previous session's `apps/api` test run wiped the real local dev Postgres
(`coffee_ride_dev`) because the test suite's unscoped `DELETE FROM
users`/`DELETE FROM rides` ran against whatever `DATABASE_URL` was in the
environment — no distinction between a disposable test database and the real
one (KI-049). User confirmed the lost data was test/QA data and does not need
restoring. Two things are actually asked for:

1. Make this structurally impossible against real data going forward (not
   just a documented workaround to remember).
2. Set up backups — the mechanism (`packages/db/scripts/backup.sh`) has
   existed since CR-078 but has never actually been run or scheduled
   anywhere, local or prod.

## Requirements / acceptance criteria

- `apps/api`'s test suite reads a `TEST_DATABASE_URL` env var, never
  `DATABASE_URL` — sourcing `.env` (which only sets `DATABASE_URL`) can no
  longer feed the suite a real database under any circumstance.
- Defense in depth: even with `TEST_DATABASE_URL` set, the suite refuses to
  run its destructive `beforeEach`/`afterAll` cleanup if the resolved
  database name doesn't look disposable (must contain `test`, or be exactly
  `coffee_ride`) — guards against someone exporting `TEST_DATABASE_URL`
  wrong, not just against `.env` being sourced.
- CI's `TEST_DATABASE_URL` points at the same disposable service-container
  Postgres it already uses for `DATABASE_URL` — no behavior change in CI,
  same isolation guarantee made explicit.
- `.env.example`/`.env` document/set `TEST_DATABASE_URL` pointing at the
  Docker Compose `postgres` service's `coffee_ride` database — never at
  `coffee_ride_dev`.
- A real, current backup of `coffee_ride_dev` exists on disk right now
  (immediate safety net for the 2 real users currently in it).
- `docker-compose.prod.yml` gets a real scheduled backup mechanism (not just
  a documented cron one-liner nobody runs) — activates automatically the
  moment production is ever deployed (KI-001/045: not deployed yet).
- Local recurring backups: ask the user before installing anything at the
  OS level (launchd) — that's outside the repo and persists on their
  machine regardless of this session.

## Note on CR-086

Its files (cover-image pipeline) are already fully present in the working
tree per `git status` at session start, but `docs/tasks.md` still shows it
unchecked and this file still said "Starting now." — stale, not this
session's job to resolve. Left entirely alone; do not commit, discard, or
edit any CR-086 file as part of this task.

## Planned files

`apps/api/src/test-support/test-database-url.ts` (new),
13 `apps/api/src/**/*.test.ts` files (swap `process.env.DATABASE_URL` for
the new helper), `.env.example`, `.env` (gitignored, local only),
`.github/workflows/ci.yml`, `docker-compose.prod.yml`,
`docs/database.md`, `docs/deployment.md`, `docs/changelog.md`,
`docs/tasks.md`, `.claude/context/known-issues.md` (resolve KI-049),
`.claude/context/project-state.md`.

## Implementation progress

Done.

- `apps/api/src/test-support/test-database-url.ts` (new): `getTestDatabaseUrl()`.
- All 13 `apps/api` test files that touch a real Postgres switched from
  `process.env.DATABASE_URL` to this helper.
- `.env.example`/`.env`/`.github/workflows/ci.yml`: `TEST_DATABASE_URL` added.
- Migrated the previously-empty Docker Compose `coffee_ride` database so
  `TEST_DATABASE_URL` actually points at something usable.
- Took an immediate real backup of `coffee_ride_dev` into
  `packages/db/backups/` (gitignored).
- `docker-compose.prod.yml`: new always-on `backup` service.
- `docs/database.md` Backups section rewritten; `docs/tasks.md` CR-095
  checked off; `docs/changelog.md` entry appended; `.claude/context/
known-issues.md` KI-049 moved to Resolved; this file and `project-state.md`
  updated.

## Validation results

- `pnpm --filter api test`: 345 passed, 1 skipped — run with `.env` sourced
  (the exact scenario that caused the original incident).
- Real dev DB (`coffee_ride_dev`) user count confirmed unchanged (2 before,
  2 after) across that run.
- Guard live-verified to refuse `TEST_DATABASE_URL` pointed at
  `coffee_ride_dev` by name, with a clear error.
- `pnpm --filter api typecheck` / `pnpm --filter api lint`: clean.
- `docker compose -f docker-compose.prod.yml config`: clean after fixing a
  real bug (`$BACKUP_INTERVAL_SECONDS` needed `$$`-escaping — Compose was
  interpolating it to an empty string at config-render time instead of
  passing it through to the container's shell).

## Discovered issues

- The `$$`-escaping bug above, found and fixed during validation, not left
  for a future session.
- Not addressed: local recurring backups (OS-level scheduling, e.g. macOS
  launchd) were deliberately not installed — that's a persistent change to
  the user's machine outside the repo, left for the user to decide on.

## Final result

KI-049 resolved. Real dev data (currently 2 users) can no longer be wiped by
the test suite, structurally, not just by convention. A real backup of the
current real data exists on disk now, and any future production deployment
gets automatic scheduled backups out of the box. CR-086 (cover image
pipeline) remains the only unchecked ticket in `docs/tasks.md`, untouched by
this task.
