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
- the session cookie named `__Host-session` in production (`Secure`, `Path=/`, no
  `Domain`) and `session` elsewhere — always via `app.sessionCookieName`
  (`plugins/auth.ts`), never a literal; a second hard-coded name makes the cookie
  unreadable in one of the two environments (CR-217);
- BullMQ jobs that carry a raw single-use token (`verification_email`,
  `password_reset_email`) keep `removeOnFail: true` — a retained failed job is a
  readable reset link in Redis (CR-217); with no queue, `/forgot-password` sends
  unawaited so its timing does not reveal whether the email exists;
- single-use tokens (verify-email, reset-password) claimed by a guarded
  `UPDATE … WHERE used_at IS NULL` inside the transaction whose row count is
  checked — the pre-check SELECT alone lets concurrent requests all pass (CR-205);
- `apps/web/next.config.ts`'s `headers()` (frame-ancestors/X-Frame-Options,
  nosniff, Referrer-Policy, HSTS) and `poweredByHeader: false`, excluding
  `/api/*`, whose headers stay helmet's (CR-205);
- the pages' CSP and Permissions-Policy live in `apps/web/src/lib/security/headers.ts`
  (CR-226), built from a browser inventory. Scripts: a per-request nonce +
  `'strict-dynamic'` from `src/proxy.ts`, never `'unsafe-inline'`; the root layout
  reads `headers()` so every page renders per request — a prerendered page has no
  nonce and the CSP blocks all its scripts; an inline `<Script>` takes the
  layout's `nonce` (ADR-036). No `'unsafe-eval'` outside dev, 2GIS only
  as `mapgl.2gis.com` (script) and `*.2gis.com` (connect/img), `blob:` workers. A new
  external origin is added there after checking a real page for
  `securitypolicyviolation`, never by loosening `default-src`. Zod runs `jitless` in
  browsers (`packages/types/src/zod-config.ts`) — dropping it brings back a CSP
  violation on every page;
- the ride forms' start time is a `TimeInput` read through its ref at save
  (CR-221) — a controlled `<input type="time">` saved a stale state value over what the
  field showed (QA live audit, 08:00 → 12:12);
- the draft form's «Опубликовать» (`EditRideForm`'s `requestPublish`) runs the same
  `saveForm()` as «Сохранить» and calls `publishRide` only after it returns `true`;
  one `busyRef` guards save and publish (CR-235) — publishing straight from the button
  sent the last saved draft and dropped what the form showed (production QA, P0);
- `DatePicker`'s day buttons set `focused` on focus only for days of the shown month
  (CR-236) — a pointer focuses on mousedown, and flipping the grid to an adjacent month
  then remounts the button and swallows the click;
- `/rides/[id]` applies a viewer's registration/waitlist change in the same update as
  the re-read counts and start number (`RideDetailView`'s `applyViewerChange`, awaited
  by `RegistrationTicket` while pending) — applying it first and re-reading after
  showed the new state over old counts (CR-239, production QA); a failed re-read falls
  back to the action's own reply;
- `AppHeader`'s phone panel (CR-240) marks everything outside the header `inert`
  while open (`lib/site/inert-outside.ts`) and must close — restoring the page — on
  Escape, a tap outside and on reaching `lg` (the panel is `lg:hidden`; staying "open"
  there would leave the whole page inert with no visible way out). The full header
  bar starts at `lg`, not `md` (CR-241: it overflowed 768–1023px);
- sideways-scrolling rows use `lib/site/scroll-row.ts` (CR-241): fade only an edge
  that hides content, and scroll a focused child clear of the fade — a fixed fade
  kept the last chip and its focus ring washed out;
- `maps-2gis` `applyFit` validates points, skips a 0×0 container (the resize observer
  re-fits) and clamps padding to the map size (CR-243) — keep that in the adapter;
- `GroupsEditor` re-reads the workspace with every list resync, conflicts included,
  and `RideWorkspace.refresh` applies only its latest reply (CR-243 — stale «N из 6»);
- `GET /v1/rides/:id/riders` hides a `participantsVisible: false` list from everyone
  but the ride's own organizer (CR-238) — the cabinet table and the ride page must
  agree with the counters the organizer sees;
- `/rides/[id]` calls `notFound()` only on the API's definite 404 (`lookupRide`), with
  no `loading.tsx`/`<Suspense>` above the page — streaming would turn the 404 back into a
  200 (CR-224, KI-096);
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
  definitions (ADR-018) — the single-VPS data services live only in the
  `docker-compose.infra.yml` overlay (ADR-031), which also derives
  `DATABASE_URL`/`REDIS_URL`/`S3_ENDPOINT`; moving to managed services means
  dropping the overlay, not editing the prod file. The smoke run layers the same
  overlay, so don't fork a smoke-only copy of it;
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
- the reCAPTCHA gate (ADR-038, CR-261) on exactly `/register`/`/login`/
  `/forgot-password`, in `preHandler` after the per-account tier (the per-IP tier runs
  earlier) so a flood never reaches Google; failing CLOSED by decision — the one
  deliberate exception to the fail-open rule above; `siteverify` never retried (a
  token is spent on the first call) and only in `recaptcha-client.ts`; the forms
  resetting the widget after every failed answer; e2e servers run with both reCAPTCHA
  keys empty;
