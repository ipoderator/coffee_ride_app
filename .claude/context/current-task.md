# Current Task

## Status

done

## Task ID

CR-005 — Configure Redis

## Goal

Add a Redis client factory to `apps/api`. Tooling only, mirroring CR-004's
scope: ADR-004 ("Use for caching, rate limiting, and jobs only when
justified") means there is no justified consumer yet — the notification queue
is CR-050, rate limiting is CR-058. No separate `packages/redis`:
`.claude/rules/architecture.md`'s package list doesn't call one out (unlike
`packages/db`, which architecture.md explicitly assigns "schema/migrations/
client"), and Redis here is a plain connection, not a schema-owning store —
so it lives directly in `apps/api`, the only consumer per the fixed stack.

## Requirements

1. `ioredis@^6.0.0` as the client — chosen over the official `redis` package
   because CR-050 ("Async notification delivery via Redis queue") will almost
   certainly use BullMQ, which requires `ioredis`; picking it now avoids a
   client swap later.
2. `apps/api/src/redis.ts`: `createRedisClient(url: string)` factory, same
   shape as `packages/db`'s `createDbClient` (factory, not a singleton reading
   `process.env` itself).
3. Not wired into `app.ts`/any route in this task — same discipline as CR-004
   not wiring `packages/db` into `apps/api` yet. `REDIS_URL` stays optional in
   `src/env.ts` (already added in CR-003; nothing consumes it yet).
4. Validate for real if at all possible (self-correction protocol) — attempted
   `docker compose up redis`, Docker's daemon did not come up in this
   environment (same issue as CR-004). Unlike CR-004, there was no
   already-running local Redis to fall back to; the user explicitly declined
   installing one via Homebrew for this session. Live connectivity is
   therefore NOT verified this time — recorded honestly rather than skipped
   silently. `pnpm format:check`/`lint:root`/`turbo lint|typecheck|build` are
   still the checks that did run.

## Acceptance criteria

- `apps/api` still builds/typechecks/lints cleanly via `turbo` with the new file;
- `apps/web`/`packages/db` stay green (regression check);
- `docs/tasks.md`, `project-state.md`, `known-issues.md` (new KI for the
  unverified live connection), `architecture-map.md`, `docs/changelog.md`
  updated, honestly reflecting the validation gap;
- `git diff` reviewed.

## Planned files

`apps/api/package.json` (`ioredis`), `apps/api/src/redis.ts`;
`.claude/context/{project-state,architecture-map,known-issues,current-task}.md`,
`docs/tasks.md`, `docs/changelog.md`.

## Implementation progress

- [x] researched scope/versions, decided no separate package
- [x] add `src/redis.ts`, `ioredis` dependency
- [x] `pnpm install`
- [x] validate: turbo lint/typecheck/build (live connection NOT verified —
      see Requirements §4, recorded as KI-014)
- [x] update context/docs

## Validation

- [x] `turbo run lint|typecheck|build` — all exit 0 for `api`; `web`/`db` stay green
- [x] `pnpm format:check` / root `eslint .` — still pass
- [x] tried live validation twice (before and after implementation) — Docker
      daemon never came up; no local Redis fallback; user declined a Homebrew
      install for this session — genuinely NOT verified, recorded as KI-014
      rather than silently skipped
- [x] `git status` reviewed
- [n/a] `turbo test` — no test runner in `apps/api` yet (CR-008)

## Discovered issues

- `ioredis@6.0.0`'s default export has no construct signature under this
  project's `esModuleInterop`/`moduleResolution: NodeNext` settings (`TS2351`),
  despite working fine at runtime (confirmed via a quick `import()` probe that
  both `default` and the named `Redis` export are functions). Fixed by
  importing the named `{ Redis }` export instead, which is properly typed as
  constructable.
- Docker's daemon still hadn't come up on a second check after implementation
  (checked before starting and again after) — not an intermittent issue,
  genuinely unavailable for the whole session.

## Final result

Done, with one honestly-recorded gap. `apps/api` has a Redis client factory
(`ioredis`, matching `packages/db`'s factory shape) that typechecks/lints/builds
cleanly but was never connected to a live Redis in this session (KI-014) — no
Docker, no local fallback, user declined installing one. Not wired into any
route yet, consistent with ADR-004 ("only when justified") and CR-004's
precedent. `docs/tasks.md` (CR-005), `known-issues.md` (KI-014),
`project-state.md`, `architecture-map.md`, `docs/changelog.md` all updated.
Next logical task: CR-006 (Configure MinIO/S3 adapter).
