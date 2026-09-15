# MVP Backlog

## Pre-foundation hardening

Decisions and config that are cheap now and a breaking change once code exists — done
2026-09-11 before CR-001, see `docs/changelog.md`.

- [x] CR-067 Node 24 LTS, exact `packageManager` version, CI token permissions, root lint
      actually running in CI
- [x] CR-068 Declare environment in `turbo.json` (Turborepo 2 strict env mode)
- [x] CR-069 API contract: `/v1` prefix, cursor pagination, RFC 9457 errors — ADR-011
- [x] CR-070 `timestamptz` everywhere + ride-local IANA timezone — ADR-012
- [x] CR-071 Split 2GIS keys: public MapGL vs server-side Geocoder/Directions
- [x] CR-072 Bind local infrastructure ports to `127.0.0.1`
- [x] CR-087 Run Prettier over the whole repository as one isolated commit — done
      2026-09-12, formatting-only, see `docs/changelog.md`.
- [x] CR-073 Zod environment validation at API startup; refuse to boot in production on
      placeholder/missing values — done 2026-09-12 inside CR-003
      (`apps/api/src/env.ts`).

## Foundation

- [x] CR-001 Initialize pnpm/Turborepo monorepo — done 2026-09-12: `pnpm-lock.yaml`
      generated, `tsconfig.base.json` added, root scripts and turbo tasks verified
      against zero packages. See `docs/changelog.md`.
- [x] CR-002 Configure Next.js web — done 2026-09-12: `apps/web` scaffolded
      (Next.js 15, Tailwind v4, shadcn/ui foundation), turbo lint/typecheck/build
      verified. See `docs/changelog.md`.
- [x] CR-003 Configure Fastify API — done 2026-09-12: `apps/api` scaffolded
      (Fastify 5, ESM, Zod validation via `@fastify/type-provider-zod`, RFC 9457
      error envelope, OpenAPI at `/docs`, `/health` stub, `/v1` prefix wired).
      Includes CR-073. See `docs/changelog.md`.
- [x] CR-004 Configure PostgreSQL + Drizzle — done 2026-09-12: `packages/db`
      scaffolded (Drizzle + drizzle-kit + `postgres` driver), zero domain
      tables by design (first table lands with CR-011). See
      `docs/changelog.md`.
- [x] CR-005 Configure Redis — done 2026-09-12: `ioredis` client factory added
      to `apps/api` (`src/redis.ts`), no consumer yet (ADR-004: only when
      justified — CR-050/CR-058). Live connection not verified this session
      (KI-014). See `docs/changelog.md`.
- [x] CR-006 Configure MinIO/S3 adapter — done 2026-09-12: `@aws-sdk/client-s3`
      client factory added to `apps/api` (`src/s3.ts`), no consumer yet
      (CR-027/CR-086 wire it in). Live connection not verified this session
      (KI-015). See `docs/changelog.md`.
- [x] CR-007 Configure shared packages — done 2026-09-12: `packages/config`
      (shared Node-library tsconfig fragment + ESLint factory, closes KI-013
      forward), `packages/types` (RFC 9457 `ProblemDetails` + ADR-011
      `Paginated<T>`, wired into `apps/api`'s error handler as a real
      consumer), `packages/ui` (empty scaffold, content starts CR-063),
      `packages/maps-core` (full `MapProvider` interface per ADR-010, pure
      types), `packages/maps-2gis` (adapter calling 2GIS's Geocoder/Routing
      REST APIs directly, no SDK dependency; not wired into any route yet).
      See `docs/changelog.md`.