- `/register` answering a taken email exactly like a new one (ADR-039, CR-262): same
  `201` and body (no `user` in it), one Argon2 hash on both paths, the owner's
  «Аккаунт уже есть» email sent by the verification email's delivery policy — never a
  `409`, a field error or a faster reply for an existing account; the dev-only
  `verificationUrl` is the one allowed difference. `confirmPassword`, when sent, is
  checked by `registerRequestSchema`'s refinement — the web form's and the API's one
  rule;
- the per-account rate-limit tier staying independent of the per-IP one
  (two separate gates keyed differently, not a combined key) and scoped to
  exactly `/register`/`/login`/`/forgot-password` (the three endpoints
  `.claude/rules/security.md` names) — don't extend it to
  `/verify-email`/`/reset-password`, which operate on opaque tokens, not an
  identifiable account from the request body;
- the per-account key built by `accountRateLimitKeyFactory` (an HMAC of the
  normalized email, keyed from `AUTH_SECRET`) and the fail-open warning
  logging only `err` — never a raw email in a Redis key or in that log line
  (CR-250);
- the API logger's `redact: LOG_REDACT` (`lib/log-redaction.ts`): ioredis errors
  carry `command.args` (a BullMQ job's email + one-time link) — never drop the rule
  or log an error under a key other than `err` without extending its paths (CR-251);
- joining a ride or its waitlist needs a verified email (`requireVerifiedEmail` in
  `registrations.service.ts`, CR-253), checked inside the locked transaction _after_
  the idempotent-replay return — moving it before would turn CR-083's `200` replay into
  a `403` for a registration made before the gate;
- `GET /v1/rides/:id/reviews` applies `isRidePublic` (owner excepted) and `Review`
  carries no author `userId` (CR-254, ADR-023's rule);
- upload `POST`/`PATCH` verbs (cover, GPX, both avatars) run `uploadRateLimit(app)` after
  `requireAuth` and keep no `config.rateLimit` of their own — that would replace the
  per-IP default and leave anonymous calls unlimited (CR-255);
- auth events go through `logAuthEvent` with the user id only — never an email/token
  (CR-256); logout clears the cookie with `clearSessionCookie`, never a bare
  `clearCookie` — a `__Host-` deletion without `Secure` is ignored (CR-257, KI-099);
- Dockerfile base images stay pinned by digest (`node:24-alpine@sha256:…`, CR-258);
  Dependabot's `docker` entries bump the digest — don't drop it back to a bare tag;
- maintenance mode (ADR-040, CR-265): `MAINTENANCE_MODE` read at runtime on `web` and
  `api` (never baked into a build, never failing a boot); `web` answers pages `503` +
  `Retry-After` by the proxy rewrite to `/maintenance` and the root layout drops the
  header/session there; `api` gates `/v1/*` only, `/health` and the three provider
  callbacks stay up; the proxy matcher keeps prefetches (no `missing` condition) so
  none caches a real page. Caddy's `handle_errors` fallback stays a self-contained
  file (`deploy/maintenance/index.html`) — no Next/API/font dependency. The error
  screens (`app/error.tsx`, `app/global-error.tsx`) never render the error's message,
  digest or stack;
- cover images/avatars served only through their API-proxy path (`GET
/v1/rides/:id/cover`, `/v1/users/me/avatar`, `/v1/organizers/:id/avatar`),
  never a direct S3 URL — the bucket stays private, and this is what lets
  `next.config.ts` skip an `images.remotePatterns` entry (CR-086/CR-097,
  ADR-019); file type is verified by actually decoding with `sharp`, never
  trusted from the client `Content-Type` header (SVG stays excluded — XSS
  risk); don't reintroduce a direct-URL/trust-the-extension shortcut.
  `processImage`'s JPEG/PNG/WebP signature check runs before the first `sharp`
  call (CR-214) so no other libvips parser (librsvg, TIFF, HEIF…) ever sees an
  upload — a pre-filter only, the decode still decides; keep it first;
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
- stored `routes.geometry` capped by `simplifyRouteGeometry` (`modules/rides/
route-geometry.ts`, 5,000 points) at every write path, like the preview above —
  `pointCount`/distance still come from the full track and S3 keeps the original
  GPX (CR-217); an uncapped writer lets one upload bloat every ride response;
- cover/avatar URLs ending `?v=<hash of the object key>` (`lib/image-url.ts`):
  the GET handlers send `immutable` only when `v` matches the current key, else
  `no-cache`, and a draft ride's cover is `private` (CR-217). Build image URLs
  with `versionedImagePath`, never by hand or with `Date.now()` on the client;
- `processImage` rejecting inputs over `MAX_INPUT_PIXELS` from the header before
  decoding, with `limitInputPixels` on the decode too (CR-217) — the byte-size
  cap alone does not stop a decompression bomb;
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
- `apps/web/e2e/warmup.setup.ts` (Playwright `globalSetup`) plus `next.config.ts`'s
  `onDemandEntries` (CR-212): e2e runs on `next dev`, and under Next 16 a route's
  first compile, landing while a browser is on the page, reloads that page — on a cold
  CI runner it reset `critical-journeys.spec.ts` mid-journey on every retry. Don't drop
  the warm-up or shorten `maxInactiveAge` below an e2e run's length; a spec that
  "flakes" on the cabinet skeleton is this first, not the session.
- `requireAdmin` on every `/v1/admin` route (one `preHandler` hook on the prefix, the
  capability read from `platform_admins` per request, `404` to non-admins); admin
  rights granted only by the host CLI; every admin mutation writes its `admin_actions`
  row in the same transaction (ADR-032). `isRidePublic` (`modules/rides/ride-visibility.ts`)
  is the single non-owner visibility rule — a new non-owner ride read calls it rather
  than re-checking `status`. `app/admin/layout.tsx` calls `notFound()` with no
  `loading.tsx` above it (same streaming trap as `/rides/[id]`). Admin list filters
  live only in the URL (CR-232); `lib/admin/url-filters.ts` and
  `features/admin/users/filters.ts` stay free of `'use client'` — the server
  `/admin/users/[id]` page calls them to build its back link (a client module there
  is a 500 that jsdom cannot show).
- `pnpm-workspace.yaml`'s supply-chain policies (CR-214): `blockExoticSubdeps`,
  `trustPolicy: no-downgrade` (exceptions by exact name@version in
  `trustPolicyExclude`, with a reason), Dependabot's 7-day `cooldown` on every
  ecosystem except npm, and workflow actions pinned by commit SHA with a `# vX.Y.Z`
  comment — don't put a floating `@v4` back. No pnpm `minimumReleaseAge` (CR-215) and
  no `cooldown` on Dependabot's npm entry (CR-216): Dependabot runs pnpm with
  `--config.minimum-release-age` for it, which re-checks the whole lockfile, so a
  young locked version fails every npm update job, security ones included.
- the Strava sync (ADR-033, CR-234): no Strava access/refresh token is ever persisted or
  logged — `completeStravaSync` holds it in a local and revokes the grant in `finally`
  on every path (also when the gate fails after the exchange); the callback route keeps
  `logLevel: 'warn'` so the `code` stays out of request logs; the signed `state` must
  match the session's user; the organizer's list carries only `stravaVerified` — never
  Strava distance/time/track (Strava API Agreement). Strava HTTP only in
  `modules/strava/strava-client.ts`.
- Google sign-in (ADR-034, CR-247): Google HTTP only in `modules/auth/google-client.ts`
  (openid-client `customFetch` through `packages/resilience`; the code exchange never
  retried); no Google token persisted or logged, the callback keeps `logLevel: 'warn'`;
  the `state` compared with the signed transaction cookie before any Google call, the
  cookie cleared on every callback (with `secure` in production — a `__Host-` deletion
  without it is ignored); email-based linking onto a verified account, or (ADR-035,
  CR-249) claiming an unverified one only together with voiding its password, every
  session and pending verify/reset link — never linking it with any of them intact —
  inside one transaction (`FOR UPDATE` + `ON CONFLICT DO NOTHING` on `users_email_unique` and
  `auth_identities_provider_account_unique`); `loginUser` keeps the decoy verify for a
  `null` `password_hash`.
- Yandex ID sign-in (ADR-037, CR-260) follows the same invariants: Yandex HTTP only in
  `modules/auth/yandex-client.ts` (resilience, the code exchange never retried), the
  access token a local of `completeSignIn`, `logLevel: 'warn'` on the callback, the
  cookie cleared on every callback, `state` checked before the query's `error`/`code`
  are believed; account rules only via `signInWithOAuth` (`oauth-sign-in.service.ts`,
  shared with Google). The transaction cookie's HMAC label is per provider — keep
  Google's `coffee-ride/google-oauth-transaction/v1` unchanged. Their auth events go
  through `app.log` with `reqId` — the callbacks' request log drops `info` (CR-260).
- legal consents (ADR-041, CR-268): an account is never created without both
  acceptances in the same transaction — `registerRequestSchema.consents` is required,
  and a first Google/Yandex sign-in goes through `oauth_pending_signups` +
  `/register/consent` (`signInWithOAuth(…, { allowCreate: false })` in the callbacks —
  never `true` there). A published document version is immutable: change the text →
  add a version in `packages/types`' `LEGAL_DOCUMENTS` (`legal-content.test.ts` pins
  each hash); the API records the registry's version and hash, never the client's.
  `requireAuth` refuses unsafe methods with `403 legal_acceptance_required` while a
  material version is pending — a route that must stay open (logout, the acceptance)
  says so with `config.legalAcceptanceExempt`, never by skipping `requireAuth`. The
  pending sign-up cookie carries only the random token (no identity/email); its
  completion consumes the row by `DELETE … RETURNING` inside the creating transaction.
  An ADR-035 claim deletes the registrant's acceptances.
