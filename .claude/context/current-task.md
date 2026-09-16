# Current Task

## Status

complete

## Task ID

CR-037 — Organizer participant list

## Goal

`docs/tasks.md` Registration section, next unchecked ticket after CR-032..036.
`docs/api.md` pre-sketches `GET /v1/rides/:id/participants` (not yet implemented,
"will need its own waitlist-visibility design, not reused from this ticket's
participant-facing shape"). `docs/design.md` §8: `/organizer/rides/[id]/participants`
("Participants + waitlist"), §9 component inventory: `ParticipantTable`, `WaitlistTable`.
`docs/product.md`: organizer capability "manage registrations and waitlist" — this
ticket is the _view_ half (no removal/messaging action asked for by any doc).

## Scope decisions (this session, not ADR-level)

- **Two endpoints, not one combined payload**: `GET /v1/rides/:id/participants`
  (active registrations) and `GET /v1/rides/:id/waitlist` (adds a `GET` to the
  existing `POST`/`DELETE /v1/rides/:id/waitlist` path — same resource, organizer's
  collection view of it). Each is independently cursor-paginated per ADR-011
  ("collections are paginated... a new collection endpoint without pagination is a
  contract bug") — a single combined response couldn't satisfy that per sub-list.
  Matches `docs/design.md`'s two separate components (`ParticipantTable`/
  `WaitlistTable`) directly.
- **Organizer-only, any ride status** — not draft-only (`resolveOwnDraftRide` doesn't
  apply; an organizer needs this most _after_ publishing, once real registrations
  exist). New service-local ownership check (`assertOwnRide`) mirrors
  `rides.service.ts`'s `publishRide`-style pattern: ride's organizer must be the
  caller, `404 ride_not_found` for both "no such ride" and "someone else's ride" —
  same resource-enumeration-safe rule used everywhere else, reusing
  `registrations.service.ts`'s existing `RIDE_NOT_FOUND` factory.
- **Own response shape, deliberately minimal — no phone/email**: `.claude/rules/
security.md` ("protect participant contact... information", "never return
  unnecessary participant data") and `packages/db/src/schema/user.ts`'s own comment
  on `phone` ("returned only to the profile's own owner... this is the constraint to
  preserve once [another endpoint exposes another user's row] does") — this ticket is
  exactly that endpoint. Shipped shape: `{ id, userId, displayName, createdAt }` per
  row (`RideParticipantSummary`, reused for both endpoints' items) — enough to
  identify who's who in a list, nothing an organizer could use to contact a
  participant directly outside the app. No product doc names a "contact participant"
  feature yet (that's Communication section, CR-038+, via in-app
  notifications/updates, not a phone number).
- **No stored/computed queue "position" field** — same reasoning CR-036 already
  established for `WaitlistEntry` itself: order _is_ `createdAt asc`, returned as the
  array's own order. A client wanting a display position can enumerate the page
  itself; nothing asks for a stable position across pages.
- **Participants list = `status: 'active'` registrations only**, ordered
  `createdAt asc` (registration order — oldest first, the natural "who's been in the
  longest" order for a management list; deliberately not `/mine`'s `createdAt desc`,
  which is a _different_ list's own precedent for "newest draft first"). Waitlist list
  = `status: 'waiting'` entries only, ordered `createdAt asc` (exact FIFO order,
  matching the promotion query CR-036 already uses) — cancelled/promoted entries are
  history, not part of the organizer's "who's currently queued" view.
- **No "load more" pagination UI this ticket** — same precedent `RidesList`
  (`/organizer/rides`, CR-088) and `DiscoveryView` (`/`, CR-024) already set: every
  paginated list screen in this codebase so far fetches page one only; the API is
  correctly cursor-paginated per ADR-011 for whenever a screen actually needs more
  than one page. Not an oversight — matching established scope discipline.
- **Reuses `listRidesQuerySchema`/`ListRidesQuery`** (`packages/types/src/api/
rides.ts`, already just `{ limit?, cursor? }`) for both new endpoints' querystring
  instead of defining a byte-identical duplicate — no participant/waitlist-specific
  filter exists to justify a bespoke schema.
- **Not this ticket**: removing a participant, messaging a participant, exporting the
  list, any UI pagination beyond page one (see above).

## Endpoints

```
GET /v1/rides/:id/participants
GET /v1/rides/:id/waitlist
```

## Planned files

- `packages/types/src/api/registrations.ts`: add `RideParticipantSummary`,
  `ListRideParticipantsResponse`, `ListRideWaitlistResponse`.
- `apps/api/src/modules/registrations/registrations.service.ts`: add `assertOwnRide`,
  `listParticipants`, `listWaitlist`; import `users`, `asc` already imported,
  `clampLimit`/`decodeCursor`/`encodeCursor`/`CursorError` from `../../lib/cursor.js`.
- `apps/api/src/modules/registrations/registrations.routes.ts`: two new `GET` routes
  (`requireAuth`), one new shared response schema
  (`rideParticipantSummaryResponseSchema`).
- `apps/api/src/modules/registrations/registrations.routes.test.ts`: happy path
  (participants + waitlist, correct filtering/ordering), non-owner → 404, draft ride
  owner still sees an (empty) list, unauthenticated → 401, pagination (`nextCursor`
  and a second page) for at least one of the two.
- `apps/web/src/features/organizer/participants/api.ts` (new feature module):
  `getRideParticipants`/`getRideWaitlist` typed calls + `getRideStatus` (reads
  `GET /v1/rides/:id`'s `ride.status`, same "no separate endpoint" precedent
  `route/api.ts`'s `getRideRouteState` uses).
- `apps/web/src/features/organizer/participants/components/ParticipantTable.tsx`,
  `WaitlistTable.tsx` — loading/empty/error states (Skeleton/EmptyState/ErrorState),
  stacked-card-on-mobile per `docs/design.md` §11 ("participant lists collapse to
  stacked cards below `md`, never a horizontally scrolling table").
- `apps/web/src/features/organizer/participants/participants.test.tsx`.
- `apps/web/src/app/organizer/rides/[id]/participants/page.tsx` (new route, same
  `CabinetShell`-inherited-auth pattern as `.../route/page.tsx`).
- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`: add a
  "Участники" link next to the existing "Маршрут →" link.
- `packages/ui/src/terminology.ts`: new `PARTICIPANTS_TERMS` block; one new
  `RIDE_EDIT_TERMS.participantsLink` entry.
- `docs/api.md`, `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`, `.claude/context/known-issues.md` if anything
  surfaces.

## Implementation progress

- [x] packages/types (`RideParticipantSummary`, two response types)
- [x] apps/api registrations.service.ts (`assertOwnRide`, `listParticipants`,
      `listWaitlist`, `INVALID_CURSOR`)
- [x] apps/api registrations.routes.ts (two new `GET` routes)
- [x] apps/api tests (9 new: 6 participants, 3 waitlist)
- [x] apps/web feature module (`features/organizer/participants/`)
- [x] apps/web route (`/organizer/rides/[id]/participants`) + `EditRideForm` link
- [x] apps/web tests (5 new, `participants.test.tsx`)
- [x] terminology additions (`PARTICIPANTS_TERMS`, `RIDE_EDIT_TERMS.participantsLink`)
- [x] docs updates (api.md, tasks.md, changelog.md, project-state.md, known-issues.md)
- [x] full validation (lint/typecheck/build/test)
- [x] live verification (curl + browser, desktop + 375px mobile)
- [x] project-state.md update

## Validation results

`turbo run lint typecheck build test --force` (build with `NODE_ENV=production`,
KI-038's documented workaround) green across all touched workspaces, against a real
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`. `apps/api`:
221 tests (was 212, +9). `apps/web`: 131 tests (was 126, +5). `packages/ui`: 85 tests
unchanged (no assertion needed updating — `RIDE_EDIT_TERMS`/new `PARTICIPANTS_TERMS`
aren't under a fixed-object `toEqual` check). `pnpm format:check`/`lint:root` clean.

Live-verified via curl against a real Postgres + `apps/api`: a non-owner (an
authenticated participant, not the organizer) gets `404 ride_not_found` from both new
endpoints; unauthenticated gets `401`; organizer's `/participants` correctly shows
only the active registrant, `/waitlist` shows the queue in FIFO order including a
`displayName: null` participant rendered as `null` not an empty string; after the
registered participant cancels (auto-promoting the oldest waiter), both views update
correctly — participants now shows the promoted user, waitlist drops to one entry;
pagination (`limit=1` + cursor) and `400 invalid_cursor` on a malformed cursor both
verified. Browser-verified (`browser-automation` skill) at desktop and 375px mobile:
populated page renders both sections with real data and correct Russian date
formatting; empty-ride case shows both empty states with correct copy;
`scrollWidth === clientWidth` at 375px (no horizontal scroll, `docs/design.md` §11).
All scratch data (rides/organizer profile/users) deleted from the DB afterward,
confirmed by a direct count query.

## Discovered issues

Found and fixed within this session, before shipping (not a latent bug left behind):
`apps/api/src/lib/cursor.ts`'s established cursor pattern silently assumed
millisecond precision on both sides of its `>`/`<` comparison, but Postgres stores
`timestamptz` at microsecond precision. Harmless for the one existing **descending**
consumer (`/mine`), but this ticket's two new **ascending**-order queries (`createdAt
asc`, needed for FIFO/oldest-first semantics) are the first to combine ascending
order with a `now()`-derived column — a row's own truncated cursor is always
strictly less than its actual stored value, so that row always matched its own `>`
condition and pagination would never have advanced past page one. Confirmed
empirically against a real Postgres before fixing. Fixed locally by wrapping the
column side in `date_trunc('milliseconds', ...)` too, in just the two new queries —
recorded as KI-039 (resolved) in `known-issues.md` for future ascending-order cursor
endpoints to avoid repeating.

## Final result

CR-037 ("Organizer participant list") complete. Two new organizer-only,
cursor-paginated `GET` endpoints (`/v1/rides/:id/participants`, `/v1/rides/:id/
waitlist`) with a deliberately minimal response shape (no phone/email, per
`.claude/rules/security.md`). New `/organizer/rides/[id]/participants` screen
(`ParticipantTable`/`WaitlistTable`, per `docs/design.md`'s named component
inventory), linked from `EditRideForm`. All live-verified end to end, including
auto-promotion correctly reflecting across both organizer views after a
cancellation. `docs/tasks.md`'s Registration section now has only CR-091 ("My
registrations") remaining.