- [x] CR-008 Configure Vitest/Playwright — done 2026-09-12: Vitest wired for
      `apps/api` (real tests against `buildApp()` via `.inject()`: `/health`,
      404 RFC 9457 envelope, Zod validation → 400, thrown errors → 500/403),
      `packages/maps-2gis` (11 unit tests against `create2GisMapProvider`
      with `fetch` mocked — parsing, fallbacks, non-2xx/timeout/malformed-
      JSON normalization into `MapProviderError`), and `apps/web` (jsdom +
      React Testing Library smoke test on the placeholder home page).
      Playwright wired for `apps/web` e2e (one smoke spec, live-verified
      against a real `next dev` server). Shared
      `packages/config/vitest/node-library.js` fragment for the two
      plain-Node consumers. Fixed a real tsconfig `extends`-chain bug surfaced by Vite 8's oxc transform
      (KI-018, resolved same session) along the way. Not wired into CI
      (KI-007 stays open — CR-080's job). See `docs/changelog.md`.
- [x] CR-009 Configure Docker Compose — done 2026-09-13: fixed two real bugs in the
      compose file that predated this CR (KI-004 MinIO healthcheck used `curl`, which
      the image doesn't ship — switched to `mc ready local`; KI-005 `minio/minio:latest`
      unpinned — pinned to `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`, also
      switching registries since MinIO's own docs now point at quay.io only), added a
      missing Redis healthcheck, and added `pnpm infra:up`/`infra:down` root scripts.
      Docker's daemon is still unreachable in this environment (KI-019, same standing
      constraint as KI-014/KI-015) — validated via `docker compose config` only, not a
      live boot. See `docs/changelog.md`.
- [x] CR-010 Configure CI + Git hooks — done 2026-09-13: fixed the one real bug
      already tracked against this area (KI-012 — lint-staged's pre-commit ESLint
      step ran with CWD at the repo root, so staged `apps/*`/`packages/*` files were
      never actually ESLint-checked at commit time, only Prettier-formatted). Root
      `package.json`'s `lint-staged` config now has one glob entry per workspace
      member, each running `pnpm --filter <name> exec eslint --fix` so the package's
      own `eslint.config.mjs` resolves correctly. Verified live: staged a real
      unused-variable violation in `apps/web`, confirmed it went undetected under the
      old config and correctly caught under the new one. CI (`ci.yml`) reviewed and
      left unchanged — its remaining gaps (MinIO/migrations/Playwright, KI-007) are
      explicitly CR-080's scope, not this task's. See `docs/changelog.md`.

## Design foundations

Must land before the first user-facing screen (CR-011's register form) — see
`docs/design.md`. Retrofitting tokens, formatters and states after the screens exist is a
rewrite, not a polish pass.

- [x] CR-063 Design tokens in `packages/ui` (light + dark palette, typography, spacing,
      radius) exposed via the Tailwind theme; lint rule rejecting raw hex colors in
      `apps/web` — done 2026-09-13: `packages/ui/src/tokens.css`, Golos Text/IBM Plex
      Mono wired via `next/font/google` in `apps/web`'s layout. See `docs/changelog.md`.
- [x] CR-064 Russian formatters (distance/elevation/pace/duration/date/time/price/
      participants) and the UI terminology mapping (status, bicycle type, services) as
      one shared, unit-tested module — done 2026-09-13:
      `packages/ui/src/{format,terminology}.ts`. See `docs/changelog.md`.
- [x] CR-065 Metric presentation components: `MetricTile`, `MetricRow`, `StatusBadge`,
      `DifficultyScale` — done 2026-09-13: `packages/ui/src/components/`. See
      `docs/changelog.md`.
- [x] CR-066 Shared state primitives: `Skeleton`, `EmptyState`, `ErrorState` + the
      degraded-state pattern used by CR-052 — done 2026-09-13:
      `packages/ui/src/components/`. See `docs/changelog.md`.

## Auth

- [x] CR-011 User registration — done 2026-09-13: `users`/`email_verification_tokens`
      tables (`packages/db`), `POST /v1/auth/register` + `POST /v1/auth/verify-email`
      (`apps/api/src/modules/auth`), `/register` screen (`apps/web`). See
      `docs/changelog.md`.
- [x] CR-012 Login/logout/session — done 2026-09-13: `sessions` table
      (`packages/db`), `POST /v1/auth/login` + `POST /v1/auth/logout` +
      `GET /v1/auth/me` (`apps/api/src/modules/auth`), database-backed
      sessions per ADR-013 (opaque cookie, SHA-256 hash at rest, rolling
      30-day expiry), and ADR-013's Origin/Referer CSRF check on every unsafe
      `/v1` method (`apps/api/src/plugins/csrf.ts`). See `docs/changelog.md`.
- [x] CR-013 Profile — done 2026-09-14: `displayName`/`phone`/`bio` nullable
      columns on `users` (`packages/db`), `PATCH /v1/users/me`
      (`apps/api/src/modules/users`, `GET /v1/auth/me` already returns the
      full profile — no separate GET), `/login` + `/me` + `/me/profile`
      screens (`apps/web`), first real ADR-009 participant cabinet nav
      registry. Avatar/photo upload deferred (KI-023, needs CR-086's S3
      pipeline). See `docs/changelog.md`.

## Organizer

- [x] CR-014 Organizer profile — done 2026-09-14: `organizer_profiles` table
      (`packages/db`, one per `User`, ADR-006), `POST`/`GET`/`PATCH` under
      `/v1/organizers/me` (`apps/api/src/modules/organizers`, creation gated
      on `emailVerified`), `/organizer/profile` screen (`apps/web`,
      create-or-edit in one form), first real ADR-009 organizer cabinet nav
      registry (`CabinetShell` generalized to serve both cabinets). See
      `docs/changelog.md`.
- [x] CR-015 Organizer dashboard — done 2026-09-14: `/organizer` renders a real
      ADR-009 widget registry (`lib/cabinet/organizer-widgets.ts`,
      `DashboardWidget` descriptor) instead of the CR-014 stub; one widget so
      far, `OrganizerProfileWidget` (organizer-profile summary, reuses
      `GET /v1/organizers/me`). See `docs/changelog.md`.
- [x] CR-016 Organizer authorization — done 2026-09-14, alongside CR-018: the
      first real ownership check on an _existing_ ride (`GET`/`PATCH /v1/
rides/:id` 404 `ride_not_found` for a ride that doesn't exist or isn't
      the caller's — deliberately the same response either way). See
      `docs/changelog.md`.

## Rides

- [x] CR-017 Create ride — done 2026-09-14: first `Ride` table (`packages/db`,
      owned by `OrganizerProfile`, ADR-006), `POST /v1/rides`
      (`apps/api/src/modules/rides`, requires an `OrganizerProfile`, creates a
      minimal `draft` — only `title`/`bicycleType`/`startsAt`/`startTimezone`,
      everything else `null` until CR-018), `/organizer/rides/new` screen
      (`apps/web`). Moved `RideStatus`/`BicycleType`/`DifficultyLevel` from
      `packages/ui` to `packages/types` (architecture fix — `apps/api` can't
      depend on `packages/ui`). See `docs/changelog.md`.
- [x] CR-088 Organizer rides list (new ticket, added this session — see
      `.claude/context/known-issues.md` KI-024) — done 2026-09-14:
      `GET /v1/rides/mine`, the API's first cursor-paginated collection
      endpoint (ADR-011, `apps/api/src/lib/cursor.ts`); `/organizer/rides`
      screen grouping the caller's own rides by status. See
      `docs/changelog.md`.
- [x] CR-018 Edit draft — done 2026-09-14, together with CR-016: `GET`/
      `PATCH /v1/rides/:id` (draft-only, 409 `ride_not_editable` once
      published), `/organizer/rides/[id]/edit` filling in every field CR-017
      left `null`. No migration needed — CR-017's schema already had every
      column. See `docs/changelog.md`.
- [x] CR-019 Publish ride — done 2026-09-14: `POST /v1/rides/:id/publish`
      (`draft -> published` only — `docs/product.md`'s further lifecycle
      states have no ticket yet, see `.claude/context/known-issues.md`
      KI-025), gated on `emailVerified` per `.claude/rules/security.md`
      (closes CR-059's remaining scope). `/organizer/rides/[id]/edit` gained
      a "Опубликовать" button next to Save. See `docs/changelog.md`.
- [x] CR-089 Open registration (new ticket, added this session — see
      `.claude/context/known-issues.md` KI-025) — done 2026-09-14: a new
      publish endpoint takes a ride from `published` to `registration_open`,
      resolving KI-025 (no ticket previously transitioned a ride into that
      state at all).
- [x] CR-020 Close registration — done 2026-09-14, together with CR-089: a
      matching endpoint takes a ride from `registration_open` to
      `registration_closed`. Neither transition gates on `emailVerified` —
      only `publish` is named by `.claude/rules/security.md`.
      `/organizer/rides/[id]/edit` gained the matching "Открыть
      регистрацию"/"Закрыть регистрацию" buttons.
- [x] CR-021 Cancel ride — done 2026-09-15: `POST /v1/rides/:id/cancel`
      (`published`/`registration_open`/`registration_closed → cancelled`,
      `docs/product.md`'s Lifecycle). Same ownership rule as every other
      transition (404 `ride_not_found` either way); one new 409 code,
      `ride_not_cancellable`, covering every other status. New `Button`
      `danger` variant; `/organizer/rides/[id]/edit` gained a red "Отменить
      заезд" button guarded by a native `window.confirm()`.
- [x] CR-090 Start ride (new ticket, added this session — see
      `.claude/context/known-issues.md` KI-027) — done 2026-09-15: a new
      endpoint takes a ride from `registration_closed` to `started`,
      resolving KI-027 (no ticket previously transitioned a ride into that
      state at all — same shape of gap as KI-024/KI-025).
- [x] CR-022 Finish ride — done 2026-09-15, together with CR-090: a new
      `POST /:id/finish` endpoint (`started → finished`, the last lifecycle
      transition). Same ownership rule as every other transition; neither
      new endpoint gates on `emailVerified`. `/organizer/rides/[id]/edit`
      gained "Начать заезд"/"Завершить заезд" buttons, no confirmation
      guard (unlike `cancel` — both are forward-only steps).
- [x] CR-023 Ride detail — done 2026-09-15: `GET /v1/rides/:id` (CR-016/
      CR-018) extended from owner-only to serve any viewer — visible to
      anyone once it's left `draft`, `404 ride_not_found` either way for a
      non-existent ride or a `draft` ride viewed by a non-owner. Response
      gained an additive `organizer: { id, name }` field instead of a
      separate public organizer-read endpoint. New public `/rides/[id]`
      screen (`apps/web`, no `CabinetShell`) showing the `Ride` fields that
      exist today; route/stops/services/requirements/registration action
      have no data model yet (CR-027..036, see
      `.claude/context/known-issues.md` KI-028).
- [x] CR-024 Ride list — done 2026-09-15: `GET /v1/rides` (public discovery,
      no auth), `apps/web`'s `/` (replaces the CR-002 bootstrap placeholder).
      See `docs/changelog.md`.
- [x] CR-025 Filters — done 2026-09-15: `?bicycleType=` on `GET /v1/rides`
      (the one filter dimension this ticket ships), plus the "upcoming
      only" default + `startsAt asc` sort resolving KI-029. See
      `docs/changelog.md`.
- [x] CR-026 Map discovery — done 2026-09-15: `GET /v1/rides` gained an
      optional map-viewport (bbox) filter (`?bboxNorth=&bboxSouth=&bboxEast=
&bboxWest=`, ADR-014), `rides` gained nullable `startLat`/`startLng`
      (`PATCH /v1/rides/:id`, manual entry — KI-016 blocks geocode-by-
      address), and `/` gained a List/Map toggle. No live 2GIS credential
      exists in this environment, so the map view is a real, live-verified
      degraded state (`ErrorState`, `.claude/rules/resilience.md`) rather
      than an unverifiable live MapGL render — KI-031. See
      `docs/changelog.md`.

## Route

- [x] CR-027 GPX upload — done 2026-09-15: `routes` table (`packages/db`,
      `rideId` unique FK → `rides`), `POST`/`PATCH`/`DELETE
/v1/rides/:id/route` (draft-only, multipart, ADR-015's size/streaming
      decision) + `GET /v1/rides/:id/route/download` (new, fulfilling
      `docs/product.md`'s "downloadable track" promise). No live MinIO in
      this environment (KI-015) — S3 code path unit-tested with the client
      mocked, not live-verified. See `docs/changelog.md`.
- [x] CR-028 Route rendering — done 2026-09-15: `GET /v1/rides/:id/route/geometry`
      (resolves KI-035, same viewer-visibility rule as ride detail/download), a
      hand-built inline-SVG elevation profile chart on `/rides/[id]`
      (`docs/design.md` §6), and a degraded route-map placeholder (KI-031 widened —
      no live 2GIS MapGL credential, same constraint CR-026 hit). See
      `docs/changelog.md`.
- [x] CR-029 Route metadata — done 2026-09-15: resolves KI-034. The first GPX
      upload now auto-fills whichever of `Ride.distanceKm`/`elevationGainMeters`
      is still `null` from the parsed track, in the same DB transaction as the
      route insert — never overwrites an organizer-entered value, and a replace
      upload never touches `Ride`'s fields. The organizer's route screen shows a
      reconciliation note with a "Использовать данные трека" action (reuses the
      existing ride-update endpoint, no new endpoint) when the two have
      genuinely diverged. See `docs/changelog.md`.
- [x] CR-030 Stops — done 2026-09-15: sixth domain table
      (`name`/`description`/`lat`/`lng`/`durationMinutes`/server-assigned
      `position`), new create/edit/delete stop endpoints, draft-only same as
      GPX upload, plus an additive `stops` array on the ride detail response.
      Organizer manages stops on the existing route screen; participants see
      them as a numbered list on the ride detail page. See
      `docs/changelog.md`.
- [x] CR-031 Route points — done 2026-09-15: seventh domain table (`type`/`label`/
      `description`/`lat`/`lng`, no `position` — a typed map pin, not an ordered
      itinerary entry, unlike `Stop`), new create/edit/delete endpoints, draft-only
      same as stops/GPX upload, plus an additive `routePoints` array on the ride
      detail response. Organizer manages route points on the existing route screen;
      no participant-facing list yet (route points are map markers, and the map
      itself is a documented degraded placeholder pending a live 2GIS credential,
      KI-031/KI-036). See `docs/changelog.md`.

## Registration

- [x] CR-032 Register — done 2026-09-15: eighth domain table (`registrations`:
      `rideId`/`userId`/`status`/`cancelledAt`, `.claude/rules/database.md`), new
      `apps/api/src/modules/registrations/` capability module,
      `POST /v1/rides/:id/register` (`registration_open`-only, `404 ride_not_found`
      same resource-enumeration-safe rule as ride detail), plus additive
      `registrationsCount`/`viewerRegistration` fields on `GET /v1/rides/:id`.
      Organizer's `RegistrationButton` on `/rides/[id]`. See `docs/changelog.md`.
- [x] CR-033 Cancel registration — done 2026-09-15, together with CR-032:
      `DELETE /v1/rides/:id/register`, `404 registration_not_found`, no status
      gate beyond "an active registration exists" (not invented — nothing in
      `docs/product.md`/`docs/database.md` restricts it further). Keeps the row
      (`status: 'cancelled'` + `cancelledAt`) rather than deleting it.
- [x] CR-034 Capacity enforcement — delivered as part of CR-032, not deferred:
      `.claude/CLAUDE.md`/`.claude/rules/database.md` require registration to
      atomically protect capacity from the start (same "invariant from day one"
      precedent as CR-057/CR-062). A `SELECT ... FOR UPDATE` on the `rides` row
      inside `createRegistration`'s transaction serializes concurrent attempts;
      `409 ride_full` once active registrations reach `participantLimit`.
- [x] CR-035 Duplicate protection — delivered as part of CR-032, same reasoning as
      CR-034: the same row lock serializes the duplicate check
      (`409 registration_already_exists`), backed by a DB-level partial unique
      index (`registrations_ride_id_user_id_active_unique`) as the invariant
      backstop.
- [x] CR-036 Waitlist — done 2026-09-15: ninth domain table (`waitlist_entries`:
      `rideId`/`userId`/`status` `waiting`/`promoted`/`cancelled`/`cancelledAt`/
      `promotedAt`, queue order is `createdAt` ascending, no `position` column), new
      `POST`/`DELETE /v1/rides/:id/waitlist` in the existing `registrations` module,
      plus an additive `viewerWaitlistEntry` field on `GET /v1/rides/:id`. Joining
      requires the ride to actually be full (`409 ride_not_full` otherwise — register
      instead). `DELETE /v1/rides/:id/register` (cancellation) now auto-promotes the
      oldest waiting entry into a fresh active registration, inside the same
      transaction/row lock as the cancellation. `RegistrationButton` gained a third
      state (join/leave waitlist). See `docs/changelog.md`.
- [ ] CR-037 Organizer participant list
- [ ] CR-091 "My registrations" (`/me/rides`, `docs/design.md`'s screen inventory)
      — new ticket, added this session (see `.claude/context/known-issues.md`
      KI-037): no ticket in this backlog owned a participant-facing list of their
      own registrations, the same shape of gap as KI-024/025/027. Not built this
      session to keep CR-032's scope to register/cancel/capacity/duplicate
      protection; a participant can still verify/cancel a registration today by
      revisiting `/rides/[id]` directly.

## Communication

- [ ] CR-038 Registration confirmation
- [ ] CR-039 Ride updates
- [ ] CR-040 Cancellation notification
- [ ] CR-041 In-app notifications

## Post-ride

- [ ] CR-042 Review
- [ ] CR-043 Organizer rating summary

## Quality

These three are **verification passes over screens already built to `docs/design.md`**,
not the point where responsive/a11y/state work starts. A screen that ships without them
is not done (`docs/definition-of-done.md`).

- [ ] CR-044 Responsive UI — audit against `docs/design.md` §11
- [ ] CR-045 Accessibility — audit against `docs/design.md` §12 (WCAG 2.1 AA)
- [ ] CR-046 Error/loading/empty states — audit against `docs/design.md` §10
- [ ] CR-047 Security review
- [ ] CR-048 Performance review

## Resilience

- [ ] CR-049 Timeout/retry/circuit-breaker utilities for external integrations (2GIS Maps, S3)
- [ ] CR-050 Async notification delivery via Redis queue (decoupled from registration transaction)
- [ ] CR-051 Health check endpoint (`apps/api`) reporting DB/Redis/S3 status
- [ ] CR-052 Frontend degraded-state handling (maps/uploads unavailable)

## Extensibility foundations

- [ ] CR-053 Split `packages/maps-core` (interface) + `packages/maps-2gis` (adapter) — ADR-010
- [ ] CR-054 Feature registry for dashboard nav/widgets (organizer + participant cabinets) — ADR-009
- [ ] CR-055 Feature flag utility for staged cabinet feature rollout — ADR-009
- [ ] CR-056 Document/lint rule preventing direct 2GIS SDK imports outside `packages/maps-2gis`

## Security foundations

- [x] CR-057 Password hashing (Argon2id/bcrypt) + minimum password policy — delivered
      as part of CR-011 (Argon2id via the `argon2` package, 12+ char minimum).
- [ ] CR-058 Auth rate limiting (login/register/forgot-password, per IP + per account) —
      CR-011 shipped an interim in-memory, per-IP-only tier on register/verify-email;
      this ticket is the Redis-backed, per-account upgrade (KI-022, blocked on KI-014).
- [x] CR-059 Email verification flow (gates organizer publish action) — CR-011 shipped
      the token issue/verify mechanism itself (`POST /v1/auth/verify-email`); the
      remaining scope — gating organizer publish on `emailVerified` — closed 2026-09-14
      by CR-019 (`publishRide`'s `email_verification_required` 403). No verify-email
      web screen exists yet (`docs/design.md` §8 lists `/verify-email` under "Auth
      flows"), a pre-existing gap this ticket doesn't close — see
      `.claude/context/known-issues.md`.
- [ ] CR-060 Password reset flow (single-use, time-limited tokens, no account enumeration)
- [ ] CR-061 Security headers (`@fastify/helmet`-equivalent) — the CSRF half of this
      ticket's original scope (Origin/Referer check for cookie sessions) was
      implemented by CR-012 (`apps/api/src/plugins/csrf.ts`, ADR-013); this ticket is
      now headers-only
- [x] CR-062 Session store decision — database-backed sessions + single-origin `/api`,
      decided 2026-09-11 in ADR-013; implemented by CR-012

## Deployment

Deliberately deferred until there is something to deploy (see `docs/changelog.md`,
2026-09-11). These are not "nice to have" — nothing ships to a server without them.

- [ ] CR-074 `Dockerfile` for `apps/web` and `apps/api` + `.dockerignore` (multi-stage,
      non-root user, Next.js standalone output)
- [ ] CR-075 Production manifest: reverse proxy serving the web app and `/api` on one
      origin (ADR-013), TLS, resource limits, restart policy
- [ ] CR-076 Migrations as an explicit deploy step — safe when several API instances start
      at once (never on application boot)
- [ ] CR-077 Redis hardening: password, AOF persistence (the notification queue lives
      there — CR-050), healthcheck
- [ ] CR-078 PostgreSQL backups + a restore actually verified, not just scheduled
- [ ] CR-079 Structured logging (pino + request id) and error reporting; background job
      failures must be visible (`.claude/rules/resilience.md`)
- [ ] CR-080 CI gaps: MinIO service, migration step, Playwright e2e job
- [ ] CR-081 Full production environment variable set in `.env.example` + deployment
      documentation
- [ ] CR-082 Pin `minio/minio` to a release tag; review base image versions

## Contract & model follow-ups

Found during the 2026-09-11 audit, cheaper before the related feature is built.

- [ ] CR-083 Idempotency for `POST /v1/rides/:id/register` (network retry must not create
      a second registration; the DB constraint is the backstop, not the design)
- [x] CR-084 Decide the geo query approach for map discovery (bbox/radius): PostGIS vs
      built-in types + index strategy — needed by CR-026 — decided together
      with CR-026 (ADR-014, 2026-09-15): plain lat/lng columns + a bbox range
      query, not PostGIS. See `docs/decisions.md`.
- [x] CR-085 GPX parsing must not block the event loop: size limit, streaming or worker —
      needed by CR-027 — decided together with CR-027 (ADR-015, 2026-09-15): 10 MB
      upload cap + streaming SAX parse, no worker thread. See `docs/decisions.md`.
- [ ] CR-086 Cover image pipeline: size/type limits, resizing, how files are served
      (direct S3 vs proxy) — needed by CR-017
