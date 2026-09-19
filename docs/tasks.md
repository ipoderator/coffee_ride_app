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
- [x] CR-037 Organizer participant list — done 2026-09-15: two new organizer-only,
      paginated collection endpoints — `GET /v1/rides/:id/participants` (active
      registrations, `createdAt asc`) and `GET /v1/rides/:id/waitlist` (adds `GET` to
      the existing `POST`/`DELETE` path, `waiting` entries only, FIFO order). Own
      minimal response shape (`RideParticipantSummary`: `id`/`userId`/`displayName`/
      `createdAt`) — deliberately no phone/email
      (`.claude/rules/security.md`). New `/organizer/rides/[id]/participants` screen
      (`ParticipantTable`/`WaitlistTable`, `docs/design.md` §9's named components),
      linked from `EditRideForm`. Found and fixed a real pre-existing cursor-pagination
      bug along the way (`date_trunc` fix, see `docs/changelog.md`). See
      `docs/changelog.md`.
- [x] CR-091 "My registrations" (`/me/rides`, `docs/design.md`'s screen inventory)
      — done 2026-09-16: `GET /v1/registrations/mine?when=upcoming|past`, the
      caller's own active registrations joined with each ride's public+organizer
      summary, two independently cursor-paginated tabs. `/me/rides` (`MyRidesView`,
      Upcoming/Past tabs), new participant nav entry. Read-only — cancellation
      stays on `/rides/[id]`. See `docs/changelog.md`.

## Communication

- [x] CR-038 Registration confirmation — a `registration_confirmed` notification
      is created for the registrant on `POST /v1/rides/:id/register` and on a
      waitlist auto-promotion inside `DELETE /v1/rides/:id/register`, after each
      one's own transaction commits.
- [x] CR-039 Ride updates — `RideUpdate` table + `POST`/`GET /v1/rides/:id/updates`
      (organizer-only), fanning out a `ride_update` notification to every
      currently-active registrant. `/organizer/rides/[id]/updates` (compose +
      history).
- [x] CR-040 Cancellation notification — `POST /v1/rides/:id/cancel` fans out a
      `ride_cancelled` notification to everyone actively registered at
      cancellation time.
- [x] CR-041 In-app notifications — `Notification` table,
      `GET /v1/notifications/mine` + `POST /v1/notifications/:id/read`, `/me/
notifications` (third participant cabinet nav entry). ADR-007 (Pending):
      in-app only, no email/push. Delivery is a same-request DB insert after the
      triggering transaction, not a Redis queue — see KI-040/CR-050.

## Post-ride

- [x] CR-042 Review — done 2026-09-16: new `reviews` capability module/table
      (`id`/`rideId`/`userId`/`rating` 1-5/`comment`/`createdAt`, plain unique
      index on `(rideId, userId)` — no edit/delete, create + list only, same
      precedent as `RideUpdate`). `POST /v1/rides/:id/reviews` — eligibility is
      an _active_ registration on a `finished` ride (`403 not_a_participant`/
      `409 ride_not_finished`), `409 review_already_exists` on a duplicate.
      `GET /v1/rides/:id/reviews` — public, paginated. `ReviewForm`/`ReviewList`
      (`docs/design.md` §9) on `/rides/[id]`, gated on the new additive
      `viewerReview`/`viewerRegistration` fields on `GetRideResponse`. See
      `docs/changelog.md`.
- [x] CR-043 Organizer rating summary — done 2026-09-16, bundled with CR-042:
      `avg(rating)`/`count(*)` across every review on any of an organizer's
      rides, computed via a join (no denormalized column). Exposed as additive
      `rating`/`reviewCount` on `RideOrganizerSummary` (`GET /v1/rides`,
      `GET /v1/rides/:id` — batched, not N+1, on the paginated discovery/
      my-registrations endpoints) and on `GET`/`POST`/`PATCH
/v1/organizers/me` (shown on `/organizer/profile`). No new endpoint —
      same "no standalone organizer endpoint" precedent CR-023 established.
      See `docs/changelog.md`.

## Quality

These three are **verification passes over screens already built to `docs/design.md`**,
not the point where responsive/a11y/state work starts. A screen that ships without them
is not done (`docs/definition-of-done.md`).

- [x] CR-044 Responsive UI — done 2026-09-16: audited all 16 screens against
      `docs/design.md` §11 (3 parallel Explore-agent passes, see
      `.claude/context/current-task.md`/`docs/changelog.md`). Fixed 5 real gaps:
      `CabinetShell` (bottom nav base, side nav `md`+), `RideDetailView`
      (two-column at `md`), `DiscoveryList`/`DiscoveryViewToggle` (combined
      list+map split view at `lg`), `MetricRow` (distinct `sm` two-column step),
      root `layout.tsx` (shared max-width-1200px-centered container at `xl`).
      Everything else already compliant.
- [x] CR-045 Accessibility — done 2026-09-16: audited against `docs/design.md`
      §12 (WCAG 2.1 AA). One real gap: no `<main>` landmark on any of the 12
      cabinet pages — fixed once in `CabinetShell`. Everything else (focus
      rings, label/`aria-describedby` linking, no color-alone conveyance,
      reduced-motion, one `<h1>` per page) already compliant. Map keyboard
      operability recorded as "re-verify once a live map ships" (KI-031), not
      a fixable gap today.
- [x] CR-046 Error/loading/empty states — done 2026-09-16: audited against
      `docs/design.md` §10. Systemic gap: 12 of 14 `ErrorState` call sites
      rendered `message` only, no `onRetry` (§10 point 3 requires a retry
      affordance). Added `onRetry` to all 11 remaining sites (2 already had
      it); normalized `UpdateComposer`'s raw `problem.detail` submit error to
      the shared `AUTH_TERMS.genericError` term. Skeletons/empty
      states/forms/CR-052 degraded states already compliant everywhere.
- [x] CR-047 Security review — done 2026-09-16: walked every item in
      `.claude/rules/security.md` against the whole app, not just auth. No new
      gaps beyond what KI-022 already tracked (now widened there to cover
      every endpoint, not just `/v1/auth/*`) — no `@fastify/helmet` (HIGH,
      CR-061's exact scope) and in-memory single-instance rate limiting
      (MEDIUM/LOW, CR-058's exact scope). Documented in
      `.claude/context/known-issues.md`, not implemented here, per the
      scope decision (avoid mixing into a separately tracked ticket).
- [x] CR-048 Performance review — done 2026-09-16: verified compliant
      (batched organizer rating aggregate, explicit indexes on FK/filter
      columns, cursor pagination everywhere). One LOW fix applied: `RideCard`/
      `RideDetailView`'s cover image `<img>` → `next/image` (currently inert,
      `coverImageUrl` is always `null` until CR-086's S3 pipeline — cheap to
      fix now so the branch is already optimized once it exists).

## Resilience

- [x] CR-049 Timeout/retry/circuit-breaker utilities for external integrations
      (2GIS Maps, S3) — done 2026-09-16: new `packages/resilience` package
      (ADR-016) — `callWithResilience` (timeout + bounded retry with jittered
      backoff, driven by an `AbortSignal`) and `CircuitBreaker`
      (closed/open/half-open). `packages/maps-2gis`'s `fetchJson` and
      `apps/api`'s `route-storage.ts` (S3) both now retry once and share one
      breaker per integration instead of their previous
      timeout-only/hand-rolled-retry code; both still normalize into their
      existing domain error (`MapProviderError`/`RouteStorageError`), no
      caller-visible contract change. See `docs/changelog.md`.
- [x] CR-050 Async notification delivery via Redis queue (decoupled from registration
      transaction) — done 2026-09-16: new `apps/api/src/modules/notifications/queue.ts`
      (`bullmq` producer/worker, in-process, `app.notificationQueue` nullable). Every
      producer falls back to the pre-CR-050 direct synchronous insert when
      `REDIS_URL` isn't configured (KI-014, still unverified live in this environment).
      Enqueue and graceful-shutdown calls are bounded by a hand-rolled timeout, not
      `callWithResilience` (BullMQ's `add()` doesn't honor an `AbortSignal` to race
      against) — live-verified against a genuinely unreachable Redis. See
      `docs/changelog.md`.
- [x] CR-051 Health check endpoint (`apps/api`) reporting DB/Redis/S3 status — done
      2026-09-16: `GET /health` now runs a real, bounded check per dependency
      (`ok`/`error`/`not_configured`) and always returns `200`. See
      `docs/changelog.md`.
- [x] CR-052 Frontend degraded-state handling (maps/uploads unavailable) — done
      2026-09-17: both `docs/design.md` §10 cases were already real,
      opportunistically built during CR-026/027/028 (map placeholder,
      `route_storage_unavailable` inline notice) — this ticket closed the gap
      by adding the missing `replaceRoute` (PATCH) degraded-path test
      (symmetric with the already-tested `uploadRoute` one) and recording an
      explicit decision that CR-052 closes on reactive per-call handling, not
      a proactive `/health`-polling global banner (no design.md spec for one).
      See `docs/changelog.md`.

## Extensibility foundations

- [x] CR-053 Split `packages/maps-core` (interface) + `packages/maps-2gis` (adapter) — ADR-010
      — done 2026-09-17: verified as already satisfied by CR-007 (2026-09-12),
      before ADR-010/this ticket existed as separate backlog items. No code
      changed: confirmed `packages/maps-core` is vendor-free (types/interface
      only), `packages/maps-2gis` is the only package with 2GIS-specific
      logic, dependency direction is correct (`maps-2gis` → `maps-core`, never
      reversed), and a repo-wide grep found no 2GIS SDK import leaking outside
      `packages/maps-2gis`. See `docs/changelog.md`.
- [x] CR-054 Feature registry for dashboard nav/widgets (organizer + participant cabinets) — ADR-009
      — done 2026-09-17: the registry mechanism itself (generic render-from-list,
      no per-feature branching) already existed for nav in both cabinets
      (CR-013/014) and for widgets in the one cabinet `docs/design.md` §8
      actually specs a widget grid for (`/organizer`, CR-015) — `/me` has no
      widget-grid requirement in the design spec, so no participant widget
      registry was invented. Closed the two real gaps: zero test coverage of
      the mechanism (added `CabinetShell.test.tsx`, `cabinet-registries.
test.ts`, `app/organizer/page.test.tsx`), and two inline comments that
      misattributed CR-055's flag-utility scope to this ticket (fixed to
      point at CR-055 instead). See `docs/changelog.md`.
- [x] CR-055 Feature flag utility for staged cabinet feature rollout — ADR-009
      — done 2026-09-17: `apps/web/src/lib/cabinet/feature-flags.ts`
      (`isFeatureEnabled`/`filterEnabled`, server-only `FEATURE_<NAME>` env
      vars). `CabinetNavItem`/`DashboardWidget` gained an optional `flag`
      field; both cabinet layouts and `/organizer`'s widget page now filter
      through it before rendering (no current registry entry sets one — all
      shipped features are stable). `.claude/rules/extensibility.md` records
      the concrete naming convention. See `docs/changelog.md`.
- [x] CR-056 Document/lint rule preventing direct 2GIS SDK imports outside `packages/maps-2gis`
      — done 2026-09-17: a `no-restricted-imports` rule (`group: ['*2gis*']`)
      added to every workspace member's ESLint config (via `packages/config`'s
      `nodeLibraryConfig()` for its four consumers, hand-added to the five
      configs that don't use it); `packages/maps-2gis` opts out
      (`allowMapsSdkImports: true`). No such SDK package is installed
      anywhere yet — preventative, proven to actually fire with a temporary
      violating import (then reverted). `.claude/rules/maps.md` records the
      enforcement. See `docs/changelog.md`.

## Security foundations

- [x] CR-057 Password hashing (Argon2id/bcrypt) + minimum password policy — delivered
      as part of CR-011 (Argon2id via the `argon2` package, 12+ char minimum).
- [x] CR-058 Auth rate limiting (login/register/forgot-password, per IP + per account) —
      done 2026-09-19: Docker/a live Redis happened to be up this session
      (KI-014's connection-level gap had just closed), so this ticket was
      picked up instead of waiting further. Global `@fastify/rate-limit`
      registration (`apps/api/src/app.ts`) now uses a Redis-backed
      `RedisStore` (shared across instances) when `REDIS_URL` is configured,
      `skipOnError: true` so a degraded Redis fails open rather than
      blocking a critical journey; falls back to the plugin's in-memory
      store otherwise, unchanged. New independent per-account tier
      (`apps/api/src/lib/account-rate-limit.ts`, atomic `MULTI INCR +
    PEXPIRE ... NX EXEC`) on `/register`/`/login`/`/forgot-password`,
      keyed by normalized email, also fail-open. Live-verified against the
      real Redis this session (including stopping it mid-session to confirm
      login still replies `401` in ~1.3s, not hung) — resolves KI-022. See
      `docs/changelog.md`.
- [x] CR-059 Email verification flow (gates organizer publish action) — CR-011 shipped
      the token issue/verify mechanism itself (`POST /v1/auth/verify-email`); the
      remaining scope — gating organizer publish on `emailVerified` — closed 2026-09-14
      by CR-019 (`publishRide`'s `email_verification_required` 403). No verify-email
      web screen exists yet (`docs/design.md` §8 lists `/verify-email` under "Auth
      flows"), a pre-existing gap this ticket doesn't close — see
      `.claude/context/known-issues.md`.
- [x] CR-060 Password reset flow (single-use, time-limited tokens, no account enumeration)
      — done 2026-09-17: seventh domain table (`password_reset_tokens`, same
      shape as `email_verification_tokens`), `POST /v1/auth/forgot-password`
      (always `204`, no body, identical for a real vs. unknown email — no dev
      token exposure at all, unlike `register`'s `verificationUrl`) and
      `POST /v1/auth/reset-password` (`200 { user }`; invalidates every other
      outstanding token for that user and revokes every session). Live-verified
      end to end against a real Postgres + running `apps/api`: enumeration-safe
      response, session revocation, old-password rejection, new-password login.
      See `docs/changelog.md`.
- [x] CR-061 Security headers (`@fastify/helmet`-equivalent) — the CSRF half of this
      ticket's original scope (Origin/Referer check for cookie sessions) was
      implemented by CR-012 (`apps/api/src/plugins/csrf.ts`, ADR-013); this ticket is
      now headers-only — done 2026-09-17: `@fastify/helmet` registered globally
      (`apps/api/src/plugins/security-headers.ts`), applying CSP/
      X-Content-Type-Options/X-Frame-Options/Referrer-Policy to `/health`, `/docs`,
      and every `/v1` route alike. Custom CSP removes `upgrade-insecure-requests`
      (would break `/docs` over local `http://`) and tightens `frame-ancestors`/
      `X-Frame-Options` to `'none'`/`DENY`. Live-verified `/docs` (Swagger UI)
      still renders and works via a headless-browser check — zero console errors,
      zero failed requests, full operations list visible. See `docs/changelog.md`.
- [x] CR-062 Session store decision — database-backed sessions + single-origin `/api`,
      decided 2026-09-11 in ADR-013; implemented by CR-012

## Deployment

Deliberately deferred until there is something to deploy (see `docs/changelog.md`,
2026-09-11). These are not "nice to have" — nothing ships to a server without them.

- [x] CR-074 `Dockerfile` for `apps/web` and `apps/api` + `.dockerignore` (multi-stage,
      non-root user, Next.js standalone output) — done 2026-09-17. See
      `docs/changelog.md`.
- [x] CR-075 Production manifest: reverse proxy serving the web app and `/api` on one
      origin (ADR-013), TLS, resource limits, restart policy — done 2026-09-17
      (ADR-018). See `docs/changelog.md`.
- [x] CR-076 Migrations as an explicit deploy step — safe when several API instances start
      at once (never on application boot) — done 2026-09-17. See `docs/changelog.md`.
- [x] CR-077 Redis hardening: password, AOF persistence (the notification queue lives
      there — CR-050), healthcheck — done 2026-09-18. See `docs/changelog.md`.
- [x] CR-078 PostgreSQL backups + a restore actually verified, not just scheduled
      — done 2026-09-19: `packages/db/scripts/{backup.sh,restore.sh}` (plain
      `pg_dump --format=custom`/`pg_restore --clean --if-exists`, both driven
      entirely by `DATABASE_URL`, same portability as `migrate.ts` — no
      hosting assumption, consistent with ADR-018 leaving Postgres hosting
      undecided), `pnpm --filter db db:backup`/`db:restore`, documented in
      `docs/database.md` (new "Backups" section, incl. a cron scheduling
      example). Restore live-verified against this environment's real local
      Postgres: a marker row inserted into the real `coffee_ride_dev`
      database, backed up, restored into a scratch database, all 14 tables'
      row counts (and the marker row's exact content) matched, then the
      marker row/scratch database/test backup file were all cleaned up. See
      `docs/changelog.md`.
- [x] CR-079 Structured logging (pino + request id) and error reporting; background job
      failures must be visible (`.claude/rules/resilience.md`) — done 2026-09-17.
      See `docs/changelog.md`.
- [x] CR-080 CI gaps: MinIO service, migration step, Playwright e2e job —
      done 2026-09-19: the migration-step complaint was already stale
      (real since CR-011, KI-007's text just never corrected). Added a
      `minio` service to `ci.yml` (same pinned tag as `docker-compose.yml`) + a bucket-creation step + `S3_*`/`AUTH_SECRET`/`WEB_ORIGIN`/
      `RUN_LIVE_S3_TESTS` env, a Playwright browser install step, and an
      `E2E tests` step. New `apps/api/.../route-storage.live.test.ts`
      exercises a real (unmocked) S3 round trip, gated on
      `RUN_LIVE_S3_TESTS=1` (KI-015). `playwright.config.ts`'s `webServer`
      is now a two-entry array (`apps/api` then `apps/web`) since `/` has
      called the real API since CR-024; `e2e/home.spec.ts` rewritten off
      CR-002's removed placeholder copy onto the real discovery page.
      Live-verified locally: `pnpm test:e2e` passes end to end against a
      freshly started `apps/api`/`apps/web`; the live S3 test skips cleanly
      without the flag and genuinely attempts (and fails, no local MinIO)
      with it forced on. See `docs/changelog.md`.
- [x] CR-081 Full production environment variable set in `.env.example` + deployment
      documentation — done 2026-09-19: `.env.example` was already complete
      (cross-checked against every var `docker-compose.prod.yml` consumes —
      nothing to add). New `docs/deployment.md`: prerequisites, `.env`
      setup, first-boot migrate-then-serve order, verification, redeploy/
      rollback, a pointer to `docs/database.md`'s Backups section. Also
      resolved KI-046 for real (`apps/api/src/env.ts`'s `REDIS_URL`/
      `S3_ENDPOINT` now normalize an empty string to "not configured" the
      same way `ERROR_REPORTING_WEBHOOK_URL` already did), with new test
      coverage in `apps/api/src/env.test.ts`. See `docs/changelog.md`.
- [x] CR-082 Pin `minio/minio` to a release tag; review base image versions —
      done 2026-09-19: MinIO pinning was already done (CR-009). The real
      finding while reviewing base image versions: `.github/dependabot.yml`'s
      one `docker` entry (`directory: '/'`) never actually scanned anything
      — `docker`/`docker-compose` are separate Dependabot ecosystems (no
      `docker-compose` entry existed at all), and `docker` only scans the
      exact directory given, which had no Dockerfile at repo root (all three
      live nested). Fixed: one `docker` entry per real Dockerfile
      (`apps/web`, `apps/api`, `packages/db`) plus a new `docker-compose`
      entry covering both compose files. Base image tags themselves
      (`node:24-alpine`/`postgres:17-alpine`/`redis:8-alpine`/
      `caddy:2-alpine`) are left as intentional floating major/minor
      versions — Dependabot, now actually wired to reach every one, is the
      ongoing review mechanism. See `docs/changelog.md`.

## Contract & model follow-ups

Found during the 2026-09-11 audit, cheaper before the related feature is built.

- [x] CR-083 Idempotency for `POST /v1/rides/:id/register` (network retry must not create
      a second registration; the DB constraint is the backstop, not the design) —
      done 2026-09-19: the DB-level protection (row lock + unique index,
      CR-034/035) was already correct and untouched; the actual gap was
      client-facing — a retry of an already-successful register/waitlist-join
      call got back `409 registration_already_exists`/
      `409 waitlist_entry_already_exists` instead of the existing resource.
      `createRegistration`/`joinWaitlist` (`apps/api/src/modules/
registrations/registrations.service.ts`) now return `{ resource, created }`;
      the route layer replies `200` with the existing row on a replay instead
      of `201`/an error, with no duplicate row and no duplicate
      `registration_confirmed` notification. `joinWaitlist`'s _other_ "already"
      check (an active registration blocking a waitlist join — a genuine
      conflict, not a retry) is unchanged, still `409`. `apps/web` needed no
      changes — its clients already branch on `response.ok`, not the exact
      status code, so this also fixes a real latent UX bug
      (`RegistrationButton` showing a spurious error on a lost-response
      retry) for free. See `docs/changelog.md`.
- [x] CR-084 Decide the geo query approach for map discovery (bbox/radius): PostGIS vs
      built-in types + index strategy — needed by CR-026 — decided together
      with CR-026 (ADR-014, 2026-09-15): plain lat/lng columns + a bbox range
      query, not PostGIS. See `docs/decisions.md`.
- [x] CR-085 GPX parsing must not block the event loop: size limit, streaming or worker —
      needed by CR-027 — decided together with CR-027 (ADR-015, 2026-09-15): 10 MB
      upload cap + streaming SAX parse, no worker thread. See `docs/decisions.md`.
- [ ] CR-086 Cover image pipeline: size/type limits, resizing, how files are served
      (direct S3 vs proxy) — needed by CR-017
- [x] CR-092 Real critical-journey Playwright specs — done 2026-09-19: new
      `apps/web/e2e/helpers/api-fixtures.ts` (register/verify/login/organizer
      profile/publish-ride/register-for-ride, all via direct API calls) and
      `apps/web/e2e/critical-journeys.spec.ts` — the three journeys
      `.claude/rules/testing.md` names, `test.describe.serial` in one file
      (keeps the shared `/v1/auth/{register,login}` 5/min/IP rate limit,
      KI-014, from tripping across the group — exactly 5 register + 5 login
      calls total). Each spec seeds only its preconditions via API and drives
      the actual journey through real UI interactions (fill forms, click
      buttons, assert rendered state) — not scripted through the API
      end-to-end. Live-verified locally, twice, via `pnpm test:e2e`: 4/4
      passing. See `docs/changelog.md`.
- [x] CR-093 Connect a live 2GIS Geocoder/Directions key, resolve KI-016 — done
      2026-09-19: user supplied a real 2GIS key; confirmed with them it's the
      server-side Geocoder/Directions product (not the separate public MapGL
      key, CR-071) and added it to local `.env` only. Live-verified
      `packages/maps-2gis` against the real API: `geocode`/`reverseGeocode`
      field-name guesses were correct; `getRoute`'s geometry guess was wrong
      (real polyline is WKT `LINESTRING` strings under
      `maneuvers[].outcoming_path.geometry[]`, not a flat `{lat, lon}` array)
      and was silently falling back to the raw waypoints — fixed in
      `packages/maps-2gis/src/route.ts` and re-verified live. No consumer
      wired in yet (still zero callers of `create2GisMapProvider`) — that's
      KI-032/CR-028/CR-084 follow-up. See `docs/changelog.md`.
- [ ] CR-094 Wire `SIGTERM`/`SIGINT` in `apps/api/src/server.ts` to actually
      call `app.close()` (then `process.exit(0)`, with a hard fallback
      timeout) — found 2026-09-19 while live-verifying CR-058's fail-open
      behavior: `modules/notifications/queue.ts`'s `onClose` hook already
      assumes a real graceful shutdown triggers it ("e.g. SIGTERM"), but
      nothing in `server.ts` ever registers a signal handler, so `app.close()`
      never runs on a real `docker stop`/orchestrator shutdown today. See
      KI-048.
