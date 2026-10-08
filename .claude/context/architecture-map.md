# Architecture Map

Where things live **now**. Kept compact (~150 lines, CR-202): one line per module, no
history — the why of each piece is in `docs/changelog.md`/`docs/decisions.md`, and the
chronological pre-CR-202 map is `.claude/context/architecture-map-archive.md` (grep a
module or CR id there, never read it whole). Update the line for a module when its
structure changes; don't narrate.

## Shape

Modular monolith (ADR-008), pnpm + Turborepo. Dependency direction and forbidden edges:
`.claude/rules/architecture.md`.

```text
apps/web  (Next.js 15)  ──HTTP /api/v1/* rewrite──▶  apps/api (Fastify 5)
   │ types/ui/maps-core                                 │ db/types/maps-core/resilience
   └─ lib/maps/create-map-renderer.ts → maps-2gis       └─ plugins/maps.ts → maps-2gis/server
packages: db · types · ui · config · maps-core · maps-2gis · resilience
```

## apps/api (`apps/api/src`)

- `app.ts` builds the app; `server.ts` boots; `env.ts` Zod env (refuses placeholders
  in production); `preflight.ts` warns on config that boots but leaves a feature dead
  (`scripts/preflight.ts` = `pnpm preflight`, also logged at boot — CR-210);
  `routes/v1.ts` mounts modules under `/v1`; `routes/health.ts` —
  unversioned `/health` (DB/Redis/S3, always 200).
- `plugins/`: `auth` (session → `request.user`), `csrf` (Origin/Referer on unsafe
  methods), `db`, `s3`, `email` (Unisender or null), `maps` (`app.mapProvider` or null),
  `openapi` (`/docs`), `security-headers` (helmet), `error-handler` (RFC 9457),
  `error-reporting` (`app.reportError`).
- `lib/`: `cursor` (pagination), `account-rate-limit`, `race-timeout`, `request-id`,
  `trust-proxy`, `read-upload`/`image-processing`/`image-storage` (sharp, S3),
  `image-url` (`?v=` key-hash URLs + Cache-Control for covers/avatars),
  `graceful-shutdown`, `content-disposition` (safe attachment header), `email/`
  (provider interface + Unisender).
- `modules/<capability>/` = `*.routes.ts` (thin) → `*.service.ts` (rules, authz,
  transactions) + `*-response.schema.ts`:
  - `auth` — register/login/logout/me, verify + resend, forgot/reset password;
    `password.ts` (Argon2id), `session.ts` (DB sessions, hashed token), `tokens.ts`.
  - `users` — profile, avatar, garage (`Bike`), rider-profile visibility.
  - `organizers` — `OrganizerProfile`, rating aggregate, avatar.
  - `rides` — CRUD + lifecycle, reschedule, discovery list (`phase`, bbox, filters),
    detail; `ride-groups.*` (ADR-022); `gpx.ts` (SAX parse), `route-storage.ts` (S3 via
    `callWithResilience`), `route-preview.ts`, `route-geometry.ts` (stored-geometry
    cap), `organizer-journal.ts`; stops, route
    points, cover, requirements, contacts.
  - `registrations` — register/cancel/change group (row lock, capacity, duplicates,
    idempotent repeat), waitlist + FIFO promotion, participants/riders lists, finish
    check-in and results (ADR-027/028), `/v1/registrations/mine`.
  - `notifications` — inbox, ride updates fan-out; `queue.ts` (BullMQ; direct insert
    only when the job never reached Redis).
  - `reviews` — create (gated on confirmed finish) + list.
- Tests: `*.test.ts` beside code; DB via `test-support/test-database-url.ts`
  (`TEST_DATABASE_URL`, disposable names only); `degraded-dependencies.test.ts`;
  `*.live.test.ts` behind `RUN_LIVE_*`.

## apps/web (`apps/web/src`)

- `app/` routes: `/` (discovery), `/rides/[id]`, `/rides/[id]/riders/[registrationId]`,
  `(public)/login|register`, `/verify-email`, `/forgot-password`, `/reset-password`,
  `/me` (+ `profile`, `rides`, `notifications`), `/organizer` (+ `profile`,
  `participants`, `updates`, `rides`, `rides/new`, `rides/[id]/edit|route|cover|groups|
participants|updates` — the six-tab workspace «Управление заездом»); `not-found.tsx`
  (+ `rides/[id]/not-found.tsx`), `robots.ts`, `sitemap.ts` (CR-224/226).
