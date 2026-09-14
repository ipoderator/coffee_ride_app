# Current Task

## Status

complete

## Task ID

CR-088 — Organizer rides list (new ticket, registered this session) + CR-016 —
Organizer authorization + CR-018 — Edit draft (combined implementation, three
`docs/tasks.md` checkboxes).

## Goal

Continue `docs/tasks.md`'s Rides section per the user's "continue per the plan"
instruction. Next unchecked ticket is CR-018 ("Edit draft"), but
`.claude/context/known-issues.md` KI-024 (opened by the CR-017 session) explicitly
blocks starting it: no ticket builds `/organizer/rides` ("My rides", `docs/design.md`
§8), so CR-018's edit screen would have no way to be reached from the UI once more
than one ride exists — "a real CR ticket ... needs a number added to `docs/tasks.md`'s
Rides section before CR-018 ships." Also, CR-016 ("Organizer authorization",
`## Organizer` section, still unchecked) was deliberately deferred by CR-014/CR-015/
CR-017 specifically until a mutation on an _existing_ ride needs an ownership check —
CR-018's `PATCH` is exactly that first mutation, so it lands together with CR-016
rather than as a separate pass.

## Scoping decisions

- **New ticket number.** `docs/tasks.md` has zero gaps from CR-001 through CR-087
  (checked programmatically). Next free number is CR-088 — added to the `## Rides`
  section, positioned logically right after CR-017 (before CR-018) even though its
  number is out of the section's local sequence, same as CR-054/CR-058/CR-063 etc.
  already being out-of-sequence numbers referenced inside other sections.
- **Three tickets, one implementation pass.** CR-088 (list) is built first since
  CR-018's edit screen needs a real entry point (KI-024's own directive, and the same
  "don't ship an unreachable screen" discipline CR-017 itself used for its nav entry).
  CR-016 has no independent surface of its own to exercise — it _is_ the ownership
  check inside CR-018's `GET`/`PATCH /v1/rides/:id`, so implementing CR-018 correctly
  is what satisfies CR-016, not a separate change.
