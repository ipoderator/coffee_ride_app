# Current Task

## Status

complete

## Task ID

CR-022 — Finish ride, together with a new CR-090 — Start ride
(`docs/tasks.md`'s Rides section had no ticket for `registration_closed ->
started` at all — same shape of gap as KI-024/KI-025).

## Goal

Continue `docs/tasks.md`'s Rides section (CR-017/CR-088/CR-016/CR-018/
CR-019/CR-089/CR-020/CR-021 all done). Next unchecked ticket is CR-022
("Finish ride"), but its natural source state per `docs/product.md`'s
Lifecycle —

`draft → published → registration_open → registration_closed → started →
finished`

— is `started`, and nothing in `docs/tasks.md`'s Rides section transitions a
ride into `started` at all. This is the same shape of gap KI-024 (no "My
rides" list) and KI-025 (no "open registration" transition) already were:
discovered exactly because the next unchecked ticket's source state turned
out to be unreachable.

## Investigation before deciding the fix

Checked whether `started` might instead be an automatic (time-based)
transition rather than an organizer action, which would make "Finish"
correctly source from `registration_closed` directly:

- `docs/product.md`'s Organizer capabilities list says "create/edit/publish/
  cancel/finish rides" — no explicit "start" — but it also never itemizes
  "open/close registration" (says only "manage registrations and waitlist"
  generically), and that turned out to be two real, separate, organizer-
  triggered tickets (CR-089/CR-020). So the capabilities bullet list is not
  an exhaustive enumeration of every fine-grained lifecycle action; its
  absence doesn't prove `start` is non-manual.
- Grepped `docs/`, `.claude/rules/` for any mention of a scheduled job/cron/
  automatic status transition — none exists. No job infrastructure ticket
  in `docs/tasks.md` covers this either (Redis/jobs are "only where
  justified", and no ticket has justified one for this).
- `docs/product.md`'s Out-of-scope list excludes live GPS tracking, not a
  manual start/finish toggle.

Conclusion: same fix as KI-024/KI-025 — add the missing preceding ticket
(CR-090, "Start ride") and build it together with CR-022, rather than either
silently widening CR-022's scope to skip `started` or leaving CR-022
unbuildable. First free CR number after CR-089 (checked for gaps: none).

## Scoping decisions

- **`registration_closed -> started` (CR-090) and `started -> finished`
  (CR-022), two separate endpoints** — same "one transition per endpoint"
  shape as every prior ride-lifecycle ticket, not a combined "start and
  immediately allow finishing" action.
- **Ownership/not-found rules match every prior transition exactly**: 404
  `ride_not_found` whether the id doesn't exist or belongs to a different
  organizer.
- **No `emailVerified` gate on either** — same reasoning as
  `open-registration`/`close-registration`/`cancel`: only `publish` is named
  by `.claude/rules/security.md`.
- **Two new 409 codes**: `ride_not_startable` (`start`, guard:
  `registration_closed` only) and `ride_not_finishable` (`finish`, guard:
  `started` only) — one code per action, same convention as every existing
  ride-lifecycle error.
- **No new migration.** `started`/`finished` already exist in the
  `ride_status` pg enum (CR-017).
- **Cancellation is unaffected and untouched.** `docs/product.md`'s
  Cancellation line names only `published`/`registration_open`/
  `registration_closed` as cancellable — `started` was deliberately left out
  of `CANCELLABLE_STATUSES` when CR-021 was built, so a `started` ride
  correctly shows neither a cancel button nor a working `POST .../cancel`
  (`409 ride_not_cancellable`). No code change needed there; verified by
  inspection, not assumed.
- **Web: both actions live on `/organizer/rides/[id]/edit`**, same screen
  every prior transition button landed on. `registration_closed` → "Начать
  заезд" button; `started` → "Завершить заезд" button; `finished` → no
  action button (terminal state, matches `cancelled`'s pattern). No
  confirmation dialog for either — unlike `cancel`, both are forward-only
  steps with a further continuation in the normal case (`start` leads to
  `finish`), not the one dead-end action `docs/design.md` singles out.
- **New KI-027**, documenting this gap and its resolution, same as
  KI-024/KI-025's own entries — for the next session to find if a similar
  "next ticket's source state is unreachable" surprise recurs.

## Requirements

- `packages/types/src/api/rides.ts`: `StartRideResponse`/`FinishRideResponse`
  (both `{ ride: Ride }`).
- `apps/api/src/modules/rides/rides.service.ts`: `startRide(db, userId,
rideId)` + `finishRide(db, userId, rideId)` + `RIDE_NOT_STARTABLE`/
  `RIDE_NOT_FINISHABLE` error factories.
- `apps/api/src/modules/rides/rides.routes.ts`: `POST /:id/start` + `POST
/:id/finish`.
- `apps/api/src/modules/rides/rides.routes.test.ts`: two new `describe`
  blocks (401/404-nonexistent/404-other-organizer/409-wrong-state/
  200-happy-path-with-DB-read/403-CSRF each).
- `apps/web/src/features/organizer/rides/api.ts`: `startRide(id)`/
  `finishRide(id)`.
- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`: two
  conditional buttons + handlers (no confirm guard).
- `packages/ui/src/terminology.ts`: `RIDE_EDIT_TERMS` gains
  `start`/`startPending`/`startSuccess`/`finish`/`finishPending`/
  `finishSuccess`.
- `docs/api.md`: add `POST /v1/rides/:id/start` (new line) and fill in
  `.../finish` (currently a bare path).
- `.claude/context/known-issues.md`: new KI-027.
- `docs/tasks.md`: add CR-090 ("Start ride") to the Rides section; check off
  CR-022 and CR-090.

## Acceptance criteria

- `POST /v1/rides/:id/start`: no cookie → 401; non-existent id → 404
  `ride_not_found`; another organizer's ride → 404 `ride_not_found`; caller's
  own non-`registration_closed` ride → 409 `ride_not_startable`; caller's own
  `registration_closed` ride → 200, `{ ride }` with `status: 'started'`,
  `updatedAt` bumped, `updatedBy` = caller (cross-checked against a direct DB
  read); mismatched `Origin` → 403 CSRF.
- `POST /v1/rides/:id/finish`: same shape, guard `started` only, 409
  `ride_not_finishable` otherwise, `200` → `status: 'finished'`.
- Web: on `/organizer/rides/[id]/edit`, a `registration_closed` ride shows
  "Начать заезд"; clicking it succeeds and the button flips to "Завершить
  заезд" (`started`); clicking that succeeds and no action button remains
  (`finished`). A `started` ride shows no cancel button (already true from
  CR-021 — reconfirmed, not just assumed).
- `turbo run lint/typecheck/build/test` all green; `format:check`/
  `lint:root` clean.
- Live check: curl sequences for both endpoints (401/404×2/409/200/403 each,
  cross-checked against direct DB reads) plus a real-browser walkthrough via
  `browser-automation` covering `registration_closed → started → finished`.

## Planned files

- `packages/types/src/api/rides.ts` (+2 response types).
- `apps/api/src/modules/rides/{rides.service.ts,rides.routes.ts,
rides.routes.test.ts}` (extend).
- `apps/web/src/features/organizer/rides/{api.ts,
components/EditRideForm.tsx}` (extend).
- `packages/ui/src/terminology.ts` (+6 `RIDE_EDIT_TERMS` keys).
- `docs/api.md` (Rides section, two lines).
- `.claude/context/known-issues.md` (new KI-027).
- `docs/tasks.md` (add CR-090, check CR-022/CR-090).

## Implementation progress

- [x] Plan written (this file)
- [x] `packages/types` addition
- [x] `apps/api` rides module (both endpoints) + tests
- [x] `apps/web` feature (buttons) + terminology
- [x] Full validation
- [x] Live check
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck lint test build` (19 tasks, real
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`,
  Docker Desktop still unavailable): green. `apps/api` gained 13 new tests
  (113 total, was 100 — 6 for `start`, 6 for `finish`,
  1 reconfirming `started` stays non-cancellable). `apps/web` gained 5 new
  tests (74 total, was 69).
