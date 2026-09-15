# Current Task

## Status

complete

## Task ID

CR-029 — Route metadata

## Goal

`docs/tasks.md`'s Route section: next unchecked ticket after CR-028 ("Route
rendering"). `docs/tasks.md` names it bare ("CR-029 Route metadata") — its actual
scope comes from `.claude/context/known-issues.md`'s KI-034, which explicitly names
this ticket as "the place to decide this deliberately": `Route.distanceKm`/
`elevationGainMeters` (GPX-computed, CR-027) and `Ride.distanceKm`/
`elevationGainMeters` (organizer-entered, CR-018) are two independent numbers for the
same ride, never reconciled. Now that CR-028 put both on screen at once
(`/rides/[id]`'s `MetricTile` reads `Ride`'s fields; the elevation chart is built from
`Route.geometry`), the mismatch is more visible than KI-034 predicted, making this the
right next ticket.

## Investigation before deciding scope

- **Which number is "the fact" today**: CR-023/CR-028 already made an implicit choice
  — `/rides/[id]`'s `MetricTile` row reads `Ride.distanceKm`/`elevationGainMeters`
  (organizer-entered), not `Route`'s computed ones; `docs/design.md` §6 itself frames
  the elevation _chart_ (built from `Route.geometry`) as "an illustration," the
  _number_ as "the fact" — and the number shown today is `Ride`'s. This ticket keeps
  that precedent rather than flipping which field is authoritative for participant-
  facing display (a bigger, unrequested behavior change with no product-doc backing
  either way).
- **Reconciliation options KI-034 itself lists**: (a) auto-fill `Ride`'s fields from
  `Route` on upload, (b) prefer one as authoritative for display, (c) show both with
  distinct labels. Chosen: (a) for the common case (an organizer who never manually
  entered a figure gets it filled in for free, so most rides never have two numbers
  at all) + a scoped version of (c) for the remaining edge case (an organizer who
  _did_ enter a figure that turns out to differ from the uploaded track) — surfaced
  only on the organizer's own route screen, with an explicit opt-in action to adopt
  the track's numbers, not a silent overwrite and not a second UI investment on the
  participant-facing screen (which already only shows one number, `Ride`'s, by the
  precedent above).
