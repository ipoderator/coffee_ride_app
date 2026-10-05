---
paths:
  - 'apps/**'
  - 'packages/**'
  - 'deploy/**'
  - 'docker-compose*.yml'
  - '.github/**'
  - 'load/**'
  - 'scripts/**'
  - 'turbo.json'
  - 'package.json'
---

# Do Not Break

Invariants a change must preserve — moved verbatim from `project-state.md` by CR-203,
made a path-scoped rule by CR-204 so it loads **whole** whenever code, infra or CI
files are touched (a keyword grep can miss an invariant worded differently from the
task). While planning, before any matching file is opened, read it explicitly.
`/review` and `close-task` check the diff against it. Add a bullet when a CR
establishes a new non-obvious invariant.

- documented stack;
- domain terminology;
- API/database boundaries;
- the API contract shape: `/v1`, cursor pagination, RFC 9457 errors (ADR-011);
- `timestamptz` + ride-local timezone (ADR-012);
- session revocation semantics and the single-origin/no-CORS posture (ADR-013);
- server-side registration invariants;
- `POST /v1/rides/:id/register`/`POST /v1/rides/:id/waitlist` replying `200`
  with the existing row (not an error, not a duplicate) on a repeat call
  for the same already-active registration/already-waiting entry (CR-083)
  — don't reintroduce the `409` on this specific retry path; the _other_
  "already" conflicts (`ride_full`, `ride_not_full`, an active registration
  blocking a waitlist join) are unaffected and must stay errors;
- `POST /v1/auth/forgot-password` returning an identical `204` regardless of
  whether the email exists, in every environment — no dev-only token field on
  this endpoint, unlike `register`'s `verificationUrl` (CR-060,
  `.claude/rules/security.md`);
- a password reset revoking every session for that user and invalidating
  every other outstanding reset token for that user (CR-060);
- single-use tokens (verify-email, reset-password) claimed by a guarded
  `UPDATE … WHERE used_at IS NULL` inside the transaction whose row count is
  checked — the pre-check SELECT alone lets concurrent requests all pass (CR-205);
- `apps/web/next.config.ts`'s `headers()` (frame-ancestors/X-Frame-Options,
  nosniff, Referrer-Policy, HSTS) and `poweredByHeader: false`, excluding
  `/api/*`, whose headers stay helmet's (CR-205);
- `@fastify/helmet`'s CSP staying `upgrade-insecure-requests`-free (this app
  doesn't terminate TLS itself — that directive would break `/docs` over
  local `http://`) and `frame-ancestors`/`X-Frame-Options` staying
  `'none'`/`DENY` (CR-061);
- `apps/api/scripts/build.mjs`'s `external` computation staying derived from
  the union of `dependencies` across `apps/api` + every bundled workspace
  package (`db`/`types`/`resilience`), not just `apps/api`'s own
  `package.json` — and never bundling a real npm dependency (especially
  `argon2`, a native addon) into `dist/server.js` (ADR-017);