- `pnpm format:check`/`pnpm lint:root`: clean. One real (not cosmetic) fix
  needed: a new `docs/tasks.md` bullet (CR-022's entry, with a long inline
  code span split across a list continuation line) hit the exact same
  Prettier markdown proseWrap instability CR-089/CR-020 already documented
  — never converges under repeated `--write`. Fixed the same way that
  session did: reworded the bullet to keep the code span on one line, then
  verified stable across two more `--write` passes before moving on.
- Live check via curl against a real Postgres + the already-running
  `apps/api` (left running from the prior "run the site locally" request —
  confirmed still healthy via `/health` before reusing it): register →
  verify → login → create organizer profile → one ride driven through
  publish/open-registration/close-registration, then: 401 (no cookie) on
  both `start`/`finish`; 404 `ride_not_found` (non-existent id) on both;
  409 `ride_not_finishable` (finish before start); 200 `start` →
  `status: 'started'`; 409 `ride_not_startable` (start again); 409
  `ride_not_cancellable` (cancel the now-`started` ride — reconfirms
  CR-021's `CANCELLABLE_STATUSES` was already correct); 200 `finish` →
  `status: 'finished'`; 409 `ride_not_finishable` (finish again); a second
  organizer's 404 on both endpoints; 403 `csrf_origin_mismatch` on both.
  Final state cross-checked against a direct `SELECT`. Test
  accounts/rides deleted from the scratch DB afterward.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server (started fresh, stopped afterward) + the already-running
  `apps/api`: prepared a fresh organizer account and a `registration_closed`
  ride via curl, then drove the browser: login → `/organizer/rides/[id]/
edit` → clicked "Начать заезд" (`POST .../start` returned `200`, tracked
  via `page.waitForResponse`) → success message "Заезд начат." and button
  flipped to "Завершить заезд" → clicked it (`POST .../finish` returned
  `200`) → success message "Заезд завершён.", status badge "Завершён", no
  action button remaining, every form field disabled. Cross-checked against
  a direct DB read (`status`/`updated_by` correct). 0 console errors, 0
  failed requests during the flow itself. Test account/ride deleted from the
  scratch DB afterward.
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation/validation (not left open):

- Same class of Prettier markdown proseWrap instability the CR-089/CR-020
  session already documented and fixed once (a long inline code span
  wrapped across a `docs/tasks.md` list continuation line never converges
  under repeated `prettier --write`) — recurred in this session's own new
  bullet. Not a new standing issue, just the same caveat resurfacing;
  resolved the same way (reword to keep the code span on one line).
- Confirmed the API dev server left running from the earlier "run the site
  locally" request in this same session had never actually been killed
  (the `pkill -f "tsx watch src/server.ts"` pattern used at the time didn't
  match the real process command line under `tsx`'s current loader
  invocation) — reused it directly for this ticket's curl checks after
  confirming it was still healthy via `/health`, rather than starting a
  redundant second instance. Not a code defect; worth remembering that
  `pkill` pattern is unreliable for this project's `tsx watch` process,
  should a future session need to actually stop it (check the listening
  port directly instead, e.g. `lsof -ti :4000 | xargs kill`).

New known issues opened: none. KI-027 resolved
(`.claude/context/known-issues.md`).

## Final result

CR-090 ("Start ride", new ticket) and CR-022 ("Finish ride") complete,
built together in one session. `POST /v1/rides/:id/start`
(`registration_closed -> started`) and `POST /v1/rides/:id/finish` (`started
-> finished`, the lifecycle's terminal non-cancelled state), both in
`apps/api/src/modules/rides`. Resolves KI-027 (no ticket previously
transitioned a ride into `started` at all — same shape of gap as
KI-024/KI-025, discovered by checking the plan before implementing rather
than assuming CR-022 was directly buildable). Same ownership rules as every
prior transition (404 `ride_not_found` either way), no `emailVerified` gate.
Two new 409 codes, one per action. No `packages/db` migration. Before
deciding to add CR-090, explicitly checked and ruled out the alternative
that `started` might be an automatic/time-based transition (no scheduled-job
infrastructure or ticket exists anywhere in the repo to drive one) —
documented in this file's own "Investigation before deciding the fix"
section above, not just asserted. `/organizer/rides/[id]/edit` gained
"Начать заезд"/"Завершить заезд" buttons, no confirmation guard (unlike
`cancel` — both are forward-only steps). Reconfirmed by a new test (not
just inspection) that a `started` ride still correctly rejects
`POST .../cancel`. All acceptance criteria met; full validation suite green
(19/19 turbo tasks, `apps/api` 113 tests, `apps/web` 74 tests);
live-verified end to end over both curl (multiple response codes,
cross-checked against direct DB reads) and a real browser session
(`registration_closed → started → finished`, cross-checked against a direct
DB read). `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/{project-state,architecture-map,known-issues}.md` all
updated. The ride lifecycle (`draft` through `cancelled`/`finished`) is now
fully implemented end to end for the first time — every status in the
`ride_status` pg enum is reachable through a real endpoint. Not yet
committed — `git diff`/`git status` reviewed next; CR-021's own commit
(from the prior session) has not landed either, so this diff includes both
CR-021 and CR-090/CR-022 unless committed separately.
