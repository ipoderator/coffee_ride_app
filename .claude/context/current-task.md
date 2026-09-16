# Current task

## Task ID

CR-042 (Review) + CR-043 (Organizer rating summary) — "Post-ride" backlog section.

## Goal

A participant who actively attended a now-`finished` ride can leave a 1-5 star review
with an optional comment. Reviews aggregate into a per-organizer rating (average +
count) shown wherever an organizer is already surfaced (ride detail, discovery list,
own profile) — no new standalone organizer endpoint (`docs/api.md`'s existing "no
public GET /v1/organizers/:id" decision stays true).

## Requirements / scope decisions

`docs/tasks.md`/`docs/product.md`/`docs/api.md` only stub this ("review completed
rides", `POST`/`GET /v1/rides/:id/reviews`) — the following are this task's own scope
decisions, made consistent with existing precedent in the codebase:

- Eligibility: caller must have an **active** registration for the ride, and the ride's
  status must be `finished` (`403 not_a_participant` / `409 ride_not_finished`).
  Cancelled-registration users cannot review — same "active only" scope precedent as
  `listParticipants`/`listMyRegistrations`.
- One review per user per ride, enforced by a DB unique index (same `.claude/rules/
database.md` discipline as duplicate registration) — no edit/delete, only create +
  list (same precedent as `RideUpdate`).
- `rating`: integer 1-5, required. `comment`: optional, ≤2000 chars (same bound as
  `RideUpdate.message`).
- `GET /v1/rides/:id/reviews` is public (no session required), paginated, newest first.
- Organizer rating summary = avg(rating) + count across all of an organizer's reviews
  (any of their finished rides), computed via a join, not a denormalized column (MVP
  scale, `.claude/rules/database.md` doesn't ask for a materialized aggregate).
  Surfaced as additive `rating`/`reviewCount` fields on:
  - `RideOrganizerSummary` (so it rides along on `GET /v1/rides/:id` and
    `GET /v1/rides` — the existing embed point, no new endpoint);
  - `GET`/`POST`/`PATCH /v1/organizers/me` (organizer sees their own aggregate on
    `/organizer/profile`).
- New `reviews` capability module (`.claude/rules/architecture.md` already names
  `reviews` as its own feature boundary), not folded into `rides`/`notifications`.
- No notification fan-out for a new review (not named in `docs/api.md`'s Notifications
  producer list) — out of scope.

## Planned files

- `packages/db/src/schema/review.ts` (+ `schema/index.ts` export), migration via
  `drizzle-kit generate`.
- `packages/types/src/domain/review.ts`, `packages/types/src/api/reviews.ts`, extend
  `api/organizers.ts` (`OrganizerProfileResponse`) and `api/rides.ts`
  (`RideOrganizerSummary`), `index.ts` export.
- `apps/api/src/modules/reviews/{reviews.service,reviews.routes,review-response.schema}.ts`,
  registered in `routes/v1.ts`. Extend `rides.service.ts` (organizer rating join) and
  `organizers.service.ts` (own rating).
- `apps/web/src/features/participant/ride-detail/{api.ts,components/ReviewForm.tsx,components/ReviewList.tsx}`
  wired into `RideDetailView.tsx`; organizer rating display in `RideDetailView.tsx` and
  `RideCard.tsx`; `OrganizerProfileForm.tsx` shows own rating.
- `packages/ui/src/terminology.ts` (`REVIEWS_TERMS` + organizer rating labels),
  `packages/ui/src/format.ts` (`formatRatingParts`).
- Docs: `docs/api.md` (Reviews section + organizer embed), `docs/design.md` (§7 rating
  format row, §9 component note), `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`.

## Implementation progress

- [x] Investigated conventions (ride-update module as create+list template,
      registrations module for eligibility-check/duplicate patterns, organizer embed
      precedent).
- [x] DB schema + migration (`0012_brave_richard_fisk.sql`, applied + verified
      against the real local Postgres, `coffee_ride_dev`).
- [x] packages/types (`domain/review.ts`, `api/reviews.ts`, `RideOrganizerSummary`/
      `OrganizerProfileResponse`/`GetRideResponse` additive fields).
- [x] apps/api `reviews` module + rides/registrations/organizers embed (batched
      rating aggregate on the two paginated endpoints, single-query on the rest).
- [x] apps/web feature UI (`ReviewForm`/`ReviewList` on `/rides/[id]`, rating card
      on `/organizer/profile`, `formatRatingParts`/`formatRating` +
      `REVIEWS_TERMS`/`ORGANIZER_TERMS` rating labels in `packages/ui`).
- [x] tests (13 new in `apps/api`, 8 new in `apps/web`, 5 new in `packages/ui`).
- [x] docs (`api`, `database`, `design`, `tasks`, `changelog`) + `project-state.md` +
      `architecture-map.md`.

## Validation results

`turbo run lint typecheck test build` — all 25 tasks green. `apps/api` 255 tests
(+13), `apps/web` 155 tests (+8), `packages/ui` 90 tests (+5), `packages/db`/
`packages/types` build clean. `NODE_ENV=production turbo run build` — all 6 build
tasks pass. Migration applied to and verified against a real local Postgres
(`coffee_ride_dev`) before any test ran (Docker's daemon is still unreachable in
this environment, KI-019 — same standing constraint every prior ticket has noted;
this task used the already-running Homebrew Postgres instead, same as every prior
`apps/api` test run in this repo).

## Discovered issues

None. Two pre-existing `rides.routes.test.ts` assertions needed updating for the
new additive `rating`/`reviewCount` fields on `RideOrganizerSummary` — expected,
not a bug.

## Final result

CR-042 (Review) and CR-043 (Organizer rating summary) are complete and shipped.
`docs/tasks.md`'s Post-ride section is fully checked off. Next logical task:
Quality (CR-044 Responsive UI, CR-045 Accessibility, CR-046 Error/loading/empty
states, CR-047 Security review, CR-048 Performance review).