- `apps/api/package.json`'s `"files": ["dist"]` and the `inject-workspace-
packages=true` env var scoped to the one `pnpm --filter=api deploy` `RUN`
  step in `apps/api/Dockerfile` (not a repo-wide `.npmrc`, which would change
  how ordinary `pnpm install` resolves workspace:* dependencies everywhere —
  CR-074); `apps/web/Dockerfile`'s `runner` stage copying `.next/standalone`,
  `.next/static`, and `public` together (Next's own standalone-output tracing
  caveat — `apps/web`/`next.config.ts`'s `output: 'standalone'`, CR-074);
- server-side authorization checks (never UI-only — `.claude/rules/security.md`);
- the `packages/maps-core` boundary (no direct 2GIS SDK imports outside
  `packages/maps-2gis` — `.claude/rules/maps.md`, lint-enforced since CR-056:
  don't add `*2gis*`-matching packages to `no-restricted-imports`'s
  exemption list anywhere but `maps-2gis`'s own config);
- the loopback binding of infrastructure ports in `docker-compose.yml`;
- one shared timeout/retry/circuit-breaker implementation (`packages/resilience`,
  ADR-016) for every external integration — don't hand-roll a new ad hoc wrapper;
- notification producers falling back to a direct synchronous insert when
  `app.notificationQueue` is `null` (`REDIS_URL` unconfigured) — this is what keeps
  every existing test passing with no live Redis (CR-050);
- the shared `raceTimeout` helper (`apps/api/src/lib/race-timeout.ts`) around
  `bullmq` calls and the DB/Redis health checks — `callWithResilience` does not
  bound them (no `AbortSignal` support), so don't "simplify" this back to a bare
  `callWithResilience` call;
- `GET /health` always returning `200` with per-dependency `not_configured` vs.
  `error` distinguished — an absent optional dependency (Redis/S3 unconfigured) must
  never read as a failure (`.claude/rules/resilience.md`);
- feature-module isolation between organizer/participant cabinet features
  (`.claude/rules/extensibility.md`);
- Caddy proxying to `web` only, never directly to `api` (`docker-compose.
prod.yml`, ADR-018) — `apps/web/next.config.ts`'s rewrite is the one place
  `/api/v1/*` routing happens; don't add a second `/api` route at the proxy
  layer;
- `api`'s `WEB_ORIGIN` staying derived as `https://${DOMAIN}` inside
  `docker-compose.prod.yml` rather than a second, independently-set variable
  (ADR-018) — letting it drift from `DOMAIN` would silently break the CSRF
  Origin/Referer check;
- `docker-compose.prod.yml` staying free of Postgres/Redis/S3 service
  definitions (ADR-018 "What this does NOT mean") — that's a still-open
  production-hosting decision, not this file's to make;
- the `migrate` service staying behind the `migrate` Compose profile — never
  started by a plain `docker compose up`, and never wired into `apps/web`'s or
  `apps/api`'s own service definition or boot sequence (CR-076);
- `packages/db/src/migrate.ts`'s session-level advisory lock (`pg_advisory_
lock`/`unlock` around the whole `migrate()` call, same `{ max: 1 }` client
  for both) — this is what makes concurrent invocation safe (KI-002); don't
  "simplify" it back to a bare `migrate()` call, and don't swap the client for
  a `client.reserve()` connection either — drizzle's postgres-js driver reads
  `client.options`, which a reserved connection doesn't expose;
- every unexpected 500 (`error-handler.ts`) and every notification job
  failed-after-retries (`queue.ts`'s `worker.on('failed', ...)`) routing
  through `app.reportError`, not a direct `*.log.error(...)` call (CR-079) —
  that's what keeps "must be visible" meaning the same thing in both places;
  connection-level `.on('error', ...)` noise (Redis, BullMQ queue/worker)
  deliberately stays outside this funnel;
- `lib/request-id.ts`'s bounded charset/length check on an inbound
  `X-Request-Id` header before it's trusted into every log line (CR-079) —
  don't relax it to accept an arbitrary client-supplied value verbatim;
- `route-storage.live.test.ts`'s `RUN_LIVE_S3_TESTS === '1'` gate staying an
  explicit opt-in, not just "are `S3_*` set" (CR-080) — a local `.env` has
  them configured for MinIO whether or not MinIO is actually running, and
  this session hit that exact false positive before adding the flag; only
  `ci.yml` should ever set it;
- `playwright.config.ts`'s `webServer` staying a two-entry array (`apps/api`
  then `apps/web`, CR-080) — `/` has called the real API since CR-024, so a
  lone `apps/web` dev server is no longer sufficient for any e2e spec here.
- `apps/api` test files reading `TEST_DATABASE_URL` via
  `test-support/test-database-url.ts`'s `getTestDatabaseUrl()`, never
  `process.env.DATABASE_URL` directly (CR-095, KI-049) — don't reintroduce a
  direct `DATABASE_URL` read in a new test file; the disposable-name guard
  only protects files that go through this helper;
- the `docker-compose.prod.yml` `backup` service staying un-gated (no
  `migrate`-style profile) — it's read-only against the database and meant
  to run by default; and its shell command's `$$BACKUP_INTERVAL_SECONDS`
  staying double-escaped (Compose interpolates a bare `$VAR` itself at
  config-render time otherwise, turning it into an empty string);
- both rate-limit tiers (`app.ts`'s global `@fastify/rate-limit`
  registration and `lib/account-rate-limit.ts`'s per-account check, CR-058)
  failing OPEN on a Redis error/timeout, never closed — login/register are
  critical journeys (`.claude/rules/resilience.md`); don't add a
  `skipOnError: false`/fail-closed path "for security" without re-reading
  that rule first;
- the per-account rate-limit tier staying independent of the per-IP one
  (two separate gates keyed differently, not a combined key) and scoped to
  exactly `/register`/`/login`/`/forgot-password` (the three endpoints
  `.claude/rules/security.md` names) — don't extend it to
  `/verify-email`/`/reset-password`, which operate on opaque tokens, not an
  identifiable account from the request body;
- cover images/avatars served only through their API-proxy path (`GET
/v1/rides/:id/cover`, `/v1/users/me/avatar`, `/v1/organizers/:id/avatar`),
  never a direct S3 URL — the bucket stays private, and this is what lets
  `next.config.ts` skip an `images.remotePatterns` entry (CR-086/CR-097,
  ADR-019); file type is verified by actually decoding with `sharp`, never
  trusted from the client `Content-Type` header (SVG stays excluded — XSS
  risk); don't reintroduce a direct-URL/trust-the-extension shortcut;
- `lib/image-processing.ts`/`lib/image-storage.ts` (relocated from
  `modules/rides/cover-image*.ts`, CR-097) are shared by `rides`, `users`,
  and `organizers` — don't move them back into one capability module, and
  don't let `users`/`organizers` import a `rides`-owned file directly if a
  fourth caller ever needs this pipeline again;
- `users`/`organizers` avatar _mutations_ stay "me"-scoped only (no `:id`
  variant for either). Reads: the organizer avatar download is public and
  keyed by `:id` (`GET /v1/organizers/:id/avatar`) since an organizer's
  identity is already public via `RideOrganizerSummary`. CR-126 added the one
  other exception — `GET /v1/rides/:id/riders/:registrationId/avatar` — but
  it is _not_ a `users/:id` route: it's keyed by ride+registration, gated by
  `resolveRiderAccess`, and never resolvable from a bare user id. There is
  still no `GET /v1/users/:id` of any kind — don't add one; a cross-
  participant need goes through the ride-scoped pattern ADR-023 established,
  not a new bare-id route;
- `resolveRiderAccess` (`apps/api/src/modules/registrations/
registrations.service.ts`, ADR-023) is the one place the rider-profile/
  avatar tier logic lives — don't duplicate the `closed`/`co_participants`/
  `open` check anywhere else; both routes call it. It never selects
  `phone`/`email` regardless of tier — don't widen that select to "just this
  one extra field" later without re-reading ADR-023;
- `user_bikes`' partial unique index (`user_bikes_one_active_per_user`) is
  the actual "at most one active bike" invariant — `users.service.ts`'s
  create/update transactions unset the previous active bike as a matching
  courtesy, not the source of truth;
- the render-layer/server-provider split in `packages/maps-core`
  (`render.ts`'s `MapRenderer` vs. `provider.ts`'s `MapProvider`) — don't
  merge them onto one interface; server code must never see a render method
  (CR-098, ADR-020);
- exactly one file, `apps/web/src/lib/maps/create-map-renderer.ts`, imports
  `maps-2gis` — don't add a second import site, and don't widen its
  `eslint.config.mjs` override beyond that one `files` path;
- `DiscoveryMap`'s fallback to `RideMapPlaceholder` on a missing key or a
  failed `render()`/`load()` call — never let a map surface show a blank
  panel (`docs/design.md` §10);
- `packages/maps-2gis/src/render.ts`'s per-container `containerGeneration` guard in
  `create2GisMapRenderer` — a `render()` call whose generation gets superseded while
  the SDK is still loading must keep returning an inert no-op `MapHandle`, never
  constructing a second live `mapglAPI.Map` on a container another call already claimed
  (CR-101) — this is what keeps React Strict Mode's dev-only double-effect-invoke from
  silently blanking the map.
- no hand-written unlayered CSS class competing with Tailwind utilities — an
  unlayered rule unconditionally outranks every `@layer utilities` rule regardless of
  source order and silently breaks a caller's own `md:`-style reset (found before
  shipping in CR-107);
- `<html lang="ru">` in `apps/web/src/app/layout.tsx` — Sofia Sans Extra Condensed's
  Russian letterforms come from `locl` and need it (ADR-021);
- the role type scale (ADR-026): text in `apps/web`/`packages/ui` uses a role utility
  (`text-h2`, `text-body-sm`, `text-label`, …) or `text-xs`, never `text-sm`/
  `text-base`/arbitrary `text-[…]`; a new role name must also go into
  `packages/ui/src/lib/cn.ts`'s `TEXT_ROLES` or tailwind-merge drops it; `app/icon.svg` repeats
  the two `primary` hex values and must be kept in step with `tokens.css` by hand;
- the plum overprint (`primary`/`route`) staying reserved for the route line and the
  primary action — no second accent, no map-themed decoration (ADR-021);
- the composite FK `(group_id, ride_id) → ride_groups(id, ride_id)` on
  `registrations`/`waitlist_entries` (a group can only belong to the same ride) and
  the `group_required`/`group_not_found` checks staying inside the existing locked
  registration transaction (ADR-022);
- `GET /v1/rides/:id/riders` staying signed-in only and returning display name +
  group + (CR-126) an opaque `registrationId` — never a raw user id, email,
  phone or emergency data (ADR-022, CR-117, ADR-023);
- `DiscoveryMap`'s markers following the filtered ride list (CR-118 fixed markers
  that never updated after the first render).
- `routes.preview` is written together with `routes.geometry` — every write path
  calls `buildRoutePreview` (KI-058); a new writer (seed, script, test insert) must
  too, or that ride's discovery card shows no track;
- `TRUST_PROXY_HOPS` only on an `api` reachable solely through `web` (no `ports:`
  in `docker-compose.prod.yml`) — `lib/trust-proxy.ts` trusts private peers only,
  but the hop count still assumes exactly that chain (KI-044);
- `apps/api/src/preflight.ts` stays a **warning** tier and never refuses a boot
  (CR-210): `loadEnv()` is the only thing that decides what boots, and every
  configuration it accepts — an unconfigured Redis, S3, 2GIS key or email provider —
  is a deliberately supported degraded mode (ADR-016, KI-046, `GET /health`'s
  `not_configured`). Turning a finding into a boot failure, or making
  `pnpm preflight` exit non-zero on warnings, would break exactly the degraded
  deployments the rest of the codebase is built to support; findings also stay free of
  configuration _values_, naming fields only (`.claude/rules/security.md`).
- `ToastProvider`'s timer bookkeeping (`packages/ui/src/components/Toast.tsx`,
  CR-207): every auto-dismiss/exit `setTimeout` goes through `schedule()` and is
  cleared on unmount — a bare `setTimeout` here fires `setToasts` after the
  provider is gone, which under jsdom throws an uncaught `ReferenceError`
  (`window` undefined after teardown) and fails the whole Vitest run with every
  test still passing.
- `VerifyEmailStatus`'s per-token promise cache (`apps/web/src/features/auth/
verify-email/components/VerifyEmailStatus.tsx`, CR-211): the single-use
  verification token is sent to the API exactly once per token, no matter how often
  the effect runs. e2e serves the web app with `pnpm dev`, so React Strict Mode's
  dev-only double-invoke otherwise makes the component race itself — the second call
  gets `verification_token_already_used` and «Ссылка недействительна…» renders over a
  verification that succeeded (this failed `login-return.spec.ts` on every CI retry).
  The `cancelled` flag does not cover it: it gates `setState`, not a request already
  in flight. Don't "simplify" the cached promise into a boolean re-entry guard either
  — the second effect run must still subscribe to the first run's promise, or the
  screen sits on the skeleton forever.