- **Auto-fill scope**: only on `POST .../route` (first upload for a ride), only for
  a field that is currently `null` — never overwrites a value the organizer already
  typed (the exact concern CR-027's own investigation flagged when it deliberately
  did _not_ do this). Independent per field: an organizer may have set `distanceKm`
  manually but left `elevationGainMeters` empty, or vice versa. `PATCH .../route`
  (replace) does **not** auto-fill — by the time a route is replaced, `Ride`'s fields
  already reflect _something_ (either the organizer's own entry or a prior auto-fill),
  and silently changing them again on every replace would be indistinguishable from
  always trusting the track over the organizer, which is exactly the behavior this
  ticket avoids for the general case.
- **No new endpoint for the "adopt track numbers" action**: `PATCH /v1/rides/:id`
  (CR-018) already accepts `distanceKm`/`elevationGainMeters` — the organizer's route
  screen reuses it directly (a small dedicated fetch call in that feature's own
  `api.ts`, not a cross-feature import — `.claude/rules/extensibility.md`). No new
  API surface, no new DB column, no ADR (a business-logic/product policy decision,
  not an architecture change — same tier as CR-027's own several non-ADR scoping
  calls, e.g. "download via API, not a pre-signed URL").
- **Precision check**: `rides.distanceKm`/`routes.distanceKm` are both
  `numeric(6,1)`; `rides.elevationGainMeters`/`routes.elevationGainMeters` are both
  plain `integer` (`packages/db/src/schema/{ride,route}.ts`) — same precision/scale
  on both sides, so a plain `!==` mismatch check on the frontend is exact, no
  floating-point-tolerance logic needed.
- **Transaction**: the route insert + the conditional `rides` auto-fill update must
  commit together (an upload that "succeeds" but leaves `Ride` half-updated would be
  a new, worse inconsistency than the one being fixed) — `db.transaction(...)`, same
  pattern already used in `auth.service.ts`'s `registerUser`/`changePassword`.

## Scoping decisions

- **`apps/api/src/modules/rides/rides.service.ts`**: `uploadRoute` wraps its route
  insert in `db.transaction(...)`; inside the same transaction, reads the ride's
  current `distanceKm`/`elevationGainMeters` and conditionally `UPDATE`s only the
  `null` ones to the parsed GPX values (`updatedAt`/`updatedBy` set, same convention
  as every other `rides` mutation). `replaceRoute`/`deleteRoute` unchanged — no
  auto-fill, no auto-clear.
- **`apps/web/src/features/organizer/route/`**: `api.ts`'s `getRideRouteState` gains
  `distanceKm`/`elevationGainMeters` in its returned shape (already available on the
  same `GET /v1/rides/:id` response, just not previously extracted here); new
  `syncRideMetricsFromRoute(rideId, { distanceKm, elevationGainMeters })` (a small
  `PATCH /v1/rides/:id` call, own fetch, not imported from `features/organizer/
rides/`). `RouteUploadForm.tsx`: when a route exists and either field differs from
  the ride's own, an inline note shows both values with a "Использовать данные
  трека" button; clicking it calls the new API function and updates local state
  (loading/error handled via the same `isPending`/`formError` machinery already in
  the component).
- **`packages/ui/src/terminology.ts`**: new entries in the existing `RIDE_ROUTE_TERMS`
  block (organizer-facing, same screen CR-027 already put this terminology in).

## Requirements

- `apps/api/src/modules/rides/{rides.service.ts,route.routes.test.ts}`.
- `apps/web/src/features/organizer/route/{api.ts,components/RouteUploadForm.tsx,
route.test.tsx}`.
- `packages/ui/src/terminology.ts`.
- `docs/api.md` (note the auto-fill behavior on `POST .../route`), `docs/tasks.md`,
  `.claude/context/known-issues.md` (resolve KI-034).

## Acceptance criteria

- Uploading a GPX for a ride with `distanceKm`/`elevationGainMeters` both `null`
  fills both from the parsed track, in the same DB transaction as the route insert.
- Uploading when only one of the two is already set fills only the other.
- Uploading when both are already set changes neither.
- Replacing an existing route (`PATCH .../route`) never touches `Ride`'s fields,
  regardless of whether they were auto-filled or organizer-entered.
- The organizer's route screen shows an "adopt track numbers" affordance only when a
  real mismatch exists, and using it updates both the ride and the screen's own
  displayed values, with the note disappearing afterward.
- `turbo run lint typecheck test build` green; `format:check`/`lint:root` clean.
- Live check: curl sequence proving the auto-fill/no-overwrite/no-touch-on-replace
  behavior against a real Postgres, plus a browser walkthrough of the mismatch note
  and sync action.

## Planned files

Same as Requirements above.

## Implementation progress

- [x] Plan written (this file)
- [x] `apps/api` auto-fill logic + tests
- [x] `apps/web` mismatch note + sync action + tests
- [x] `packages/ui` terminology
- [x] Full validation
- [x] Live check
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `pnpm --filter api exec vitest run route.routes`: 27 tests, all green (4
  new — both-null auto-fill, fill-only-the-unset-field, no-change-when-both-
  set, replace-never-touches-ride).
- `pnpm --filter web exec vitest run route.test`: 13 tests, all green (3 new
  — mismatch note + sync button shown, sync action adopts track figures and
  clears the note, sync action hidden for a non-draft ride).
- `turbo run lint typecheck test --force` (19 tasks, all 8 packages): all
  green against a real Postgres.
- `pnpm --filter web build` / `pnpm --filter api build`: both green.
- `pnpm format:check`/`pnpm lint:root`: clean after one `prettier --write`
  pass (this file only, cosmetic).
- Live check via curl against a real Postgres + a freshly started `apps/api`
  (no `S3_*` configured): a real multipart upload attempt correctly 503'd
  (S3 unreachable, KI-015) and left the ride's `distanceKm`/
  `elevationGainMeters` untouched (still `null`) — confirms the transaction
  never partially applies. Since a real upload can't complete in this
  environment, a `routes` row was inserted directly via `psql` (same
  technique CR-028 used) to exercise the reconciliation flow end to end: set
  the ride's `distanceKm` to a different value via `PATCH` (simulating an
  organizer entry), confirmed `GET /v1/rides/:id` shows the mismatch
  (`ride.distanceKm` vs `route.distanceKm`), then called `PATCH` with the
  route's own values (exactly what the frontend's sync button does) and
  confirmed the ride now matches. The auto-fill transaction itself (the part
  that can't be curl-exercised without live S3) is verified by the Vitest
  suite above against this same real Postgres database, not mocked.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server + `apps/api` (same origin as `WEB_ORIGIN`, required for
  the CSRF check the sync button's `PATCH` goes through): loaded the
  organizer's route screen with a real mismatch present — the note and
  "Использовать данные трека" button rendered with the correct values;
  clicking it showed the success message and the note disappeared. 0
  console errors, 0 failed requests, in both the mismatch-present and
  mismatch-resolved states. All test data (route row, ride, organizer
  profile, user) deleted from the scratch DB by id/email afterward; both dev
  server processes stopped.
- Every acceptance criterion from above is met.

## Discovered issues

- Testing note, not a product bug: an early browser-check attempt against a
  `next dev` server on a different port than the API's configured
  `WEB_ORIGIN` correctly got `403 csrf_origin_mismatch` on the sync button's
  `PATCH` — the CSRF protection (`.claude/rules/security.md`, ADR-013)
  working exactly as designed, not a defect. Re-ran with matching ports.

## Final result

CR-029 ("Route metadata") complete, resolving KI-034. `apps/api`'s
`uploadRoute` now wraps its route insert in a DB transaction and, within it,
auto-fills whichever of `Ride.distanceKm`/`elevationGainMeters` is still
`null` from the parsed GPX — independently per field, only on the first
upload, never overwriting an organizer-entered value. `replaceRoute` is
unchanged (never touches `Ride`'s fields). `apps/web`'s `RouteUploadForm`
(organizer's route screen) now shows a reconciliation note with a
"Использовать данные трека" action when the ride's own figures genuinely
diverge from the uploaded track's — the action reuses the existing `PATCH
/v1/rides/:id` (no new endpoint), and the screen reloads its state after any
mutation (upload/replace/sync) so it never trusts a locally-guessed copy of
the server's own auto-fill logic. All acceptance criteria met; full
validation suite green (lint/typecheck/test/build across all 8 packages);
live-verified end to end over both curl (transaction safety on a failed
upload, the full mismatch → sync → resolved flow) and a real browser session
(note rendering, sync action, 0 console errors). `docs/tasks.md`,
`docs/changelog.md`, `docs/api.md`, `.claude/context/known-issues.md` all
updated. Not yet committed — `git diff`/`git status` reviewed next, contains
exactly the planned files, no unrelated changes.
