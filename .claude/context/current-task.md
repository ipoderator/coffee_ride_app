# Current Task

## Task ID

CR-091 — "My registrations" (`/me/rides`)

## Goal

Close the last open item in `docs/tasks.md`'s Registration section (KI-037): a
participant-facing list of their own active registrations, grouped into Upcoming/Past
tabs (`docs/design.md` §8).

## Requirements

- `docs/product.md`: "view registered rides" is a named participant capability.
- `docs/design.md` §8: `/me/rides` — "My registrations", Upcoming / past tabs.
- New collection endpoint, cursor-paginated per ADR-011, organizer-only-equivalent
  visibility rule N/A here (caller sees only their own rows — identity from session,
  never a client-supplied id, `.claude/rules/security.md`).
- No `packages/db` schema change — `registrations.user_id` already has an index sized
  for this query (KI-037's own note).

## Scope decisions (made before implementing, not after)

- **Registrations only, not waitlist entries.** `docs/product.md` names "view
  registered rides", not "view queue position"; KI-037's own next-action text also
  only asks for `GET /v1/registrations/mine`. A participant's `waiting` entry is still
  visible on the specific ride's `/rides/[id]` page (`RegistrationButton`, unchanged).
  Widening this screen to include waitlist entries is a follow-up, not this ticket's
  scope, if a future doc asks for it.
- **Active registrations only** (`status: 'active'`), same filter
  `listParticipants`/`listWaitlist` (CR-037) already use — a cancelled registration
  isn't "a ride you're registered for" any more; the row survives in the DB as an
  audit trail (CR-033), not as something to surface back to the participant here.
- **Two independent, server-filtered tabs**, not one fetched page split client-side:
  `?when=upcoming` (`ride.startsAt >= now()`, ordered `startsAt asc` — soonest first,
  same convention CR-025/KI-029 set for discovery) and `?when=past` (`ride.startsAt <
now()`, ordered `startsAt desc` — most recent past first). A single page split
  client-side would silently hide upcoming rides that happen to sort after enough past
  ones on page 1; two independently-paginated queries avoid that without inventing new
  pagination machinery. `when` required (no "all" default) — same "explicit filter,
  not a default that changes shape" discipline `bicycleType` already uses.
- **No `date_trunc('milliseconds', ...)` cursor fix needed.** Per KI-039's resolution
  note: `ride.startsAt` is organizer-entered, not a `now()`-derived microsecond-
  precision value, so it never triggers the ascending-cursor bug that fix targets
  (same reasoning discovery's own `startsAt asc` sort already relies on).
- **Response item is `{ registration, ride }`, `ride: PublicRide`** — reuses the exact
  type `GET /v1/rides` (discovery) and `GET /v1/rides/mine` (organizer) already
  export, instead of minting a third ride-summary shape (`.claude/CLAUDE.md`: "Do not
  create duplicate concepts under different names").
- **New URL prefix, not nested under `/rides`.** `registrationsRoutes` is mounted at
  `/rides` (its paths nest under a specific ride). This list has no single-ride
  parent, and `/v1/rides/mine` is already taken by the organizer's own-rides list
  (CR-088) — reusing that name for a different resource would collide/confuse.
  `GET /v1/registrations/mine` instead, its own small plugin
  (`myRegistrationsRoutes`) in the same `registrations.routes.ts` file (same
  capability module — `.claude/rules/architecture.md`'s feature-boundary list — just
  a second URL family), registered under its own `/registrations` prefix in
  `routes/v1.ts`.
- **`apps/web`: no shared `RideCard` reuse.** `docs/design.md` §9 already documents
  `RideCard` as feature-local to discovery, not `packages/ui`
  (`.claude/rules/extensibility.md`: a feature module must not depend on another
  feature module's internals). New feature-local `MyRideCard`, built from the same
  `packages/ui` primitives (`Card`/`MetricRow`/`MetricTile`/`StatusBadge`), same
  precedent CR-028 set for its own independent `RouteMapPlaceholder`.
- **No "load more" UI** — one page per tab, same "cursor-paginated API, no pagination
  UI yet" precedent every other list screen in this repo already established
  (`/mine`, discovery, CR-037's participant/waitlist tables).

## Acceptance criteria

- `GET /v1/registrations/mine?when=upcoming|past` requires auth (`401` with no
  session), returns only the caller's own active registrations joined with their
  ride's public+organizer summary, correctly split/ordered by `when`.
- `/me/rides` renders Upcoming/Past tabs, each with its own loading/error/empty state,
  reusing `viewerRegistration`-style cancel affordance is NOT in scope here (cancel
  stays on `/rides/[id]`) — this screen is read-only, a pure list + link out.
- New participant nav entry ("Мои регистрации") in `PARTICIPANT_NAV_ITEMS`.
- `turbo typecheck`/`lint`/relevant `test` pass; no unrelated changes.

## Planned files

- `packages/types/src/api/registrations.ts` — `MyRegistrationSummary`,
  `myRegistrationsQuerySchema`/`MyRegistrationsQuery`, `ListMyRegistrationsResponse`.
- `apps/api/src/modules/registrations/registrations.service.ts` —
  `listMyRegistrations`.
- `apps/api/src/modules/registrations/registrations.routes.ts` — response schema +
  new `myRegistrationsRoutes` plugin.
- `apps/api/src/routes/v1.ts` — register the new plugin under `/registrations`.
- `apps/api/src/modules/registrations/registrations.routes.test.ts` — new tests.
- `docs/api.md` — document the new endpoint.
- `apps/web/src/features/participant/my-rides/` (new feature module): `api.ts`,
  `nav.ts`, `components/MyRidesView.tsx`, `components/MyRideCard.tsx`,
  `my-rides.test.tsx`.
- `apps/web/src/lib/cabinet/participant-nav.ts` — register the new nav item.
- `apps/web/src/app/me/rides/page.tsx` — new route.
- `packages/ui/src/terminology.ts` — new terms for the screen.

## Implementation progress

- [x] Backend types/service/routes/tests
- [x] `docs/api.md`
- [x] Frontend feature module + nav + route + tests
- [x] Validation pass (typecheck/lint/test/build)
- [x] Context/changelog/tasks update

## Validation results

- `turbo run lint typecheck test`: 19/19 tasks passed (api 226 tests, web 136 tests
  incl. 5 new, ui 85 tests, types/db/maps-* typecheck/build).
- `NODE_ENV=production turbo run build`: all 6 build tasks pass, `/me/rides` present
  in `web:build`'s route list.
- Live curl verification against a real Postgres + running `apps/api`: upcoming/past
  split correctly, organizer/ride data correct, `401` with no session, `400` with a
  missing `when`. Scratch data deleted afterward, confirmed by a direct count query.

## Discovered issues

- Interpolating a raw JS `Date` into a hand-written `sql` template for the
  `startsAt >=/< now()` filter threw `ERR_INVALID_ARG_TYPE` — same root cause
  `rides.service.ts`'s `listOwnRides` already documents. Fixed by passing the ISO
  string with an explicit `::timestamptz` cast before writing any tests against it.

## Final result

Done. `docs/tasks.md`'s Registration section (CR-032..037, CR-091) is now fully
complete. `.claude/context/project-state.md`, `docs/changelog.md`,
`.claude/context/architecture-map.md`, and `.claude/context/known-issues.md`
(KI-037 → Resolved) all updated. Next logical task: Communication (CR-038..041).