- `features/{auth,organizer,participant}/<feature>/` — ADR-009 modules (`components/`,
  `api.ts`, tests); organizer: activity, cover-image, groups, live-rides, overview,
  participants, profile, rides, route, updates; participant: discovery, my-rides,
  notifications, organizer-entry, profile, ride-detail, rider-profile.
- `components/site/` (AppHeader, SiteChrome, BottomTabBar, ThemeToggle, BackLink,
  NotFoundPanel),
  `components/cabinet/` (CabinetShell, CabinetSidebar, CabinetSectionTabs,
  OrganizerCabinetFrame, …).
- `lib/`: `cabinet/` (nav + widget registries, feature flags, ride workspace sections,
  readiness), `auth/` (session context, `next-path` safe redirects, resend button),
  `api/` (errors, asset URLs, current user), `forms/` (Russian field errors + guard
  test), `datetime/zoned-time`, `maps/create-map-renderer.ts` (only `maps-2gis`
  import), `rides/` (+ `server-ride.ts`: server-side ride lookup for the 404, CR-224),
  `site/` (`SITE_URL`, shared metadata), `security/headers.ts` (page CSP +
  Permissions-Policy, read by `next.config.ts`), `organizer/`, `motion/`, `theme/`.
- `stories/` — Storybook (CR-158), fixtures in `stories/fixtures.ts`.
- `e2e/` — one spec per journey, `helpers/{api-fixtures,ui,db-fixtures,mock}.ts`,
  `*.spec.ts-snapshots/` visual baselines (x86_64 Linux only).

## packages

- `db` — Drizzle schema `src/schema/*.ts` (one file per entity: user, session, tokens,
  organizer-profile, ride, route, stop, route-point, ride-group, ride-requirement,
  registration, waitlist-entry, ride-update, notification, review, bike); migrations
  `migrations/0000`–`0025`; `migrate.ts` (advisory lock), `seed-demo.ts`,
  `scripts/backup.sh|restore.sh`.
- `types` — Zod contracts `src/api/*`, domain enums/types `src/domain/*`; `zod-config.ts`
  (browser-only `jitless`, CR-226).
- `ui` — tokens (`tokens.css`, ADR-024), `format.ts` (Russian numbers/dates/units),
  `terminology.ts` (every user-visible string), components (Button, Input, TimeInput, Dialog/
  ConfirmDialog, MetricTile, StatusBadge, EmptyState, ErrorState, Skeleton, …).
- `maps-core` — `MapProvider` + render-layer interfaces (`/server` export omits render).
- `maps-2gis` — REST provider (`provider.ts`, `http.ts` with breaker), `render.ts`
  (`@2gis/mapgl`, browser-only), `basemap-watch.ts`, `control-a11y.ts` (names/sizes
  MapGL's own controls, CR-225), `shape.ts`.
- `resilience` — `callWithResilience`, `CircuitBreaker` (ADR-016).
- `config` — shared ESLint/TS/Vitest coverage config.

## Infra

- Local: `docker-compose.yml` — postgres, redis (password `redis-dev-only`), s3
  (SeaweedFS, ADR-025). Dev DB may be native Homebrew Postgres — check `.env`.
- Production: `apps/{web,api}/Dockerfile`, `packages/db/Dockerfile`,
  `docker-compose.prod.yml` (caddy → web → api, `migrate` profile, `backup`),
  `docker-compose.infra.yml` (single-VPS Postgres/Redis/S3 overlay, ADR-031),
  `deploy/deploy.sh` + `deploy/production.env.example`, `deploy/Caddyfile`,
  `deploy/smoke/` (`pnpm smoke:docker`, layers the overlay). Procedure:
  `docs/deployment.md`.
- CI: `.github/workflows/ci.yml` (`ci`, `docker-smoke`), `load-test.yml` (k6),
  `maps-contract.yml` (weekly 2GIS contract).

## Integration boundaries

2GIS only through `maps-2gis` (ADR-010/020); S3 only through `route-storage.ts`/
`lib/image-storage.ts`; email only through `lib/email/`; Redis via `app.redis`
(fail-fast, CR-137) and the notifications queue. Each wraps external calls in
`packages/resilience` and normalises errors into its own domain error.
