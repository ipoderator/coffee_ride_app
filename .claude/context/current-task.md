# Current Task

## Status

complete

## Task ID

CR-036 — Waitlist

## Goal

`docs/tasks.md` Registration section, next unchecked ticket after CR-032..035. `docs/api.md`
pre-sketched `POST`/`DELETE /v1/rides/:id/waitlist` (not yet implemented). `docs/database.md`:
ninth domain table, `WaitlistEntry`. `docs/product.md` MVP #8 "waitlist"; organizer capability
"manage registrations and waitlist".

## Scope decisions (this session, not ADR-level)

- **Lives inside the existing `registrations` capability module**, not a new one:
  `WaitlistEntry` is tightly coupled to `Registration` (promotion on cancellation touches both
  tables in one transaction) — `.claude/rules/resilience.md` says don't let one module reach
  into another's internals, so keeping both in `registrations.service.ts`/`.routes.ts` avoids
  that reach-across entirely, cleaner than a new `waitlist` module calling into
  `registrations`'s internals.
- **Join requires the ride to actually be full**: `POST .../waitlist` re-checks
  `participantLimit` vs. active registration count itself (inside a `SELECT ... FOR UPDATE`
  lock on the `rides` row, same mechanism `createRegistration` uses) — `409 ride_not_full` if
  there's still an open spot (client should call `register` instead, not join a queue for a
  spot that already exists). Also requires `registration_open` (`409
ride_registration_not_open` otherwise, same gate as `register`), no existing active
  registration (`409 registration_already_exists`, reused), and no existing waiting entry
  (`409 waitlist_entry_already_exists`).
- **FIFO by `createdAt`, no manual `position` column**: unlike `Stop` (which needed
  organizer-controlled manual order), a waitlist queue's order is exactly its join order —
  storing a redundant `position` column would just be another thing to keep in sync. Queue
  order is `ORDER BY created_at ASC` wherever it matters (promotion, a future organizer list).
- **Auto-promotion on cancellation, inside `cancelRegistration`'s own transaction**: when an
  active registration is cancelled, lock the `rides` row, then promote the oldest `waiting`
  entry (if any) for that ride into a brand-new active `Registration` row, marking the
  waitlist entry `status: 'promoted'` (terminal, keeps the row — same audit-trail discipline
  as `Registration.cancelled`). This is what `.claude/rules/database.md`/`resilience.md` mean
  by "waitlist consistency" enforced in one transaction, not a separate step. Promotion isn't
  gated on the ride still being `registration_open` — the freed slot is real regardless of
  whether new self-service registration is currently allowed; not gated on ride status being
  non-`cancelled` either in practice, since a `cancelled` ride's registrations were never
  cancelled through this path in a way that matters (out of scope to special-case further —
  no doc names this edge case).
- **`cancelRegistration`'s signature stays `Promise<void>`**: promotion is a side effect, not
  something the caller (the cancelling participant) needs surfaced synchronously — notifying
  the promoted participant is explicitly CR-038/039 scope (Communication section), not this
  ticket. No behavior here silently regresses that later ticket; it'll read the same DB state.
- **`GET /v1/rides/:id` gains one additive field**: `viewerWaitlistEntry` (the caller's own
  `waiting` entry, `null` if none/unauthenticated/promoted/cancelled) — same embedding
  precedent as `viewerRegistration`. No `waitlistCount` this ticket — nothing participant-facing
  needs a total queue size yet (CR-037's organizer participant list is the natural place for
  that, if ever asked for).
- **`RegistrationButton` gains a third state**: full + no viewer registration/waitlist entry ->
  "Встать в список ожидания" (join waitlist, new term); has a `waiting` entry -> "В списке
  ожидания" label (existing `REGISTRATION_ACTION_TERMS.waitlisted`) + a secondary "Покинуть
  список ожидания" (leave waitlist, new term) button, same layout pattern as the existing
  register/cancel pair.
- **Not this ticket**: `GET /v1/rides/:id/participants` + any waitlist visibility for the
  organizer (`WaitlistTable`, CR-037); notifying a promoted participant (CR-038/039); "My
  registrations" (CR-091, already tracked).

## Endpoints

```
POST   /v1/rides/:id/waitlist
DELETE /v1/rides/:id/waitlist
```

## Planned files

- `packages/db/src/schema/waitlist-entry.ts` (new, `waitlist_entry_status` pg enum:
  `waiting`/`promoted`/`cancelled`) + `schema/index.ts` export + migration.
- `packages/types/src/domain/waitlist-entry.ts` (new `WAITLIST_ENTRY_STATUSES`/
  `WaitlistEntryStatus`/`WaitlistEntry`) + `src/index.ts` export.
- `packages/types/src/api/registrations.ts`: add `CreateWaitlistEntryResponse`.
- `packages/types/src/api/rides.ts`: extend `GetRideResponse` with `viewerWaitlistEntry`.
- `apps/api/src/modules/registrations/waitlist-entry-response.schema.ts` (new).
- `apps/api/src/modules/registrations/registrations.service.ts`: add `toWaitlistEntry`,
  `joinWaitlist`, `leaveWaitlist`; extend `cancelRegistration` with promotion.
