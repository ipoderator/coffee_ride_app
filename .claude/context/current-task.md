# Current task — CR-267 — `apps/api` test files in parallel

Source: owner, 2026-10-15 (CI speed-up, point 2, after CR-266). Branch
`test/api-parallel-files`, PR #71.

## Goal

Drop `fileParallelism: false` from `apps/api` (the `unit` job's critical path, ~4:50).

## Requirements / acceptance criteria

- each Vitest worker gets its own Postgres database and Redis logical database — done
  (`worker-databases.ts` globalSetup, `worker-redis.ts` setupFile);
- KI-049's name allowlist still guards TEST_DATABASE_URL — done (runs on the base URL);
- the suite passes in any file order — done (4 shuffled seeds, 917/917);
- coverage gate holds — done.

## Validation

api typecheck, lint (0 errors), format; shuffled ×4 with 3 workers, 85–100 s each; full
`test:coverage` with live Redis/S3 + `coverage:check` holds.

## Discovered issues (fixed)

Auth files deleted `users` without `rides` first; Google held-race tests slept 150 ms
instead of polling the lock wait; avatar live-Redis test inherited a used-up sign-in
limit; Vitest 5 gives globalSetup no `maxWorkers` unless the config sets it.

## Final result

Implemented and validated locally; PR #71 CI pending.
