# Current task

## CR-126 — Participant public profile: garage, privacy tiers, distance stats, rider cards

Started 2026-09-24. User request: clickable participant cards from a ride's riders
list; a participant-controlled profile visibility setting (closed / co-participants /
open); a "garage" of the participant's bikes; self-reported distance stats (week/
month/year, manually entered — confirmed with user); a list of recent rides the
participant has taken. Full plan approved via plan mode:
`/Users/glebchurkin/.claude/plans/effervescent-swinging-wilkinson.md`.

### Confirmed product decisions (AskUserQuestion)

- Privacy: 3 tiers — closed (self only) / co-participants (share a ride) / open (any
  signed-in user).
- Distance stats: self-reported, manually entered (not derived from ride history).
- Bikes: a garage — list of bikes, one marked active.

### Scope decisions (documented, not re-asked)

- `profileVisibility` default: `'co_participants'` — balances the social ask against
  privacy-by-default.
- Everything scoped through a shared ride/registration (per KI-059 guidance and the
  standing "no public `GET /v1/users/:id`" constraint) — new routes are
  `/v1/rides/:id/riders/:registrationId/profile` and `.../avatar`, never a bare
  `users/:id`.
- "Recent rides" list reuses the existing `rides.participantsVisible` flag as its
  visibility rule rather than inventing a second one.
- Organizer of a ride can always view a rider's profile card for that ride (they
  already have equal/greater access via `/participants`).

### Planned files

See plan file for full detail. Summary:

- `packages/db/src/schema/user.ts` (+enum, +distance columns), new
  `packages/db/src/schema/bike.ts` (`userBikes`), migration via `db:generate`.
- `packages/types`: `api/users.ts` (profile update additions), new `api/bikes.ts`,
  new `api/rider-profile.ts`, `api/ride-groups.ts` (`RideRider.registrationId`).
- `apps/api/src/modules/users/` (bikes CRUD routes/service), `apps/api/src/modules/
registrations/registrations.service.ts` (+`hasActiveRegistration`,
  `resolveRiderAccess`, `PROFILE_PRIVATE`, profile/avatar routes + `listRiders`
  registrationId).
- `apps/web/src/features/participant/profile/` (ProfileForm additions, new
  `GarageForm.tsx`, `api.ts` bikes calls).
- New `apps/web/src/features/participant/rider-profile/` module + route
  `apps/web/src/app/rides/[id]/riders/[registrationId]/page.tsx` +
  `RidersSection.tsx` linking.
- Docs: `database.md`, `api.md`, `product.md`, `decisions.md` (new ADR),
  `changelog.md`, `tasks.md`; `known-issues.md` KI-059 → archive.

### Acceptance

- Migration applies cleanly; DB-level invariant (one active bike) enforced.
- typecheck/lint/tests green across db/types/api/web/ui.
- resolveRiderAccess covers all 3 tiers × {self, co-participant, organizer, unrelated
  signed-in user} + riders_hidden, with tests.
- Live check: set bike+stats+open visibility as user A, view card as co-participant
  user B; set closed, confirm B gets profile_private; avatar loads only when granted.

### Progress

- [x] DB schema + migration (`0019_real_steve_rogers`, applied to dev DB
      `coffee_ride_dev` and a local `coffee_ride_test` DB — see note below on
      Docker being unavailable this session)
- [x] packages/types (`domain/bike.ts`, `api/bikes.ts`, `api/rider-profile.ts`,
      `domain/user.ts`/`api/users.ts` additions, `RideRider.registrationId`)
- [x] apps/api: users bikes CRUD (`users.service.ts`/`users.routes.ts`/
      `user-response.schema.ts`), `registrations.service.ts`
      (`hasActiveRegistration`, `resolveRiderAccess`, `getRiderProfile`,
      `getRiderAvatarDownload`, `listRiders` +registrationId),
      `registrations.routes.ts` (profile/avatar routes), `auth.service.ts`
      `toPublicUser` additions. Tests: `bikes.routes.test.ts`,
      `rider-profile.routes.test.ts` (new), `registration-groups.routes.test.ts`/
      `users.routes.test.ts` (updated for the additive fields). All green
      (434 passed, 3 skipped) — typecheck/lint clean across db/types/api.
- [x] apps/web A: profile settings (privacy + stats + garage) — `ProfileForm.tsx`
      additions, new `GarageForm.tsx` (+ test), `api.ts` bike calls, wired into
      `/me/profile`. Built by a parallel subagent per the plan (disjoint files
      from B); six unrelated pre-existing test fixtures updated for `User`'s
      new always-present fields.
- [x] apps/web B: rider-profile feature + RidersSection linking — new
      `features/participant/rider-profile/` module (`api.ts`,
      `RiderProfileCard.tsx` + test), new route `app/rides/[id]/riders/
    [registrationId]/page.tsx`, `RidersSection.tsx` now links each rider.
      Built by a second parallel subagent; verified no file/terminology-key
      collision with A.
- [x] docs/context updates — `docs/database.md`, `docs/api.md`,
      `docs/decisions.md` (ADR-023), `docs/product.md`, `docs/tasks.md`,
      `docs/changelog.md`, `.claude/CLAUDE.md` (domain entity list),
      `.claude/context/known-issues.md`/`known-issues-archive.md` (KI-059
      resolved), `.claude/context/architecture-map.md`,
      `.claude/context/project-state.md`.
- [x] validation: typecheck/lint/tests all green across db, types, api (434
      tests), web (312 tests), ui (132 tests) — re-run after merging both
      subagents' work, not just each agent's own partial run.
- [x] live verification: (1) real HTTP flow against the running dev API —
      two users, co-participant/open/closed/co_participants tier transitions
      all behaved exactly per `resolveRiderAccess`'s spec, no phone/email in
      the response; (2) live browser pass (`browser-automation` skill,
      injected session cookies) over `/me/profile` and the riders-list →
      card click-through on a real ride — zero console errors, zero failed
      requests. Avatar upload itself not live-tested (S3/MinIO unreachable,
      Docker down this session) — covered by the existing mocked-S3 test
      suites instead.

### Environment note

Docker daemon unreachable this session (per memory) — `TEST_DATABASE_URL`'s
usual docker-compose Postgres (`postgres`/`postgres`@`coffee_ride`) doesn't
exist locally. Worked around by creating a local `coffee_ride_test` DB owned by
the current OS user and pointing `TEST_DATABASE_URL` at it for this session's
`pnpm --filter api test` runs — not a config file change, just an env var
override per invocation. `apps/api`'s S3-dependent tests already mock the AWS
SDK wire call (no live MinIO needed), so this didn't block anything.

### Final result

Done. CR-126 fully shipped: DB schema/migration, `packages/types`, `apps/api`
(bike CRUD + gated rider-profile/avatar endpoints), and `apps/web` (profile
settings garage UI + the new rider-profile card feature) all implemented,
tested, and validated together. All 3 product decisions were confirmed with
the user up front rather than assumed (privacy tiers, self-reported stats,
garage). New ADR-023 records the access-control pattern. KI-059 resolved.
Live-verified via both a real API flow and a real browser session — see
`docs/changelog.md`'s CR-126 entry for full detail. Not committed — several
other uncommitted changes already exist on this branch from prior sessions
(CR-125 and others); commit only if/when asked.
