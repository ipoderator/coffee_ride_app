# Current Task

## Status

complete

## Task ID

CR-017 — Create ride

## Goal

First `Ride` entity ticket (`.claude/CLAUDE.md` fixed domain entities; `docs/tasks.md`
Rides section, next after CR-015/CR-016 — CR-016 stays blocked on this very ticket
existing, per CR-015's own follow-up note). `docs/design.md` §8: `/organizer/rides/new`
"Create ride".

## Scoping decisions (product.md doesn't split "create" vs "edit" vs "publish" fields)

- **Create vs. edit split.** `docs/design.md` §8 lists a separate "Edit draft" screen
  (CR-018) and `docs/product.md`'s MVP capability #3 ("ride creation/edit/publish")
  already spans three CR tickets. Decision: CR-017 creates a minimal, valid draft —
  only `title`, `bicycleType`, `startsAt`, `startTimezone` are required at creation.
  Every other scalar field the DB table has room for (`description`, capacity, price,
  distance/duration/pace/elevation, difficulty, cover image) is nullable and filled in
  by CR-018, not asked for on this screen. This mirrors CR-011→CR-013's precedent
  (registration = email+password only, profile fields came later) applied to the ride
  entity's own multi-ticket lifecycle.
- **Route/stops/services/requirements are NOT this table.** `docs/product.md`'s MVP
  list separates "ride creation/edit/publish" (#3) from "GPX route" (#5) and "stops/
  services/requirements" (#6) as distinct capabilities; `docs/tasks.md` has dedicated
  Route tickets (CR-027..CR-031). `RideRequirement`/`RideService` have no CR number yet
  at all (same "not yet scheduled" gap KI-021 already flagged for the services enum) —
  not invented here. `Ride`'s own "start"/"finish" from `docs/product.md`'s field list
  map to `RoutePoint` types (`docs/database.md`: "RoutePoint — start/finish/stop/
  danger/water/food/technical/other"), not a `Ride`-level location field.
- **Ownership model.** `docs/database.md`: "Ride — cycling event owned by
  OrganizerProfile" (written after CR-014). ADR-006's older "`ride.organizerId ===
session.userId`" phrasing predates the `OrganizerProfile` decision — the actual FK is
  `rides.organizer_id → organizer_profiles.id`; identity still traces only to the
  session (never a client-supplied id), by resolving the caller's own
  `OrganizerProfile` server-side, same pattern CR-014 already uses. Creating a ride
  requires the caller to already have an `OrganizerProfile` — 403
  `organizer_profile_required` otherwise (mirrors CR-014's `email_verification_
required` gate/UX). This is NOT CR-016 ("Organizer authorization") — that ticket is
  about checking ownership of an _already-existing_ ride on a later mutation
  (edit/publish/cancel, CR-018+); CR-017 only establishes ownership at creation, it
  doesn't need to re-verify it against anything that already exists.
- **Discovered architecture gap, fixed in this ticket:** `RideStatus`/`BicycleType`/
  `DifficultyLevel` (CR-064) were defined directly in `packages/ui/src/terminology.ts`.
  `apps/api` needs the same enums for Zod request validation and `packages/db` needs
  the same value lists for its Postgres enums — but `apps/api` must never depend on
  `packages/ui` (`.claude/rules/architecture.md`: "api -> db/types/maps-core", not
  "api -> ui"). Moved the type + value-list definitions to `packages/types/src/domain/
ride.ts` (the one package both `apps/api` and `packages/ui` may depend on);
  `packages/ui/src/terminology.ts` now re-exports the types from `types` and keeps only
  the Russian label maps (genuinely UI-layer). `packages/ui` gains `types` as a real
  dependency (previously zero packages inside `ui` needed one). No behavior change,
  same values, `.claude/CLAUDE.md`: "do not create duplicate concepts under different
  names" — this was heading toward exactly that (a second definition needed to be
  invented for `apps/api`/`packages/db` otherwise).
- **Timezone.** ADR-012 requires `startsAt` (`timestamptz`) plus the ride's own IANA
  start timezone. Server-side Zod validation accepts any zone `Intl.DateTimeFormat`
  recognizes (loose, same tier as CR-013's phone validation). The web picker is
  deliberately narrower: `docs/product.md`/ADR-012 frame this product around Russia's
  eleven timezones specifically ("Russia spans eleven offsets") — a hard-coded list of
  the 11 real Russian IANA zones with Russian city labels (`RUSSIAN_TIMEZONE_OPTIONS`,
  `packages/ui/src/terminology.ts`), not a raw 400-entry `Intl.supportedValuesOf`
  dump. Converting the organizer's entered local wall-clock time + chosen zone into the
  correct UTC instant needs real zone-offset math (no timezone library is a dependency
  anywhere in this repo yet) — small utility `apps/web/src/lib/datetime/zoned-time.ts`
  (`zonedTimeToUtcIso`), unit-tested against Europe/Moscow (UTC+3) and Asia/
  Krasnoyarsk (UTC+7) — both DST-free year-round (Russia abolished DST in 2014), so no
  DST-transition edge case exists for this product's real target zones.
- **Discoverability.** No "My rides" list screen exists yet (`docs/design.md` §8 lists
  `/organizer/rides` but no `docs/tasks.md` CR ticket builds it — a genuine backlog gap,
  flagged in `known-issues.md`, not silently invented here). Added a nav item
  (`organizerRidesNavItem`, "Заезды" → `/organizer/rides/new`) as a stopgap, same
  discipline as CR-013/014's stub screens — superseded once the real list lands.
  Post-create UX stays self-contained (shows the created ride inline: title, status,
  bicycle type, start date/time) rather than linking to an edit/detail screen that
  doesn't exist yet (CR-018/CR-023).

## Requirements

- `packages/types`: `domain/ride.ts` (`RIDE_STATUSES`/`RideStatus`,
  `BICYCLE_TYPES`/`BicycleType`, `DIFFICULTY_LEVELS`/`DifficultyLevel`, `Ride`),
  `api/rides.ts` (`createRideRequestSchema` — title/bicycleType/startsAt/
  startTimezone only — + `CreateRideResponse`), `index.ts` exports.
- `packages/ui`: `package.json` +`types` dependency; `terminology.ts` re-exports the
  three moved types from `types`, keeps `RIDE_STATUS_TERMS`/`BICYCLE_TYPE_TERMS`/
  `DIFFICULTY_LEVEL_TERMS` as-is; new `RUSSIAN_TIMEZONE_OPTIONS`.
- `packages/db`: `schema/ride.ts` (`rides` table + `ride_status`/`bicycle_type` pg
  enums, CHECK constraints for every nullable numeric field's lower bound and
  difficulty's 1-5 range), `schema/index.ts` export, migration via `db:generate`,
  applied to the local scratch DB.
- `apps/api`: new `modules/rides/` (`ride-response.schema.ts` — full `Ride` shape;
  `rides.service.ts` — `RideServiceError`, `createRide` resolving the caller's
  `OrganizerProfile` (403 `organizer_profile_required` if none), inserting with
  `status: 'draft'` and `updatedBy` set to the caller; `rides.routes.ts` — `POST /v1/
rides`, `requireAuth`; `rides.routes.test.ts`). `routes/v1.ts` registers it. General
  rate-limit tier (not an auth endpoint).
- `apps/web`: `lib/datetime/zoned-time.ts` (+test); new `features/organizer/rides/`
  (`api.ts`, `nav.ts`, `components/CreateRideForm.tsx`, test) — title/bicycleType
  (native `<select>`)/date-time (`datetime-local` input)/timezone (native `<select>`
  from `RUSSIAN_TIMEZONE_OPTIONS`) fields, loading/error/duplicate-submit protection
  per `.claude/rules/frontend.md`, inline success view (no dependency on unbuilt
  screens) using `MetricTile`/`StatusBadge`; `app/organizer/rides/new/page.tsx`;
  `lib/cabinet/organizer-nav.ts` +`organizerRidesNavItem`.
- `docs/database.md`, `docs/api.md`: new `Ride` sections.

## Acceptance criteria

- Migration applies cleanly against the local scratch DB (`coffee_ride_dev`); the
  `organizer_id` FK, both pg enums, and every CHECK constraint hold.
- `POST /v1/rides`: no cookie → 401; verified organizer, no `OrganizerProfile` yet →
  403 `organizer_profile_required`; valid body → 201 with the created `Ride`
  (`status: 'draft'`, `organizerId` = caller's own profile id, `updatedBy` = caller's
  user id, every unset field `null`); invalid payload (empty/too-long title, bad
  `bicycleType`, non-ISO `startsAt`, unrecognized `startTimezone`) → 400
  `validation_error`.
- CSRF check already covers `POST /v1/rides` (verified in tests, not assumed).
- Web: unauthenticated visit to `/organizer/rides/new` redirects to `/login`; a
  verified organizer without an `OrganizerProfile` sees a clear message instead of a
  generic error; a valid submit shows an inline success view with the created ride's
  title/status/bicycle type/start time, correctly converted to the right UTC instant
  for the chosen Russian timezone; duplicate-submit protected. Nav gains "Заезды"
  pointing at the new screen.
- `turbo run lint/typecheck/build/test` (run separately) all green; `format:check`/
  `lint:root` clean.
- Live check: real Postgres + both dev servers — curl sequence (unauth 401, no-profile
  403, valid create 201 cross-checked against a direct DB read, invalid payload 400)
  plus a real-browser walkthrough via `browser-automation`, including verifying the
  stored `starts_at` instant matches the entered local time in the chosen zone.

## Planned files

- `packages/types/src/domain/ride.ts` (new), `src/api/rides.ts` (new), `src/index.ts`
  (+exports).
- `packages/ui/package.json` (+`types` dep), `src/terminology.ts` (move 3 types out, +`RUSSIAN_TIMEZONE_OPTIONS`).
- `packages/db/src/schema/ride.ts` (new), `schema/index.ts` (+export), new migration.
- `apps/api/src/modules/rides/{ride-response.schema.ts,rides.service.ts,
rides.routes.ts,rides.routes.test.ts}` (new), `apps/api/src/routes/v1.ts` (register).
- `apps/web/src/lib/datetime/zoned-time.ts` (new, +test).
- `apps/web/src/features/organizer/rides/{api.ts,nav.ts,
components/CreateRideForm.tsx,rides.test.tsx}` (new).
- `apps/web/src/app/organizer/rides/new/page.tsx` (new).
- `apps/web/src/lib/cabinet/organizer-nav.ts` (+entry).
- `docs/api.md`, `docs/database.md` (new Ride sections).

## Implementation progress

- [x] Plan written (this file)
- [x] `packages/types` + `packages/ui` (type-ownership fix + new contracts)
- [x] `packages/db` schema + migration
- [x] `apps/api` rides module + tests
- [x] `apps/web` zoned-time util + feature + page + nav
- [x] Full validation
- [x] Live check
- [x] Context/docs updated (changelog, project-state, architecture-map,
      known-issues, tasks.md, docs/api.md, docs/database.md)
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck lint test build` (all 9 packages, run together against
  a real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
  — Docker Desktop unavailable in this environment, local Homebrew Postgres
  used instead, same as CR-015/CR-014): all 25 tasks green. `apps/api` 58
  tests (was 50, +8 in `rides.routes.test.ts`); `apps/web` 44 tests (was 35,
  +5 in `rides.test.tsx`, +4 in `zoned-time.test.ts`); `packages/ui` 85 tests
  unchanged (type-ownership move only, no behavior change — confirmed by the
  suite staying green); `packages/types` typecheck/lint clean. `next build`
  compiles `/organizer/rides/new` cleanly.
- `pnpm format:check` / `pnpm lint:root`: clean (after one `prettier --write`
  pass this session on 3 files).
- Live check via curl against a real `apps/api` + `coffee_ride_dev`: no
  cookie → 401; verified organizer, no profile → 403
  `organizer_profile_required`; create organizer profile → valid ride create
  → 201 (cross-checked against a direct `SELECT` — `starts_at` stored as the
  correct UTC instant); empty title → 400; invalid `bicycleType` → 400;
  invalid `startTimezone` → 400; mismatched `Origin` → 403
  `csrf_origin_mismatch`.
- Live browser check via the `browser-automation` skill against a real `next
dev` server + `apps/api`: unauthenticated `/organizer/rides/new` →
  redirected to `/login`; logged in; form showed all 4 fields with correct
  defaults (Гравийный/Москва); filled title, `2027-06-15T18:30`, changed zone
  to Красноярск (UTC+7); submitted; success view showed "Черновик заезда
  создан", the `Черновик` status badge, the title, and — critically — the
  start time displayed back as the correct LOCAL Krasnoyarsk time ("15 июня
  2027 18:30"), not shifted to UTC; a direct DB read independently confirmed
  the stored instant (`14:30:00+03` = `11:30 UTC`) is exactly 18:30
  Krasnoyarsk (UTC+7). Dashboard nav showed the new "Заезды" entry. No
  console errors beyond the expected pre-login 401. Test accounts/rides
  deleted from the scratch DB afterward.
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation (not left open):

- Architecture gap: `RideStatus`/`BicycleType`/`DifficultyLevel` lived in
  `packages/ui`, which `apps/api` cannot depend on
  (`.claude/rules/architecture.md`). Fixed by moving the definitions to
  `packages/types` and having `packages/ui` re-export them — caught during
  planning, before any code was written that would have had to invent a
  second, drifting copy.

New known issues opened (not silently worked around):

- KI-024: no `docs/tasks.md` ticket builds the organizer's "My rides" list
  `docs/design.md` §8 describes. `organizerRidesNavItem` points straight at
  `/organizer/rides/new` as a stopgap. Flagged as something CR-018 will hit
  too unless a real ticket is scheduled first.
- KI-023 widened a third time: `Ride.coverImageUrl` is the same
  S3-pipeline-deferred gap `User`/`OrganizerProfile` already carry.

## Final result

CR-017 complete. First `Ride` table (`packages/db`, owned by
`OrganizerProfile`) and `POST /v1/rides` (`apps/api`, requires an existing
`OrganizerProfile`, creates a minimal valid `draft`) implemented, plus
`/organizer/rides/new` (`apps/web`) with correct local-time-to-UTC-instant
conversion for all 11 real Russian timezones. Deliberately scoped to
"create," not "create and fully configure" — every field beyond
`title`/`bicycleType`/`startsAt`/`startTimezone` stays `null`, left to CR-018
("Edit draft"). A real architecture gap (`RideStatus`/`BicycleType`/
`DifficultyLevel` living somewhere `apps/api` couldn't depend on) was found
and fixed as part of this ticket, not worked around. CR-016 ("Organizer
authorization") remains deliberately unstarted — genuinely possible now that
`Ride` exists, but the user's own instruction was to follow the
already-documented plan, and that plan ties CR-016 to a mutation on an
existing ride (CR-018+), not this ticket's creation-only endpoint. All
acceptance criteria met, full validation suite green, live-verified end to
end over both curl and a real browser session including independent DB
verification of the timezone math. `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md`, `.claude/context/architecture-map.md`,
`.claude/context/known-issues.md`, `docs/api.md`, `docs/database.md` all
updated. Not yet committed — `git diff`/`git status` reviewed next;
pre-existing unrelated pending changes (`docs/product.md`, `.mcp.json`,
`skills-lock.json`) again left untouched and out of scope.
