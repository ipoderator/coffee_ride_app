# Current Task

## Status

complete

## Task ID

CR-032 — Register (bundled with CR-033 "Cancel registration"; CR-034 "Capacity
enforcement" and CR-035 "Duplicate protection" are delivered as part of CR-032, not
deferred — `.claude/CLAUDE.md`/`.claude/rules/database.md` require registration to
_atomically_ protect availability/capacity/duplicates from the start, the same
"invariant baked in from day one, not a later ticket" precedent as CR-057 (password
hashing, delivered inside CR-011) and CR-062 (session store, inside CR-012)).

## Goal

`docs/tasks.md` Registration section, first ticket after the now-complete Route
section. `docs/database.md`: eighth domain table, `Registration — User ↔ Ride`.
`docs/api.md` Registration section (pre-sketched): `POST`/`DELETE /v1/rides/:id/register`
(this ticket), `GET /v1/rides/:id/participants` (CR-037, not this ticket), `POST`/
`DELETE /v1/rides/:id/waitlist` (CR-036, not this ticket — needs its own `WaitlistEntry`
table and auto-promotion logic, genuinely separate scope).

## Scope decisions (this session, not ADR-level)

- **New capability module, not folded into `rides`**: unlike `Stop`/`RoutePoint` (which
  live inside `rides.service.ts`/`rides.routes.ts` as organizer-authored ride
  _configuration_, reusing `resolveOwnDraftRide`), `Registration` is participant-
  initiated, has a different actor and a different, larger surface (capacity locking,
  future waitlist/participant-list tickets) and is explicitly named as its own
  capability in `.claude/rules/architecture.md`'s Feature boundaries list (and
  `routes/v1.ts`'s own comment already anticipated it). New module:
  `apps/api/src/modules/registrations/`, routes registered under the same `/rides`
  prefix in `routes/v1.ts` (paths are `/v1/rides/:id/register`) so the URL shape is
  unaffected — just a second plugin sharing that prefix.
