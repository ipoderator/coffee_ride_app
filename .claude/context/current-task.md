# Current Task

## Status

done

## Task ID

CR-006 — Configure MinIO/S3 adapter

## Goal

Add an S3 client factory to `apps/api`. Tooling only, same pattern as
CR-004 (`packages/db`) and CR-005 (Redis): no upload route consumes it yet
(GPX upload is CR-027, cover images are CR-086 — which still has to decide
"direct S3 vs proxy"), and no resilience wrapping (timeout/retry/circuit
breaker) is added here — that's the cross-cutting CR-049
("Timeout/retry/circuit-breaker utilities for external integrations (2GIS
Maps, S3)"), a separate task by design.

No separate `packages/storage-*` split: unlike maps (ADR-010 explicitly
splits `packages/maps-core`/`packages/maps-2gis` because the 2GIS SDK is
vendor-specific and must never leak into domain types), S3 is already a
standardized, provider-neutral wire protocol — MinIO locally, "production
provider is deployment-specific" (ADR-005). The official AWS SDK v3 speaks
that same protocol against every S3-compatible provider (AWS S3, MinIO,
Cloudflare R2, Backblaze B2, DigitalOcean Spaces, ...), so there's no
vendor-SDK-leak problem to isolate behind a second package. `apps/api` is the
only consumer, matching Redis/DB placement.

## Requirements

1. `@aws-sdk/client-s3@^3.1131.0` — official, portable S3-compatible client.
   Not `minio` (MinIO's own client): ADR-005 doesn't pin MinIO as the
   production provider, so the more universally-portable AWS SDK is the
   better long-term fit.
2. `apps/api/src/s3.ts`: `createS3Client(config)` factory — same factory
   shape as `createDbClient`/`createRedisClient`. Config needs `endpoint`,
   `region`, `accessKeyId`, `secretAccessKey`, and `forcePathStyle: true`
   (required for MinIO and most non-AWS S3-compatible providers — virtual-
   hosted-style bucket URLs don't work against them).
3. Not wired into any route/use case in this task — `S3_*` env vars stay
   optional in `src/env.ts` (already added in CR-003, still nothing reads
   them).
4. Validate for real if possible (self-correction protocol): `docker compose
up minio` — Docker's daemon has been unavailable all session (CR-004/
   CR-005 hit the same wall). If still unavailable, this is a third
   consecutive occurrence — worth flagging plainly rather than re-litigating
   per task, and validating via typecheck/lint/build only, same honest
   gap-recording style as KI-014.

## Acceptance criteria

- `apps/api` builds/typechecks/lints cleanly via `turbo` with the new file;
- `apps/web`/`packages/db` stay green (regression check);
- `docs/tasks.md`, `project-state.md`, `known-issues.md`, `architecture-map.md`,
  `docs/changelog.md` updated, honestly reflecting whatever validation was
  actually possible;
- `git diff` reviewed.

## Planned files

`apps/api/package.json` (`@aws-sdk/client-s3`), `apps/api/src/s3.ts`;
`.claude/context/{project-state,architecture-map,known-issues,current-task}.md`,
`docs/tasks.md`, `docs/changelog.md`.

## Implementation progress

- [x] researched scope/versions, decided no separate package (same reasoning
      as CR-005)
- [x] add `src/s3.ts`, `@aws-sdk/client-s3` dependency
- [x] `pnpm install`
- [x] validate: turbo lint/typecheck/build; attempted live MinIO check —
      Docker unavailable (third consecutive occurrence, see Discovered issues)
- [x] update context/docs

## Validation

- [x] `turbo run lint|typecheck|build` — all exit 0 for `api`; `web`/`db` stay green
- [x] `pnpm format:check` / root `eslint .` — still pass
- [x] Docker daemon check — NOT_READY (third occurrence this session)
- [x] `git status` reviewed
- [n/a] `turbo test` — no test runner in `apps/api` yet (CR-008)
- [n/a] live MinIO round trip — not possible without Docker; not re-attempted
  via a fresh Homebrew install after CR-005 already declined one

## Discovered issues

- Docker's daemon has now failed to come up in this environment across all
  three of CR-004, CR-005, and CR-006 — a confirmed standing constraint, not
  one-off flakiness. Saved as a cross-session project memory
  (`docker-desktop-unavailable`) so future tasks don't re-spend the ~4+ minute
  wait before falling back.
- No standing local fallback for Redis/MinIO the way Postgres had one (an
  already-running Homebrew service) — noted in the same memory file so a
  future session knows to ask before installing rather than assuming one
  exists.

## Final result

Done, with the same honestly-recorded gap pattern as CR-005. `apps/api` has an
S3 client factory (`@aws-sdk/client-s3`, matching `createDbClient`/
`createRedisClient`'s factory shape) that typechecks/lints/builds cleanly but
was never connected to a live MinIO (KI-015) — Docker unavailable for the third
time this session. Not wired into any route, consistent with the "first real
consumer decides serving strategy" boundary (CR-027/CR-086). `docs/tasks.md`
(CR-006), `known-issues.md` (KI-015), `project-state.md`, `architecture-map.md`,
`docs/changelog.md` all updated; Docker unavailability also saved to
cross-session memory. Next logical task: CR-007 (Configure shared packages).
