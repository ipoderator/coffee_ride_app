# Current Task

## Status

complete

## Task ID

CR-023 — Ride detail (participant-facing)

## Goal

`docs/tasks.md`'s Rides section: next unchecked ticket after CR-017/CR-088/
CR-016/CR-018/CR-019/CR-089/CR-020/CR-021/CR-090/CR-022 (all done, full
lifecycle implemented). `docs/design.md`'s route table: `/rides/[id]` "Ride
detail — Cover, metrics, route + profile, stops, services, requirements,
organizer, registration action."

## Investigation before deciding scope

- Route/stops/requirements/services have no DB tables yet (CR-027..031,
  `RideRequirement`/`RideService` don't even have CR numbers — KI-021).
  Registration doesn't exist yet either (CR-032+). So this ticket can only
  show what's real today: core `Ride` fields + the organizer's public
  identity (name). Registration action/route/stops/services are out of
  scope, same "build the minimal real thing now, defer the rest" discipline
  every prior CR in this project used (CR-017 vs CR-018, CR-019 vs
  KI-025, etc.) — deferred gaps get a documented known issue, not a silent
  skip.
- `docs/api.md` already names the gap this ticket closes: "No public `GET
/v1/organizers/:id` yet ... deferred to whichever ride ticket first needs
  to [embed organizer info publicly]." Decision: embed `{ id, name }` on the
  ride-detail response instead of adding a whole new public organizer
  endpoint — `docs/product.md` Principle 2 ("complete ride record, not a
  link out") argues for this directly, and it's less surface than a second
  endpoint for one field.
- **The routing conflict**: `GET /v1/rides/:id` already exists
  (CR-016/CR-018) but is strictly owner-only (`requireAuth`, 404 for
  non-owner). A participant viewing a published ride is usually
  unauthenticated, or authenticated but not the owner — neither is served
  by the existing handler. Two real options: (a) a second endpoint at a
  different path, or (b) make the existing `GET /v1/rides/:id` handle both
  viewers. Chose (b): one canonical URL per `Ride` resource, visibility
  varies by viewer — same shape as `GET /v1/auth/me` already returning more
  fields as they were added, and avoids a duplicate-concept "two ways to
  fetch a ride by id" (`.claude/CLAUDE.md`). This is also strictly more
  correct for an already-authenticated _participant_ who isn't the ride's
  owner: today they'd incorrectly get `404 ride_not_found` for someone
  else's published ride, which is wrong (the ride is public), not just
  "not yet implemented".
- **Visibility rule**: owner (resolved server-side from the session, never
  a client-supplied id) sees the ride at any status, same as before. A
  non-owner (including no session at all) sees it unless `status ===
'draft'` — 404 `ride_not_found` for a draft, same either-way response as
  the existing ownership check (never reveal a draft exists). `cancelled`
  stays visible: `docs/api.md`'s own phrase for the future list endpoint is
  "published+ statuses", and every route to `cancelled` passes through
  `published` first (`docs/product.md`'s Lifecycle) — so "published+"
  reads as "not still a draft", not "never cancelled".
- **Contract-change check** (`.claude/rules/extensibility.md`): this changes
  `GET /v1/rides/:id`'s behavior for an unauthenticated/non-owner caller
  (was a blanket `401`/`404 ride_not_found`, now `200` for a non-draft ride).
  The only existing caller is `apps/web`'s `EditRideForm`, always
  authenticated as the owner when it calls this — unaffected. Response body
  gains an additive `organizer` field alongside the unchanged `ride` field —
  existing consumers destructuring `{ ride }` are unaffected. Documenting
  this here and in `docs/api.md`/`docs/changelog.md` per the rule, even
  though nothing currently breaks.
- Checked `packages/ui`'s `formatParticipantsParts` (CR-064): needs both a
  registered _count_ and a limit; only the limit exists today (no
  `Registration` table). Decision: show `participantLimit` as its own plain
  label (reusing `RIDE_EDIT_TERMS.participantLimitLabel`'s wording in a new
  detail-screen terms object, not the ratio formatter) rather than feeding
  `formatParticipantsParts(null, limit)` and losing the limit to the
  missing-value em dash. New known issue for the ratio itself once
  `Registration` exists (CR-032+).

## Scoping decisions

- **API**: `GET /v1/rides/:id` preHandler changes from `requireAuth` to a
  new `resolveOptionalUser` (`apps/api/src/plugins/auth.ts`) — resolves
  `request.user` from the cookie if present and valid, but never rejects.
  `rides.service.ts`: `getRideForOwner` replaced by `getRideForViewer(db,
userId: string | null, rideId)` → `{ ride, organizer: { id, name } }`.
  Check order: fetch ride+organizer name in one query; not found → 404;
  owner (organizerId matches caller's own profile) → return regardless of
  status; else non-`draft` → return; else → 404 (same code, same
  either-way response as before).
- **Types**: `packages/types/src/api/rides.ts` gains `RideOrganizerSummary`
  (`{ id, name }`) and `GetRideResponse` (`{ ride, organizer }`).
  `apps/api`'s `ride-response.schema.ts` gains the matching Zod shape.
- **No new endpoint for organizer public data** — see investigation above.
- **Web**: new feature module `apps/web/src/features/participant/
ride-detail/` (`.claude/rules/extensibility.md` shape: `components/`,
  `api.ts`, no `hooks/`/`types.ts` needed yet — nothing to share beyond
  `types`/`ui`). New top-level route `apps/web/src/app/rides/[id]/page.tsx`
  — deliberately NOT under `app/organizer/` or `app/me/` (no `CabinetShell`,
  no auth gate — this is `docs/design.md`'s public `/rides/[id]`, distinct
  from the cabinet routes).
- **Shown on the screen**: cover image (if set — reuses the existing
  `coverImageUrl` field, itself still always `null`, KI-023), title,
  `StatusBadge` (reuses `RIDE_STATUS_TERMS`), organizer name (plain text,
  not yet a link — no public organizer profile page exists, see known
  issues below), description, start date/time (formatted in the ride's own
  `startTimezone`, `formatDate`/`formatTime`), a `MetricRow` of
  `MetricTile`s (distance/elevation/pace/duration — same canonical order as
  `docs/design.md` §6 — plus difficulty via `DifficultyScale`, each tile
  omitted when its value is `null` rather than forced through the
  missing-value em dash, since "not yet configured" reads better as "not
  shown" on a read-only public page than as a visible dash for every organizer
  who hasn't filled in every optional field), price (`formatPrice`),
  participant limit (plain label, see investigation above). Bicycle type
  shown via `BICYCLE_TYPE_TERMS`.
- **Not shown / explicitly deferred** (documented as new known issues, not
  silently dropped): route/stops/services/requirements (no schema yet,
  CR-027..031), registration action/participant count (no `Registration`
  table yet, CR-032+), organizer profile link (no public organizer-read
  endpoint/page yet).
- **Loading/error/not-found states**: `Skeleton` while loading, `ErrorState`
  on a network/500 error, a dedicated not-found `Card` (same pattern as
  `EditRideForm`'s, different copy — no "belongs to another organizer"
  phrasing, since that's not why a participant would see this).
- **New terminology**: `RIDE_DETAIL_TERMS` in `packages/ui/src/
terminology.ts` (`.claude/rules/frontend.md`: no hard-coded Russian string
  in a component).

## Requirements

- `apps/api/src/plugins/auth.ts`: `resolveOptionalUser` preHandler (new,
  additive — `requireAuth` unchanged, still used by every other route).
- `apps/api/src/modules/rides/rides.service.ts`: `getRideForViewer` replaces
  `getRideForOwner` (no other caller of the removed function exists).
- `apps/api/src/modules/rides/rides.routes.ts`: `GET /:id` preHandler swap +
  response shape gains `organizer`.
- `apps/api/src/modules/rides/ride-response.schema.ts`: organizer summary
  Zod shape.
- `packages/types/src/api/rides.ts`: `RideOrganizerSummary`/
  `GetRideResponse`.
- `apps/api/src/modules/rides/rides.routes.test.ts`: rewrite the `GET /v1/
rides/:id` describe block for the new visibility rule (see acceptance
  criteria).
- `apps/web/src/features/participant/ride-detail/{api.ts,
components/RideDetailView.tsx}` (new).
- `apps/web/src/app/rides/[id]/page.tsx` (new, no `CabinetShell`).
- `packages/ui/src/terminology.ts`: `RIDE_DETAIL_TERMS`.
- `docs/api.md`: update the `GET /v1/rides/:id` entry; update the "No public
  `GET /v1/organizers/:id`" note under Organizers.
- `.claude/context/known-issues.md`: new KI-028 (participant count/
  registration action, route/stops/services/requirements, no discovery
  entry point yet — same shape as KI-024's "screen built before its real
  entry point").
- `docs/tasks.md`: check off CR-023.

## Acceptance criteria

- `GET /v1/rides/:id`:
  - malformed id → `400 validation_error` (unauthenticated or not).
  - non-existent id → `404 ride_not_found` (unauthenticated or not).
  - `draft` ride, no cookie → `404 ride_not_found`.
  - `draft` ride, a stranger's cookie → `404 ride_not_found`.
  - `draft` ride, owner's cookie → `200 { ride, organizer }`.
  - `published`/`registration_open`/`registration_closed`/`started`/
    `finished`/`cancelled` ride, no cookie → `200 { ride, organizer }`.
  - same non-draft statuses, a stranger's cookie → `200` (identical to the
    no-cookie case).
  - owner's cookie, any status → `200`, full ride.
  - `organizer` in the response matches the ride's actual
    `OrganizerProfile` (`{ id, name }`), cross-checked against a direct DB
    read.
- Web `/rides/[id]`: loading skeleton → real ride renders (cover if set,
  title, status badge, organizer name, description, formatted start
  date/time in the ride's zone, metric tiles for whichever of
  distance/elevation/pace/duration/difficulty are set, price, participant
  limit) for a published ride, unauthenticated, in a real browser; a
  non-existent/draft id shows the not-found state, not a crash; 0 console
  errors during the flow itself.
- `turbo run lint/typecheck/build/test` all green; `format:check`/
  `lint:root` clean.
- Live check: curl sequence covering every bullet above (cross-checked
  against a direct DB read) plus a real-browser walkthrough via
  `browser-automation`.

## Planned files

- `apps/api/src/plugins/auth.ts` (extend).
- `apps/api/src/modules/rides/{rides.service.ts, rides.routes.ts,
ride-response.schema.ts, rides.routes.test.ts}` (extend).
- `packages/types/src/api/rides.ts` (extend).
- `packages/ui/src/terminology.ts` (extend).
- `apps/web/src/features/participant/ride-detail/{api.ts,
components/RideDetailView.tsx}` (new).
- `apps/web/src/app/rides/[id]/page.tsx` (new).
- `docs/api.md`, `docs/tasks.md`, `.claude/context/known-issues.md`.

## Implementation progress

- [x] Plan written (this file)
- [x] `apps/api` changes (auth plugin, service, routes, response schema) +
      tests
- [x] `packages/types` addition
- [x] `packages/ui` terminology addition
- [x] `apps/web` feature module + page
- [x] Full validation
- [x] Live check (curl + browser-automation)
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run lint typecheck build test` (25 tasks, real
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`,
  Docker Desktop still unavailable): green. `apps/api`'s `GET /v1/rides/:id`
  block rewritten (8 tests replacing the prior 5 — malformed id, non-
  existent id, draft+no-cookie, draft+stranger, owner's own draft,
  published+no-cookie cross-checked against a direct DB read, published+
  stranger's cookie, cancelled+no-cookie); 116 total (was 113). `apps/web`
  gained a new `ride-detail.test.tsx` (4 tests: not-found, network error,
  full render with every metric, tiles omitted when fields are `null`); 78
  total (was 74).
- `pnpm format:check`/`pnpm lint:root`: clean after one `prettier --write`
  pass on this file and the rewritten test file (cosmetic only — Prettier's
  own reformatting, not a content fix).
- Live check via curl against a real Postgres + a freshly started `apps/api`
  (`tsx watch src/server.ts`, confirmed healthy via `/health` first): full
  register → verify → login → create organizer profile → create ride
  (`draft`) sequence, then: (1) `GET` the draft with no cookie → 404
  `ride_not_found`; (2) `GET` it with the owner's cookie → 200 with
  `organizer`; (3) `GET` a non-existent id, no cookie → 404; (4) `GET` a
  malformed id → 400 `validation_error`; `PATCH` in every optional field,
  `publish`, then (5) `GET` the now-`published` ride with no cookie at all →
  200, `organizer` cross-checked against a direct DB read
  (`organizer_profiles` row for the same user). Test account/organizer/ride
  deleted from the scratch DB afterward.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server (started fresh, stopped afterward) + the already-running
  `apps/api`: navigated to the published ride's `/rides/[id]` with no login
  at all — rendered "Опубликован" status badge, the title, "Организатор:
  Гравийный клуб CR-023", the description, "1 мая 2027, 08:00" (Moscow-zone
  start, correctly converted from the UTC-stored instant), every metric tile
  with the exact expected formatted value (42,3 км / 350 м / 24,5 км/ч / 2 ч
  30 мин), "Средний (уровень 3 из 5)" difficulty, "Гравийный" bicycle type,
  500 ₽ price, 20 participant limit — 0 console errors, 0 failed requests.
  Then navigated to a non-existent id: rendered the not-found state ("Заезд
  не найден") instead of a crash, with only the expected 404 fetch itself
  showing up as a console/network entry (same "expected 404" pattern every
  prior not-found screen in this project has).
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation (not left open):

- First draft of the web component used `formatPrice` (the joined string
  formatter) and tried to split it back into `{ value, unit }` for
  `MetricTile` — broke immediately because the joined string uses an NBSP
  between value and unit, not a plain space, so `.split(' ')` never actually
  split anything. Fixed by using the already-exported `formatPriceParts`
  directly, same as every other metric on this screen — no new formatter
  needed, the split attempt was simply the wrong approach.
- The new web test asserted the duration tile's text using the same NBSP
  character `formatDurationParts` actually joins with, and it failed:
  Testing Library's default text normalizer treats NBSP as whitespace and
  collapses it to a plain space before matching, so the query has to use a
  plain space even though the real DOM text contains NBSP. Not a product
  bug — fixed the test, not the component.
- An ESLint `eslint-disable-next-line` comment for the (inert, `coverImageUrl`
  is always `null` today) `<img>` tag was placed above a multi-line block
  comment instead of directly above the `<img>` line itself, so it silently
  disabled the wrong line and ESLint still flagged the real one. Fixed by
  moving the directive comment to sit immediately above `<img>`.

New known issues opened: KI-028 (route/stops/services/requirements/
registration action have no data model yet; no discovery entry point links
to `/rides/[id]` yet — CR-024 is next). No known issues resolved by this
ticket.

## Final result

CR-023 ("Ride detail", participant-facing) complete. `GET /v1/rides/:id`
(owner-only since CR-016/CR-018) now serves any viewer: the ride's own
organizer sees it at any status, anyone else (including an unauthenticated
request) sees it once it's left `draft` — `404 ride_not_found` either way
for a non-existent ride or a non-owner's `draft`, the same resource-
enumeration-safe response the endpoint already used. New
`resolveOptionalUser` preHandler (`apps/api/src/plugins/auth.ts`);
`rides.service.ts`'s `getRideForOwner` replaced by `getRideForViewer`,
which also returns the ride's public `organizer: { id, name }` (joined from
`organizer_profiles`) instead of a separate public organizer-read endpoint —
closing the gap `docs/api.md` had already named under Organizers. No
`packages/db` migration. `apps/web` gained its first fully public feature
module (`features/participant/ride-detail/`) and its first top-level route
with no `CabinetShell`/auth gate, `/rides/[id]` — shows every `Ride` field
that has real data today, omitting (never em-dashing) whatever is still
`null`, and explicitly does not attempt route/stops/services/requirements/
registration (no data model for any of them yet). All acceptance criteria
met; full validation suite green (25/25 turbo tasks, `apps/api` 116 tests,
`apps/web` 78 tests); live-verified end to end over both curl (multiple
response codes across the new visibility rule, cross-checked against a
direct DB read) and a real browser session (an unauthenticated viewer
seeing a published ride's full detail, and the not-found state for a
non-existent one). `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/{project-state,architecture-map,known-issues}.md` all
updated, including new KI-028. Not yet committed — `git diff`/`git status`
reviewed next.