- `apps/api/src/modules/registrations/registrations.routes.ts`: two new routes.
- `apps/api/src/modules/registrations/registrations.routes.test.ts`: join happy path, not-full
  → 409, not-open → 409, duplicate active registration → 409, duplicate waiting entry → 409,
  draft non-owner → 404, unauthenticated → 401, leave happy path, leave-without-entry → 404,
  promotion-on-cancel (oldest waiting entry becomes active, `promotedAt` set).
- `apps/api/src/modules/rides/rides.service.ts`: extend `getRideForViewer`.
- `apps/api/src/modules/rides/ride-response.schema.ts` / `rides.routes.ts`: extend response.
- `apps/web/src/features/participant/ride-detail/api.ts`: `joinRideWaitlist`/
  `leaveRideWaitlist` typed calls.
- `apps/web/src/features/participant/ride-detail/components/RegistrationButton.tsx`: third
  state.
- `apps/web/src/features/participant/ride-detail/components/RideDetailView.tsx`: wire
  `viewerWaitlistEntry` through.
- `packages/ui/src/terminology.ts`: add `joinWaitlist`/`leaveWaitlist` to
  `REGISTRATION_ACTION_TERMS`.
- `docs/api.md`, `docs/database.md`, `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`, `.claude/context/known-issues.md` if anything surfaces.

## Implementation progress

- [x] packages/db schema + migration (`0010_nappy_speed.sql`), applied to local
      `coffee_ride_dev`
- [x] packages/types (`domain/waitlist-entry.ts`, `CreateWaitlistEntryResponse`,
      `GetRideResponse` extended)
- [x] apps/api registrations module (join/leave/promotion)
- [x] apps/api rides.service.ts/ride-response.schema.ts additive field
      (`viewerWaitlistEntry`)
- [x] apps/api tests (14 new, in existing `registrations.routes.test.ts`)
- [x] apps/web wiring + terminology (2 new `REGISTRATION_ACTION_TERMS` keys)
- [x] apps/web tests (replaced the obsolete "full" test, added 2 new ones)
- [x] docs updates (api.md, database.md, design.md, tasks.md, changelog.md,
      known-issues.md +KI-038, project-state.md)
- [x] full validation (lint/typecheck/build/test)
- [x] live verification (curl)
- [x] project-state.md update

## Validation results

`turbo run lint typecheck build test --force` — 25/25 tasks green across all 9
workspace members, against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`. `apps/api`: 212
tests (was 198, +14). `apps/web`: 126 tests (was 125, net +1 after replacing the
obsolete "full" test with two new waitlist tests). `packages/ui`: unchanged at 85
tests (existing fixed-object assertion updated in place). `pnpm format:check`/
`lint:root` clean (one `prettier --write` pass on 2 files touched mid-session).

Live-verified via curl against a real Postgres + `apps/api`: organizer creates a ride
with `participantLimit: 1`, publishes, opens registration; participant 1 registers
(201, fills the only spot); participant 2's registration is rejected (409 `ride_full`);
participant 2 joins the waitlist (201); participant 3 joins too (201); participant 2's
duplicate join is rejected (409 `waitlist_entry_already_exists`); ride detail as
participant 3 shows `registrationsCount: 1` and their own `waiting` entry; participant
1 cancels (204) — ride detail as participant 2 now shows an active `viewerRegistration`
and `viewerWaitlistEntry: null` (promoted), while participant 3 still shows a `waiting`
entry (FIFO order respected — the oldest waiting entry was promoted, not the newer
one); participant 3 leaves the waitlist (204), a second leave attempt correctly 404s.
All scratch data deleted from the DB afterward, confirmed by a direct count query.

## Discovered issues

KI-038 opened deliberately: sourcing the root `.env` (which sets
`NODE_ENV=development`) into the shell before running `next build` crashes
`apps/web`'s production build (`<Html>` outside `pages/_document`, on `/404`/
`/_error`) — confirmed via `git stash` that this reproduces identically on `main`
before this session's changes, so it's a pre-existing environment/tooling quirk, not a
regression. Worked around by overriding `NODE_ENV=production` for the build command
specifically; no code change needed or made.

## Final result

CR-036 ("Waitlist") complete. Ninth domain table (`waitlist_entries`), two new
endpoints (`POST`/`DELETE /v1/rides/:id/waitlist`) inside the existing `registrations`
capability module, an additive `viewerWaitlistEntry` on ride detail, and — the core new
mechanism — auto-promotion of the oldest waiting entry into a fresh active registration
whenever a cancellation frees a spot, atomic with the cancellation itself. Participant
UI (`RegistrationButton`) gained join/leave-waitlist states. All live-verified end to
end, including FIFO promotion order across three participants. `docs/tasks.md`'s
Registration section now has CR-037 ("Organizer participant list") and CR-091 ("My
registrations") remaining.