- **Atomicity mechanism**: a single Postgres row lock, not separate app-level checks.
  `createRegistration` opens a transaction, `SELECT ... FROM rides WHERE id = $1 FOR
UPDATE` (locks only the `rides` row, not a join), re-checks `status ===
'registration_open'` inside the lock, then checks for an existing active registration
  and compares the active count against `participantLimit` before inserting — all
  inside the same lock, so two concurrent requests for the _same_ ride are fully
  serialized by Postgres itself (the second sees the first's committed state). This one
  mechanism satisfies capacity, duplicate-protection, and double-submit protection at
  once; the DB-level unique partial index (below) is the invariant backstop per
  `.claude/rules/database.md`, not a mechanism this code path needs to catch a
  constraint-violation error for (the lock already prevents the race).
- **Visibility/ownership resolution happens once, before the lock, for correct 404 vs.
  409 classification**: same rule as `getRideForViewer` (owner sees a `draft` ride,
  anyone else gets `404 ride_not_found` for a non-existent id _or_ someone else's
  `draft` — same resource-enumeration-safe shape). Re-checking `registration_open`
  status a second time inside the lock guards the (harmless, non-security) race where
  an organizer closes registration between the visibility check and the lock.
- **Full ride → 409, not auto-waitlist**: `WaitlistEntry` doesn't exist yet (CR-036).
  `REGISTRATION_ACTION_TERMS.full` ("Мест не осталось") already exists in
  `packages/ui/src/terminology.ts` (pre-scaffolded ahead of this ticket, same pattern as
  `RIDE_STATUS_TERMS` pre-existing every lifecycle status before its transition ticket
  landed) — used here; `.waitlisted` stays unused until CR-036.
- **Cancellation keeps history, doesn't delete the row**: `status: 'active' |
'cancelled'` + nullable `cancelledAt`, not a hard delete — matches this project's
  audit-trail discipline (`.claude/rules/security.md`) and lets a participant
  re-register after cancelling (a fresh row, not resurrecting the old one) without
  losing the record that they once cancelled.
- **No extra gating on `DELETE .../register` beyond "an active registration exists"**:
  nothing in `docs/product.md`/`docs/database.md` restricts cancellation to a
  particular ride status — not invented here, same "don't invent an invariant the docs
  don't ask for" discipline CR-031 used for route-point uniqueness.
- **`GET /v1/rides/:id` gains two additive fields**: `registrationsCount` (active count,
  for the participant-limit metric — `.claude/rules/database.md`: "Live status, not
  stale coordination... reflect the database in real time") and `viewerRegistration`
  (the caller's own active registration, `null` if none/unauthenticated) — resolved
  inline in `getRideForViewer` (same embedding precedent as `route`/`stops`/
  `routePoints`), reusing `registrations.service.ts`'s exported `toRegistration` mapper
  rather than duplicating it (no import cycle: `registrations.service.ts` doesn't import
  from `rides.service.ts`).
- **Not this ticket**: `GET /v1/rides/:id/participants` (CR-037, organizer-facing,
  needs its own response-minimization design per `.claude/rules/security.md` — "no
  endpoint returns more participant data than the caller's capability allows");
  waitlist (CR-036); "My registrations" (`/me/rides`, `docs/design.md`'s screen
  inventory) — no ticket in `docs/tasks.md` owns it (same shape of gap as
  KI-024/025/027). Added as a new ticket (CR-091) and a `known-issues.md` entry rather
  than silently deferred, same "real gap, add a ticket" discipline as CR-088/089/090 —
  not built this session to keep this ticket's scope to what CR-032..035 actually cover.

## Endpoints

```
POST   /v1/rides/:id/register
DELETE /v1/rides/:id/register
```

## Planned files

- `packages/db/src/schema/registration.ts` (new, `registration_status` pg enum) +
  `schema/index.ts` export + migration.
- `packages/types/src/domain/registration.ts` (new `REGISTRATION_STATUSES`/
  `RegistrationStatus`/`Registration`) + `src/index.ts` export.
- `packages/types/src/api/rides.ts`: extend `GetRideResponse` with
  `registrationsCount`/`viewerRegistration`; add `CreateRegistrationResponse`.
- `apps/api/src/modules/registrations/registration-response.schema.ts` (new).
- `apps/api/src/modules/registrations/registrations.service.ts` (new):
  `RegistrationServiceError`, `toRegistration`, `createRegistration`/
  `cancelRegistration`.
- `apps/api/src/modules/registrations/registrations.routes.ts` (new): two routes.
- `apps/api/src/modules/registrations/registrations.routes.test.ts` (new): happy
  path, duplicate-active → 409, full ride → 409, not-open statuses → 409, draft
  non-owner → 404, nonexistent ride → 404, unauthenticated → 401, cancel happy path
  - re-register after cancel, cancel-without-registration → 404.
- `apps/api/src/modules/rides/rides.service.ts`: extend `getRideForViewer`.
- `apps/api/src/modules/rides/ride-response.schema.ts` /
  `apps/api/src/modules/rides/rides.routes.ts`: extend `rideDetailResponseSchema`.
- `apps/api/src/routes/v1.ts`: register `registrationsRoutes` under `/rides`.
- `apps/web/src/features/participant/ride-detail/`: `RegistrationButton` component +
  `api.ts` additions (register/cancel calls), wired into `RideDetailView` + a
  "Участники" `MetricTile` using `registrationsCount`.
- `packages/ui/src/terminology.ts`: no new keys expected (`REGISTRATION_ACTION_TERMS`
  already covers `register`/`cancel`/`full`) — verify during implementation.
- `docs/api.md`, `docs/database.md`, `docs/tasks.md` (+ new CR-091 ticket),
  `docs/changelog.md`, `.claude/context/project-state.md`,
  `.claude/context/known-issues.md` (CR-091 forward note).

## Implementation progress

- [x] packages/db schema + migration (`0009_perpetual_junta.sql`), applied to local
      `coffee_ride_dev`
- [x] packages/types (`domain/registration.ts`, `api/registrations.ts`,
      `GetRideResponse` extended)
- [x] apps/api registrations module (service + routes + response schema)
- [x] apps/api rides.service.ts/ride-response.schema.ts additive fields
      (`registrationsCount`/`viewerRegistration`)
- [x] apps/api tests (new `registrations.routes.test.ts`, 10 tests)
- [x] apps/web `RegistrationButton` + participant ride-detail wiring
- [x] apps/web tests (4 new + fixture updates across `ride-detail.test.tsx`)
- [x] docs updates (api.md, database.md, tasks.md +CR-091, changelog.md,
      known-issues.md +KI-037, project-state.md)
- [x] full validation (lint/typecheck/build/test)
- [x] live verification (curl + browser-automation)
- [x] project-state.md update

## Validation results

`turbo run lint typecheck build test --force` — 25/25 tasks green across all 8
workspace members, against a real `DATABASE_URL=postgresql://glebchurkin@localhost:
5432/coffee_ride_dev`. `apps/api`: 198 tests (was 188, +10). `apps/web`: 125 tests
(was 121, +4). `pnpm format:check`/`lint:root` clean (one `prettier --write` pass on
6 files). A concurrent run had one `apps/web` test flake from machine resource
contention (same known pattern CR-031's own validation noted) — a sequential re-run
was fully green, confirming it was environmental, not a regression.

Live-verified via curl against a real Postgres + `apps/api`: organizer creates a ride
with `participantLimit: 1`, publishes, opens registration; participant 1 registers
(201); participant 2 rejected (409 `ride_full`); participant 1's duplicate rejected
(409 `registration_already_exists`); `GET /v1/rides/:id` as participant 1 shows
`registrationsCount: 1` + matching `viewerRegistration`; participant 1 cancels (204);
participant 2 then registers into the freed spot (201) — cross-checked against a
direct DB read (one `cancelled` row with `cancelledAt` set, one fresh `active` row).

Live browser-verified via the `browser-automation` skill against a real `next dev`
server + `apps/api` (the pre-existing dev server on :3000 was serving a stale build
from before this session's `packages/types` changes and was restarted): loaded
`/rides/[id]` with a participant session cookie, clicked "Зарегистрироваться",
confirmed the button switched to "Отменить регистрацию" and the participants tile
went "0 из 10" → "1 из 10", clicked cancel, confirmed the button reverted and the
tile returned to "0 из 10" — 0 console errors. Network capture confirmed the actual
`POST`/`DELETE` requests returned `201`/`204`; one `net::ERR_ABORTED` was reported
against the already-`204`'d `DELETE` request — reproduced consistently, confirmed
benign (response received before the abort event, correct final UI state, correct DB
row) — a dev-server/browser teardown artifact, not a functional failure. All scratch
test data (rides/organizer profiles/users) deleted from the DB afterward.

## Discovered issues

KI-037 opened deliberately (no "My registrations" list yet, tracked as new ticket
CR-091 — see this file's own scope decision above), not a bug found mid-implementation.
The pre-existing `:3000` dev server needed a restart (stale build predating this
session's `packages/types` changes) — not a code defect, noted here for continuity.

## Final result

CR-032 ("Register") complete, bundled with CR-033 ("Cancel registration"); CR-034
("Capacity enforcement") and CR-035 ("Duplicate protection") delivered as part of
CR-032 rather than deferred, per `.claude/CLAUDE.md`'s atomicity requirement. Eighth
domain table, a new `registrations` capability module, two new endpoints, an additive
`registrationsCount`/`viewerRegistration` on ride detail, and a participant-facing
`RegistrationButton` — all live-verified end to end. `docs/tasks.md`'s Registration
section now has CR-036 ("Waitlist"), CR-037 ("Organizer participant list"), and the
newly added CR-091 ("My registrations") remaining.
