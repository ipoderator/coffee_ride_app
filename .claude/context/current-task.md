# Current task — CR-217 security-review fixes + CR-218 single-VPS deploy readiness — DONE (validated, committed)

Source: owner, 2026-10-07 — "нужно все исправить и подготовить проект для деплоя на
сервер", after `/security-review` on `12f8bf4` (no CRITICAL/HIGH/MEDIUM; findings below).
Owner decisions: Postgres, Redis and S3 all on **one VPS** (ADR-031); the owner uploads
to the server themselves ("через hermes бота") — no server access from here.
Committed as one commit. `.claude/settings.json` was already dirty before this task
(owner's change) — not part of it, don't commit it with this work.

## CR-217 — security fixes (code DONE, tests green on touched suites)

1. Raw tokens in Redis: `queue.ts` — `verification_email`/`password_reset_email` jobs
   `removeOnFail: true` (others keep 200). Test in `queue.test.ts`.
2. `/forgot-password` timing with no queue: `sendPasswordResetEmail` sends unawaited
   when `queue === null` (`notifications.service.ts`). 2 tests.
3. KI-093 lead 4: session cookie `__Host-session` in production, `session` elsewhere —
   `plugins/auth.ts` `sessionCookieName()` + `app.sessionCookieName` decorator
   (registered in `app.ts` after `@fastify/cookie`); `auth.routes.ts` uses it.
   Test in `auth.routes.test.ts` (prod env built without `loadEnv`; it logs at info — noisy).
   Changing the name logs everyone out once — fine pre-launch.
4. KI-093 lead 2: `processImage` rejects > `MAX_INPUT_PIXELS` (50 MP) from header
   metadata, plus `limitInputPixels` on the decode. Test with a hand-built PNG IHDR bomb.
5. KI-094 + KI-093 lead 3: new `lib/image-url.ts` (`versionedImagePath`,
   `imageCacheControl`, `imageVersionQuerySchema`). Every cover/avatar URL now ends
   `?v=<16-char sha256 of object key>`; GET handlers send `immutable` only when `v`
   matches, else `no-cache`; draft ride cover is `private`. Download services return
   `objectKey` (+ `isPublic` for cover). Web upload forms no longer append
   `?v=Date.now()` (3 forms). **Contract change** (URL values gain a query string) —
   record in changelog/`docs/api.md`.
6. KI-093 lead 1: new `modules/rides/route-geometry.ts` — stored `routes.geometry` capped
   at 5,000 points (stride pre-thin to 4× then Douglas–Peucker, elevation kept) at all 3
   write sites in `rides.service.ts`; `pointCount`/distance still from the full track;
   S3 keeps the original GPX. 437k-point track: 426 ms. Existing rows are not rewritten
   (no prod data yet).

## CR-218 — deploy readiness (mostly DONE)

- Found bug: `docker-compose.prod.yml` never passed `UNISENDER_API_KEY`,
  `UNISENDER_API_URL`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` to `api` — email dead in
  prod. Fixed. Also `env.ts`: empty `UNISENDER_API_URL`/`EMAIL_FROM_NAME` now fall back
  to defaults (empty URL used to fail boot). Test in `env.test.ts`.
- `docker-compose.prod.yml`: log rotation anchor (json-file 10m × 5) on all services;
  header updated.
- New `docker-compose.infra.yml` overlay: postgres 17, redis 8 (requirepass,
  noeviction, AOF), SeaweedFS 4.47 + `s3-init`; no ports; healthchecks; derives
  `DATABASE_URL`/`REDIS_URL`/`S3_ENDPOINT` for api/migrate/backup.
  `docker compose ... config` validated.
- New `deploy/deploy.sh` (checks .env → build → data services `--wait` → s3-init →
  migrate → up → prints `"preflight":true` warnings) and `deploy/production.env.example`.
- Smoke (`deploy/smoke/*`) now layers the infra overlay; adds `/health` all-ok probe and
  a backup → restore round trip (`drizzle.__drizzle_migrations` count > 0).
- ADR-031 appended to `docs/decisions.md`; `docs/deployment.md` rewritten for the
  single-VPS flow (off-host backup copy example, restore command, managed-services path).

## Validation so far

- api: queue/notifications 18/18; auth routes 49 passed/3 skipped; image-processing
  11/11; cover/users/organizers/rider-profile 80/80 (after updating URL assertions to
  `versioned()`); route-geometry/route/route-builder/gpx 51/51; env/preflight 23/23;
  `tsc --noEmit` OK. Needs `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/coffee_ride`.
- web: cover-image + profile features 63/63.
- **Docker smoke with the infra overlay: GREEN locally (EXIT 0)** — `/api/v1/rides` 200
  through web; rate limiter per-client (KI-044); `/health`
  `{"status":"ok","dependencies":{"db":"ok","redis":"ok","s3":"ok"}}`; backup → restore
  into a fresh DB restored 26 applied migrations. Not yet run in CI (nothing pushed).

## Final result

All steps done 2026-10-07. Added after the handoff: `deploy/FIRST-DEPLOY.md` moved to
`deploy/deploy.sh`/`dc`; `do-not-break.md` bullets (infra overlay, `__Host-session`,
token jobs, geometry cap, versioned image URLs, pixel cap); `resilience.md` notes the
unawaited reset send; `docs/api.md` "Image URLs and caching".
Coverage gate caught `notifications/` −1.63 pp functions: the early `!queue` return made
`enqueueOrDeliver`'s deliver callback for the reset email unreachable. Fix: the
unawaited send now lives in that callback (no early return).
Full gates: api 634/634 (live S3/Redis) + `coverage:check` exit 0; all packages
`test:coverage` green; Storybook 196/196; `turbo typecheck lint` green; api build;
Prettier on touched files. `format:check`/`lint:root` fail only on the locally
excluded `brag-output/` (not in the repo). `web` build not run locally (dev server on
:3000) — the web image was built by the green Docker smoke after the web edits.
Context closed: changelog CR-217/CR-218, tasks (5 archived), project-state,
architecture-map, KI-093/KI-094 archived, KI-045 updated.
Commit: owner's call — two commits (`fix: CR-217 …`, `feat: CR-218 …`), excluding
`.claude/settings.json`.

## Not done / out of scope

- Dependabot PRs (CR-208, 14 open) — untouched. `braces` alert #18 has no fix (KI-095).
- Off-host backups: documented only (ADR-031 consequence).
