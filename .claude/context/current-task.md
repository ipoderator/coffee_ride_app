# Current task

## Task ID

CR-081 — Full production environment variable set in `.env.example` +
deployment documentation (`docs/tasks.md` Deployment section).

## Goal

Close the last real gap before Deployment is fully documented and safe to
operate: no `docs/deployment.md` exists at all (confirmed — `docs/` has no
deployment doc; `docs/database.md` only covers backups), and KI-046
(`REDIS_URL`/`S3_ENDPOINT` empty-string crash) is still open for its
`env.ts` half (the `ERROR_REPORTING_WEBHOOK_URL` half was already fixed in
CR-079).

## Investigation

- `.env.example` already lists every variable `docker-compose.prod.yml`'s
  `api`/`web`/`caddy` services actually consume (`DOMAIN`, `ACME_EMAIL`,
  `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`, `DATABASE_URL`, `REDIS_URL`, `S3_*`,
  `AUTH_SECRET`, `MAPS_2GIS_API_KEY`, `ERROR_REPORTING_WEBHOOK_URL`) —
  cross-checked line by line. So the ".env.example" half of this ticket's
  title is already satisfied; no new variables to add there.
- KI-046 (`.claude/context/known-issues.md`) is still open for
  `REDIS_URL`/`S3_ENDPOINT`: both are `z.string().url().optional()` in
  `apps/api/src/env.ts` with no preprocessing, so `docker-compose.prod.yml`
  substituting an empty string for an unset var (confirmed Compose
  behavior, same as what CR-079 already found for
  `ERROR_REPORTING_WEBHOOK_URL`) fails `.url()` validation and crashes API
  boot — even though "Redis/S3 not configured" is a fully supported
  degraded mode everywhere else in the app. `ERROR_REPORTING_WEBHOOK_URL`
  already has the fix (`z.preprocess` normalizing `''` to `undefined`) —
  applying the identical pattern to the other two closes KI-046 for real,
  not just partially.
- No `docs/deployment.md` exists. `docs/architecture.md`/ADR-018/
  `docker-compose.prod.yml`'s own comments/`docs/database.md`'s Backups
  section each document one slice (reverse proxy decision, migration
  profile, backup script) but nothing walks an operator through an actual
  deploy end to end: prerequisites, filling in `.env`, first boot order
  (migrate before serving traffic), verifying `/health`, redeploying,
  rollback limitations. That's the real gap this ticket closes.

## Decision

- `apps/api/src/env.ts`: apply the same `z.preprocess((v) => v === '' ?
undefined : v, z.string().url().optional())` shape already used for
  `ERROR_REPORTING_WEBHOOK_URL` to `REDIS_URL` and `S3_ENDPOINT`. No other
  fields need it (`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/
  `S3_BUCKET`/`MAPS_2GIS_API_KEY` are plain `z.string().optional()` — an
  empty string already passes that check, so a downstream "is S3
  configured" check based on `S3_ENDPOINT` alone is the only one that
  actually needed fixing here).
- New `apps/api/src/env.test.ts`: didn't exist before: covers the
  empty-string-to-undefined normalization for `REDIS_URL`/`S3_ENDPOINT`
  (mirroring the already-shipped `ERROR_REPORTING_WEBHOOK_URL` behavior)
  plus the existing production-placeholder-refusal behavior, so this
  correctness-critical parsing logic has real test coverage instead of
  only ever being exercised indirectly through other suites.
- New `docs/deployment.md`: prerequisites (Docker + Compose v2 host, DNS A
  record for `DOMAIN`, externally provisioned Postgres/Redis/S3-compatible
  endpoint reachable from the host — ADR-018 leaves that hosting choice
  open, doesn't invent one), preparing `.env` from `.env.example`,
  first-boot order (`--profile migrate run --rm migrate` before `up -d
--build` — CR-076's own documented order), redeploying/updating
  (rebuild, run `migrate` again only if the release added migrations),
  verifying (`/health` semantics — always `200`, per-dependency
  `ok`/`error`/`not_configured`; Caddy TLS), logs (`docker compose logs -f
<service>`, pino JSON to stdout, `request-id` correlation from CR-079),
  rollback limitations (no automatic down-migrations — Drizzle doesn't
  generate them; a schema-incompatible rollback needs a manual plan), a
  pointer to `docs/database.md`'s Backups section rather than duplicating
  it. Records plainly, once, that none of this has been exercised by a
  real `docker compose up` in any session so far (KI-043/KI-045) — this is
  the documented procedure, not a live-verified one.
- `.claude/context/known-issues.md`: KI-046 → resolved.
- `docs/tasks.md`: check off CR-081.

## Requirements / acceptance criteria

- `REDIS_URL=''`/`S3_ENDPOINT=''` no longer crashes `apps/api` boot (unit
  test, not just reasoning).
- `docs/deployment.md` exists and actually lets an operator go from a bare
  host to a running, migrated, TLS-terminated deployment, without
  duplicating `docs/database.md`'s Backups section.
- KI-046 fully resolved (not just its `ERROR_REPORTING_WEBHOOK_URL` third).
- `docs/tasks.md` CR-081 checked off; changelog/project-state/
  known-issues updated.

## Planned files

- `apps/api/src/env.ts`
- `apps/api/src/env.test.ts` (new)
- `docs/deployment.md` (new)
- `.claude/context/known-issues.md`
- `docs/tasks.md`
- `docs/changelog.md`, `.claude/context/project-state.md`

## Implementation progress

- [x] `env.ts` preprocess fix for `REDIS_URL`/`S3_ENDPOINT`
- [x] `env.test.ts` new coverage
- [x] `docs/deployment.md`
- [x] Validation (typecheck/lint/test)
- [x] Docs/context updated, `git diff` reviewed

## Validation results

- `vitest run src/env.test.ts`: 6/6 new tests pass in isolation.
- `pnpm turbo run lint typecheck build test --filter='!web'` (real local
  `DATABASE_URL`): 25/25 tasks green, 305 passed + 1 skipped `apps/api`
  tests (up from 299 — the 6 new ones), no regressions.
- `NODE_ENV=production pnpm --filter web build`: succeeded, all 17 routes
  (KI-038's documented workaround for building `apps/web` outside turbo).
- `docs/deployment.md` reviewed against `docker-compose.prod.yml`/
  `deploy/Caddyfile`/every CR/ADR it references for accuracy — not
  live-verified (no Docker in this sandbox, same as every other Deployment
  artifact, KI-043/KI-045).

## Discovered issues

None beyond what Investigation already covered.

## Final result

CR-081 closed. `apps/api/src/env.ts`'s `REDIS_URL`/`S3_ENDPOINT` now
normalize an empty string to "not configured" the same way
`ERROR_REPORTING_WEBHOOK_URL` already did — KI-046 fully resolved, with new
test coverage in `apps/api/src/env.test.ts`. New `docs/deployment.md`
documents the full production deploy procedure end to end. `.env.example`
confirmed already complete — no changes needed there.
`.claude/context/known-issues.md`, `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md` all updated. Next logical task: CR-082
(pin MinIO/review base images), CR-092 (critical-journey e2e specs), or
CR-083 (registration idempotency) — no fixed order decided yet.