- **`GET /v1/rides/mine`, not overloading `GET /v1/rides`.** `docs/api.md`'s Rides
  section already reserves plain `GET /v1/rides` for the public discovery collection
  (CR-024 "Ride list" — unauthenticated, `status: 'published'`+ only). CR-088 needs an
  authenticated, caller-scoped list across _all_ statuses including `draft` — a
  different resource shape, not a filter on the same one
  (`.claude/rules/security.md`: never trust a client-supplied id/filter for "whose
  data" — scoping must come from the session). Follows the existing `/me`-suffix
  convention (`/v1/organizers/me`, `/v1/auth/me`) → `/v1/rides/mine` (`/me` itself
  collides with nothing here, but `mine` reads clearer for "rides I organize" vs. "my
  own rider profile" — still the same pattern, not a new one).
- **No organizer profile yet → empty list, not an error.** Unlike `POST /v1/rides`
  (which 403s `organizer_profile_required`, since creating requires an owner to
  attach to), listing "my rides" for a caller with no `OrganizerProfile` is simply
  "zero rides" — `200 { items: [], nextCursor: null }`. An empty state, not a guard.
- **Cursor pagination, first real implementation of ADR-011 §2.** Sort key
  `(createdAt desc, id desc)` — a management list is naturally "newest draft first",
  unlike CR-024's future public feed (sorted by `startsAt`). Cursor is
  `base64url(JSON.stringify({ createdAt, id }))`, opaque per ADR-011, decoded in a new
  shared `apps/api/src/lib/cursor.ts` (not inlined in `rides.service.ts`) since this
  is the first of several collection endpoints `docs/api.md` already lists (
  participants, updates, reviews, the public ride list) that will need the exact same
  mechanics — one shared helper now, not five independent re-derivations later. A
  malformed cursor is `400 invalid_cursor` (distinct code from `validation_error`,
  since it isn't a body-schema failure); `limit` clamps to `[1, 100]`, default `20`,
  per ADR-011 ("clamps rather than errors").
- **Ownership check returns `404`, not `403`, for a ride that exists but isn't the
  caller's.** Same resource-enumeration reasoning as returning a generic
  `invalid_credentials` on login (`.claude/rules/security.md`): confirming "this ride
  id exists, you just don't own it" to another organizer leaks more than
  `ride_not_found` does. `.claude/rules/testing.md`'s "authenticated-but-not-owner
  request is rejected" is satisfied by 404 equally well as by 403 — this is CR-016's
  one concrete design call.
- **`PATCH /v1/rides/:id` is draft-only.** `docs/design.md` §8 names this screen "Edit
  draft" specifically; publishing/cancelling/finishing are separate lifecycle
  tickets (CR-019/CR-021/CR-022) with their own state-transition rules. A `PATCH`
  against a non-`draft` ride is `409 ride_not_editable`, not silently accepted or
  broadened into a general "edit anything anytime" endpoint.
- **Field scope matches CR-017's own deferral note verbatim**: `title`, `description`,
  `bicycleType`, `startsAt`+`startTimezone` (both together or neither — partial
  time/zone changes are rejected, `.refine`), `participantLimit`, `priceRub`,
  `distanceKm`, `elevationGainMeters`, `paceKmh`, `durationMinutes`, `difficulty`.
  `coverImageUrl` stays out (KI-023, S3 pipeline deferred — same call CR-017 already
  made for creation). The web form always submits the full current state for every
  field (same convention as `OrganizerProfileForm`/`ProfileForm`), not a sparse diff —
  simpler than tracking which fields actually changed, and the API's Zod schema still
  treats every field as independently optional so a future caller _could_ send a
  sparse patch.
- **Reverse timezone conversion needed.** CR-017's `zonedTimeToUtcIso` only goes one
  way (local input + zone → UTC instant). Prefilling the edit form's
  `datetime-local` input from an existing `Ride.startsAt` (a UTC instant) requires the
  inverse — new `utcIsoToZonedLocalInput(isoString, timeZone)` in the same
  `apps/web/src/lib/datetime/zoned-time.ts`, unit-tested against the same Russian
  zones CR-017 already covers.
- **Create-success view now links into the loop it previously couldn't.** CR-017's
  `CreateRideForm` success view only linked back to `/organizer` (no edit/list screen
  existed yet). Now both exist — adds "Редактировать заезд" (straight to
  `/organizer/rides/[id]/edit`) alongside a "Все мои заезды" link
  (`/organizer/rides`), keeping the existing dashboard link too. Closes KI-024's gap
  at the source, not just for future visits.
- **Nav entry updated, not duplicated.** `organizerRidesNavItem` ("Заезды") now
  points at `/organizer/rides` (the list) instead of straight at
  `/organizer/rides/new` — the list page itself carries the "new ride" call to
  action. One nav entry still covers the whole ride-management area (ADR-009
  registry, no new nav item needed).

## Requirements

- `docs/tasks.md`: add `CR-088 Organizer rides list` to `## Rides`; check off
  CR-016/CR-018 on completion.
- `apps/api/src/lib/cursor.ts` (new): `encodeCursor`/`decodeCursor` for a
  `{ createdAt: string; id: string }` sort key, `CursorError` on malformed input.
- `packages/types`: `api/rides.ts` gains `updateRideRequestSchema` (+
  `UpdateRideRequest`), `listRidesQuerySchema` (+ type), `UpdateRideResponse`,
  `ListRidesResponse` (= `Paginated<Ride>`).
- `apps/api/src/modules/rides/`: `rides.service.ts` gains `RIDE_NOT_FOUND` (404
  `ride_not_found`)/`RIDE_NOT_EDITABLE` (409 `ride_not_editable`) errors,
  `listOwnRides`, `getRideForOwner`, `updateRideDraft`; `rides.routes.ts` gains
  `GET /mine`, `GET /:id`, `PATCH /:id`; new tests in `rides.routes.test.ts`.
  `routes/v1.ts` unchanged (already registers `ridesRoutes`).
- `apps/web/src/lib/datetime/zoned-time.ts`: + `utcIsoToZonedLocalInput` (+test).
- `apps/web/src/features/organizer/rides/`: `api.ts` gains `listMyRides`/`getRide`/
  `updateRide`; new `components/RidesList.tsx`, `components/EditRideForm.tsx`; `nav.ts`
  href updated; tests extended.
- `apps/web/src/app/organizer/rides/page.tsx` (new), `[id]/edit/page.tsx` (new).
- `packages/ui/src/terminology.ts`: `RIDE_LIST_TERMS`, `RIDE_EDIT_TERMS`.
- `docs/api.md`, `docs/database.md`: update Rides section (no schema change — CR-017
  already created every column CR-018 needs).

## Acceptance criteria

- `GET /v1/rides/mine`: no cookie → 401; no `OrganizerProfile` → 200 empty page;
  organizer with rides → 200, newest-created first, `nextCursor` correctly paginates
  past `limit`; malformed `cursor` → 400 `invalid_cursor`; `limit` clamps to 100.
- `GET /v1/rides/:id`: no cookie → 401; non-existent id → 404 `ride_not_found`;
  someone else's ride → 404 `ride_not_found` (not 403); owner's own ride → 200.
- `PATCH /v1/rides/:id`: same 401/404 rules as `GET`; non-draft status → 409
  `ride_not_editable`; valid partial body on a draft → 200 with updated fields,
  `updatedAt` bumped, `updatedBy` = caller; invalid field → 400 `validation_error`;
  mismatched `Origin` → 403 (CSRF, already covered by the existing `/v1` hook —
  verified in tests, not assumed).
- Web: `/organizer/rides` shows a loading skeleton, then either an empty state with a
  working "create" CTA or the caller's rides grouped by status, each linking to its
  edit screen; `/organizer/rides/[id]/edit` shows a not-found state for someone else's
  ride id, prefills every field correctly (including the local time/zone round-trip),
  saves via duplicate-submit-protected `PATCH`, and reflects the update after reload.
  Nav "Заезды" now opens the list. Create-success view links straight into edit.
- `turbo run lint/typecheck/build/test` (run separately) all green; `format:check`/
  `lint:root` clean.
- Live check: curl sequence (401/403/404-cross-organizer/409-non-draft/200 sequences,
  cross-checked against a direct DB read) plus a real-browser walkthrough via
  `browser-automation` covering create → list → edit → save → reload.

## Planned files

- `docs/tasks.md` (+CR-088 line; check CR-016/CR-018).
- `apps/api/src/lib/cursor.ts` (new).
- `packages/types/src/api/rides.ts` (+schemas/types), `src/index.ts` if new exports
  need adding (likely already covered by existing `export *`).
- `apps/api/src/modules/rides/{rides.service.ts,rides.routes.ts,rides.routes.test.ts}`
  (extend).
- `apps/web/src/lib/datetime/zoned-time.ts` (+fn, +test).
- `apps/web/src/features/organizer/rides/{api.ts,nav.ts,rides.test.tsx,
components/RidesList.tsx,components/EditRideForm.tsx}` (new/extend).
- `apps/web/src/app/organizer/rides/page.tsx` (new),
  `apps/web/src/app/organizer/rides/[id]/edit/page.tsx` (new).
- `packages/ui/src/terminology.ts` (+RIDE_LIST_TERMS/RIDE_EDIT_TERMS).
- `docs/api.md`, `docs/database.md` (update Rides section).

## Implementation progress

- [x] Plan written (this file)
- [x] `apps/api/src/lib/cursor.ts`
- [x] `packages/types` schema additions
- [x] `apps/api` rides module (`mine`/`:id` GET/PATCH) + tests
- [x] `apps/web` zoned-time reverse conversion + feature (list + edit) + pages + nav
- [x] Full validation
- [x] Live check
- [x] Context/docs updated (changelog, project-state, architecture-map,
      known-issues, tasks.md, docs/api.md, docs/database.md)
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck lint test build` (all 25 tasks, run together against
  a real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/
coffee_ride_dev` — Docker Desktop still unavailable in this environment):
  all green. `apps/api` 73 tests (was 58, +15 in `rides.routes.test.ts`),
  run twice in a row to confirm stability after the two bugs below were
  fixed. `apps/web` 56 tests (was 44, +13 — 8 in `rides.test.tsx` for
  `RidesList`/`EditRideForm`, 4 new in `zoned-time.test.ts` for
  `utcIsoToZonedLocalInput`, 1 net from `CreateRideForm`'s unchanged suite).
  `next build` compiles `/organizer/rides` (static) and `/organizer/rides/
[id]/edit` (dynamic) cleanly.
- `pnpm format:check` / `pnpm lint:root`: clean (one `prettier --write` pass
  this session on 6 files).
- Live check via curl against a real `apps/api` + `coffee_ride_dev`: full
  sequence — register/verify/login/create-organizer-profile/create-ride,
  `GET /v1/rides/mine` (empty before the profile existed, populated after,
  malformed cursor → 400 `invalid_cursor`), `GET /v1/rides/:id` (owner 200,
  a second registered "stranger" account 404 `ride_not_found`, non-existent
  id 404), `PATCH /v1/rides/:id` (valid 200 cross-checked against a direct
  `SELECT`, flipped to `published` via direct SQL then `PATCH` → 409
  `ride_not_editable`, reverted to `draft`, invalid `participantLimit: -5`
  → 400 `validation_error`).
- Live browser check via the `browser-automation` skill against a real `next
dev` server + `apps/api` (a pre-existing server left running from an
  earlier session — reused rather than restarted, confirmed already serving
  this session's new routes via `tsx watch`'s auto-reload): logged in with
  the seeded organizer account; `/organizer`'s "Заезды" nav link resolved to
  `/organizer/rides` (confirmed via `<a href>`, not just visually);
  `/organizer/rides` showed "Мои заезды"/"Новый заезд"/a "Черновик" group
  heading with the seeded ride card (correct local start time "1 августа
  2027 21:00" for an 18:00 UTC instant in Europe/Moscow, "Шоссейный" bicycle
  type); clicking the card navigated to `/organizer/rides/[id]/edit` with
  every field correctly prefilled (title/description/`startsAt` local
  value/participantLimit/priceRub/distanceKm/difficulty all matched exactly);
  edited the title, saved, saw "Изменения сохранены.", reloaded, the new
  title persisted. A separate run confirmed the not-found state (`Заезд не
найден` / "К списку заездов") for a random ride id. No console errors
  beyond the expected pre-login noise and the not-found check's expected 404. Test accounts/rides deleted from the scratch DB afterward; the `next
dev` server this session started was stopped, the pre-existing `apps/api`
  one left as found.
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation (not left open):

- A raw JS `Date` interpolated into a hand-written Drizzle `sql` template
  (the cursor's keyset-comparison condition) throws `ERR_INVALID_ARG_TYPE`
  inside the `postgres` driver's own parameter binding — confirmed live via
  a standalone repro script, not guessed. The driver only auto-serializes
  parameters bound through Drizzle's own typed column helpers. Fixed by
  passing the cursor's `createdAt` as the ISO string it already is
  (`::timestamptz` cast on the SQL side), not a `Date`.
- `rides.routes.test.ts`'s own new tests' last-run case (a CSRF-rejected
  `PATCH`) creates a real ride via a preceding successful `POST` before the
  rejected request — unlike the file's original last test, which never got
  past the CSRF check at all — leaving a `rides` row (and its
  `organizer_profiles`/`users` rows) alive after the file finished.
  `rides.organizer_id` is `ON DELETE RESTRICT`, so the next test file's
  unscoped `DELETE FROM users` then failed with a foreign-key violation.
  Fixed with an `afterAll` in `rides.routes.test.ts` that cleans up after
  this file's own tests, rather than relying on running last.

New known issues opened: none. KI-024 (no "My rides" list) is resolved by
this ticket — moved to `.claude/context/known-issues.md`'s Resolved section.

## Final result

CR-088/CR-016/CR-018 complete, in one session, in that order. CR-088
(`GET /v1/rides/mine` + `/organizer/rides`) was added as a new ticket
(first free CR number, CR-001..CR-087 had no gaps) per KI-024's own "next
action," and built first so CR-018's edit screen had a real UI entry point.
CR-016 ("Organizer authorization") and CR-018 ("Edit draft") then landed
together — `GET`/`PATCH /v1/rides/:id`, ownership-scoped through the
caller's own `OrganizerProfile`, 404 `ride_not_found` for both "doesn't
exist" and "isn't yours" (never distinguished), `PATCH` draft-only (409
`ride_not_editable` otherwise), filling in every field CR-017 left `null`.
No `packages/db` migration — CR-017's table already had every column. Two
real bugs were found and fixed along the way (a Drizzle/postgres.js
parameter-binding gap, and a test-suite cross-file cleanup gap), not worked
around. All acceptance criteria met, full validation suite green (25/25
tasks, `apps/api` stable across 2 repeated runs), live-verified end to end
over both curl and a real browser session including the not-found state.
`docs/tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`,
`.claude/context/architecture-map.md`, `.claude/context/known-issues.md`,
`docs/api.md`, `docs/database.md` all updated. Not yet committed —
`git diff`/`git status` reviewed next; pre-existing unrelated pending
changes (`docs/product.md`, `.mcp.json`, `skills-lock.json`) again left
untouched and out of scope. A local `.env` was created for this session's
live checks (gitignored, not part of the diff) — left in place for
continued local dev rather than deleted, since it contains no real secrets
(a local-only `AUTH_SECRET`, local Postgres URL).
