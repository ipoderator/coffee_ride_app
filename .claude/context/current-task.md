# Current task

## Task ID

CR-094 — Wire `SIGTERM`/`SIGINT` in `apps/api/src/server.ts` to actually
call `app.close()`, resolving KI-048. Closed.

## Goal

KI-048: nothing called `app.close()` on `SIGTERM`/`SIGINT` — `modules/
notifications/queue.ts`'s `onClose` hook already assumed a real graceful
shutdown triggers it, but no signal handler existed, so on a real
`docker stop`/orchestrator shutdown the process just died without running
any `onClose` hook (notification queue worker/producer disconnect, `db.ts`'s
Postgres pool close).

## Requirements / acceptance criteria — all met

- `SIGTERM` and `SIGINT` each trigger `app.close()` then `process.exit(0)`
  on success. Done.
- A hard fallback timeout (10s) forces `process.exit(1)` if `app.close()`
  doesn't finish in time — defense in depth beyond `queue.ts`'s own bounded
  (3s) `onClose` hook, also covers `db.ts`'s unbounded pool `.end()`. Done.
- A second signal mid-shutdown forces an immediate exit instead of
  waiting/re-entering. Done.
- `app.close()` rejecting (an `onClose` hook throwing) still exits
  non-zero instead of hanging. Done.
- Dependency-injectable (signals source + exit function) so it's
  unit-testable without real OS signals or killing the test process. Done.

## Implementation

- `apps/api/src/lib/graceful-shutdown.ts` (new): `registerGracefulShutdown(app,
deps?)`. Tracks a `shuttingDown` flag; first `SIGTERM`/`SIGINT` starts an
  unref'd 10s force-exit timer and calls `app.close()`; success clears the
  timer and exits 0, rejection logs and exits 1, timeout exits 1. A second
  signal while `shuttingDown` is true exits 1 immediately without a second
  `app.close()` call.
- `apps/api/src/lib/graceful-shutdown.test.ts` (new, 5 tests): fake
  `signals.on`/`exit` deps, `vi.useFakeTimers()` for the force-exit-timeout
  case. Covers registration, clean shutdown, `close()` rejection, force-exit
  timeout, and double-signal.
- `apps/api/src/server.ts`: calls `registerGracefulShutdown(app)` (real
  `process`) right after `buildApp()`, before `app.listen()`.

## Validation results

- `pnpm --filter api exec vitest run src/lib/graceful-shutdown.test.ts`:
  5/5 passed.
- `pnpm --filter api typecheck`: clean (one real error surfaced and fixed —
  `Pick<NodeJS.Process, 'on'>`'s `on()` return type is `Process`, so the
  test's fake `on` needed a type assertion, not a structural match).
- `pnpm --filter api exec eslint .`: clean.
- `pnpm --filter api test`: 55 passed, 1 skipped, 12 failed — every failure
  is a pre-existing `DATABASE_URL is required` guard in a DB-dependent
  suite unrelated to this change (KI-014/KI-019, Docker unreachable in this
  sandbox, same standing constraint as every prior session). No suite this
  change touches is among the failures.
- `pnpm turbo run lint typecheck build`: 24/24 green.
- `git diff --stat`: touches only `apps/api/src/server.ts` +
  `apps/api/src/lib/graceful-shutdown.{ts,test.ts}` (plus context docs) —
  no unrelated changes.

## Discovered issues

None new. Real signal delivery (`docker stop` against a running container)
still can't be live-verified in this sandbox (KI-019, Docker daemon
unreachable) — verified via the dependency-injected unit tests instead,
same limitation every Redis/S3/Docker-dependent CR in this project has
hit.

## Final result

CR-094 closed. `SIGTERM`/`SIGINT` now run a real, bounded, double-signal-safe
graceful shutdown. KI-048 resolved (moved to known-issues.md's Resolved
section). Only one open, actionable ticket remains in `docs/tasks.md`:
CR-086 (cover image pipeline). `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md`, `.claude/context/known-issues.md` all
updated.
