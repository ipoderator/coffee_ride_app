# Current Task

## Status

complete

## Task ID

CR-020 — Close registration, together with a new CR-089 — Open registration
(`docs/tasks.md`'s Rides section had no ticket for `published ->
registration_open` at all — flagged as KI-025 during CR-019,
`.claude/context/known-issues.md`).

## Goal

Continue `docs/tasks.md`'s Rides section per the user's "continue per the
plan" instruction. Next unchecked ticket is CR-020 ("Close registration"),
but its natural source state (`registration_open`) is unreachable — nothing
transitions a ride into it yet. Resolve KI-025 now rather than leaving it
open, by adding the missing ticket and implementing both transitions in the
same pass:

- `POST /v1/rides/:id/open-registration` — `published -> registration_open`
  (new, CR-089).
- `POST /v1/rides/:id/close-registration` — `registration_open ->
registration_closed` (CR-020).

## Scoping decisions

- **Fold vs. new ticket, per KI-025's own two options.** Chose "add a
  preceding ticket" (CR-089) over silently folding the open-transition into
  CR-020 — same precedent as CR-088 for KI-024 (a real backlog gap gets its
  own CR number, not a silent scope-widening of an unrelated ticket).
  CR-089 is the next free number (CR-088 was the last used).
- **Both land in one session/commit anyway.** CR-020 has nothing to close
  without CR-089 existing first, so implementing them separately would mean
  CR-020 is untestable on its own — same reasoning CR-019 used for folding in
  CR-059's remaining scope, and CR-016 for landing with CR-018.
- **No `emailVerified` gate on either transition.** `.claude/rules/
security.md` names exactly one trigger: "before an account can act as an
  organizer (**publish** a ride)". Open/close-registration are post-publish
  organizer actions on a ride that was already gated at publish time; there
  is no de-verification flow in this codebase that could make
  `emailVerified` go from `true` back to `false` on an existing account, so
  re-checking here would be a defensive check against a state that cannot
  occur, not a real gap. Not added.
- **Ownership/not-found rules match `publish` exactly**: 404
  `ride_not_found` whether the id doesn't exist or belongs to a different
  organizer (same resource-enumeration reasoning, `RIDE_NOT_FOUND` reused
  as-is).
- **Lifecycle gates, one per action, both new codes**:
  - `open-registration`: 409 `ride_registration_not_openable` unless
    `status === 'published'` (covers `draft`, already-`registration_open`,
    `registration_closed`, `started`, `finished`, `cancelled`).
  - `close-registration`: 409 `ride_registration_not_closable` unless
    `status === 'registration_open'`.
  - Distinct codes from each other and from `ride_not_publishable`/
    `ride_not_editable` — same "one code per action" convention every
    existing ride-lifecycle error already follows, so `apps/web` (and any
    future caller) can branch without inspecting `detail` text.
- **Check order: 401 -> 404 (ownership) -> 409 (not right state) -> 200.**
  No capability gate in the middle this time (unlike `publish`'s email
  check) — ownership first, then the one remaining resource-state check.
- **No new migration.** `registration_open`/`registration_closed` already
  exist in the `ride_status` pg enum (CR-017). Both tickets only add new
  state _transitions_.
- **Web: both actions live on `/organizer/rides/[id]/edit`**, same screen
  CR-019 put "Опубликовать" on. `docs/design.md` §8 has no dedicated
  "manage registration" screen (the closest, `/organizer/rides/[id]/
participants`, is CR-037's scope — participants/waitlist, not a status
  toggle) — the edit screen is already the place a non-draft ride renders
  read-only with a status badge and the one action button appropriate to
  its current state, so this is the natural continuation of CR-019's
  pattern, not a new one. Conditionally rendered by `ride.status`:
  `published` -> "Открыть регистрацию" button; `registration_open` ->
  "Закрыть регистрацию" button; any other non-draft status -> no action
  button (matches CR-019's precedent of hiding publish for non-draft). No
  confirmation dialog, same reasoning CR-019 documented (no such UI
  vocabulary exists anywhere yet).
- **`RidesList` unaffected.** `RIDE_STATUS_TERMS` already has labels/tones
  for `registration_open`/`registration_closed` since CR-064 — no changes
  needed there.

## Requirements

- `packages/types/src/api/rides.ts`: `OpenRegistrationResponse`/
  `CloseRegistrationResponse` (both `{ ride: Ride }`).
- `apps/api/src/modules/rides/rides.service.ts`: `openRegistration(db,
userId, rideId)` + `closeRegistration(db, userId, rideId)` +
  `RIDE_REGISTRATION_NOT_OPENABLE`/`RIDE_REGISTRATION_NOT_CLOSABLE` error
  factories.
- `apps/api/src/modules/rides/rides.routes.ts`: `POST
/:id/open-registration` + `POST /:id/close-registration`.
- `apps/api/src/modules/rides/rides.routes.test.ts`: two new `describe`
  blocks (401/404-nonexistent/404-other-organizer/409-wrong-state/
  200-happy-path-with-DB-read/403-CSRF each).
- `apps/web/src/features/organizer/rides/api.ts`: `openRegistration(id)`/
  `closeRegistration(id)`.
- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`:
  the two conditional buttons + handlers.
- `packages/ui/src/terminology.ts`: `RIDE_EDIT_TERMS` gains
  `openRegistration`/`openRegistrationPending`/`openRegistrationSuccess`/
  `closeRegistration`/`closeRegistrationPending`/`closeRegistrationSuccess`.
- `docs/api.md`: fill in both `POST /v1/rides/:id/open-registration` (new
  line) and `.../close-registration` (currently a bare path) lines.
- `.claude/context/known-issues.md`: resolve KI-025.
- `docs/tasks.md`: add CR-089 ("Open registration") to the Rides section;
  check off CR-020 and CR-089.

## Acceptance criteria

- `POST /v1/rides/:id/open-registration`: no cookie -> 401; non-existent id
  -> 404 `ride_not_found`; another organizer's ride -> 404 `ride_not_found`;
  caller's own non-`published` ride -> 409
  `ride_registration_not_openable`; caller's own `published` ride -> 200,
  `{ ride }` with `status: 'registration_open'`, `updatedAt` bumped,
  `updatedBy` = caller (cross-checked against a direct DB read); mismatched
  `Origin` -> 403 CSRF.
- `POST /v1/rides/:id/close-registration`: no cookie -> 401; non-existent id
  -> 404 `ride_not_found`; another organizer's ride -> 404 `ride_not_found`;
  caller's own non-`registration_open` ride -> 409
  `ride_registration_not_closable`; caller's own `registration_open` ride ->
  200, `{ ride }` with `status: 'registration_closed'`, `updatedAt` bumped,
  `updatedBy` = caller (cross-checked against a direct DB read); mismatched
  `Origin` -> 403 CSRF.
- Web: on `/organizer/rides/[id]/edit` for a `published` ride, an "Открыть
  регистрацию" button appears; clicking it opens registration, shows a
  success message, and the status badge flips to "Регистрация открыта" with
  a "Закрыть регистрацию" button appearing in its place; clicking that
  closes registration and flips the badge to "Регистрация закрыта" with no
  further action button. A `draft` ride shows neither button (only
  "Опубликовать", unchanged from CR-019).
- `turbo run lint/typecheck/build/test` all green; `format:check`/
  `lint:root` clean.
- Live check: curl sequences for both endpoints (401/404x2/409/200/403 each,
  cross-checked against a direct DB read) plus a real-browser walkthrough
  via `browser-automation` covering published -> open -> closed.

## Planned files

- `packages/types/src/api/rides.ts` (+2 response types).
- `apps/api/src/modules/rides/{rides.service.ts,rides.routes.ts,
rides.routes.test.ts}` (extend).
- `apps/web/src/features/organizer/rides/{api.ts,
components/EditRideForm.tsx}` (extend).
- `packages/ui/src/terminology.ts` (+6 `RIDE_EDIT_TERMS` keys).
- `docs/api.md` (Rides section, both lines).
- `.claude/context/known-issues.md` (resolve KI-025).
- `docs/tasks.md` (add CR-089, check CR-020/CR-089).

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

- `turbo run typecheck lint test build` (all 25 tasks) against a real
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
  (Docker Desktop still unavailable in this environment): green. One
  transient failure along the way — running `build`+`typecheck` concurrently
  via `turbo` raced against a freshly-deleted `apps/web/.next` (the same
  class of issue the CR-019 session hit with `build`+`next dev`, just a
  different concurrent pair); resolved by running `build` alone once, then
  the rest — not a code defect, `.next` was stale/absent, not corrupted by
  the app. `apps/api` 92 tests (was 80, +12: 6 for
  `open-registration`, 6 for `close-registration`). `apps/web` 63 tests (was
  59, +4).
- `pnpm format:check`/`pnpm lint:root`: clean. One real (not just cosmetic)
  fix needed along the way: two `docs/tasks.md` bullets triggered a Prettier
  markdown proseWrap instability — an inline code span broken across a
  list-item continuation line reformatted differently on every successive
  `--write` pass (never converged). Fixed by rewording those two bullets to
  keep each inline code span on one line, not by fighting the formatter.
- Live check via curl against a real Postgres + running `apps/api` (already
  running on port 4000 from a prior session): full sequence on one ride
  (register/verify/login/create-organizer-profile/create-draft-ride) —
  `open-registration`: 401 (no cookie) → 404 (non-existent id) → 409
  `ride_registration_not_openable` (still draft) → [publish] → 404 (another
  organizer's ride) → 200 happy path; `close-registration`: 403 CSRF
  (mismatched Origin) → 200 happy path → 409
  `ride_registration_not_closable` (already closed). Every state transition
  cross-checked against a direct `SELECT` (`status`/`updated_by` correct at
  each step). Test accounts/rides deleted from the scratch DB afterward.
- Live browser check via the `browser-automation` skill against a real `next
dev` server (started fresh for this check, stopped afterward) + the
  already-running `apps/api`: logged in as a fresh organizer with a
  `published` ride, confirmed "Открыть регистрацию" visible and "Закрыть
  регистрацию" absent, clicked it, confirmed via `page.waitForResponse` the
  `POST .../open-registration` response was `200`, the success message
  "Регистрация открыта." and the "Регистрация открыта" status badge
  appeared, and the button flipped to "Закрыть регистрацию"; clicked that,
  confirmed `POST .../close-registration` was `200`, the success message
  "Регистрация закрыта." and "Регистрация закрыта" badge appeared with no
  action button remaining — screenshot taken and visually confirmed to
  match. No console errors during the actual flow; two `ERR_ABORTED` network
  entries were ordinary Next dev HMR/RSC prefetch noise from the initial
  page load, unrelated to the feature. Test account/ride deleted from the
  scratch DB afterward.
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation/validation (not left open):

- Same class of self-inflicted environment issue as the CR-019 session
  (there: `turbo build` vs. a live `next dev`; here: `turbo`'s own
  concurrent `build`+`typecheck` vs. a freshly-deleted `.next`) — not a new
  standing known issue, just the same "don't run `next build`/`typecheck`
  concurrently against a `.next` directory mid-(re)generation" caveat
  recurring in a slightly different shape. Resolved by sequencing (`build`
  alone, then the rest); both converged to 25/25 green immediately after.
- A real Prettier markdown proseWrap instability, not a product bug: two
  `docs/tasks.md` bullets containing a long inline code span wrapped across
  a list continuation line never converged under repeated `prettier
--write` (the indentation kept changing). Fixed by rewording the two
  bullets to keep each inline code span on one line — worth remembering for
  any future changelog/tasks entry with a long backtick-wrapped path.

New known issues opened: none. KI-025 resolved (see
`.claude/context/known-issues.md`).

## Final result

CR-020 ("Close registration") complete, together with a new ticket, CR-089
("Open registration"), added this session to resolve KI-025 (no ticket
previously transitioned a ride into `registration_open` at all — flagged by
the CR-019 session, resolved here per its own documented options, same
"add a preceding ticket" precedent as CR-088/KI-024). `POST /v1/rides/
:id/open-registration` (`published -> registration_open`) and `POST
/v1/rides/:id/close-registration` (`registration_open ->
registration_closed`), same ownership rules as `publish` (404
`ride_not_found` either way), two new 409 codes
(`ride_registration_not_openable`/`ride_registration_not_closable`).
Deliberately no `emailVerified` gate on either — `.claude/rules/security.md`
names only the publish trigger, and there's no de-verification flow that
could apply here. No `packages/db` migration — both enum values already
existed since CR-017. `apps/web`'s `/organizer/rides/[id]/edit` gained two
status-conditional buttons ("Открыть регистрацию"/"Закрыть регистрацию"),
same pattern CR-019 established for "Опубликовать". All acceptance criteria
met; full validation suite green (25/25 tasks); live-verified end to end
over both curl (multiple response codes per endpoint, cross-checked against
direct DB reads) and a real browser session (published → open → closed,
screenshot-verified). `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md`, `.claude/context/architecture-map.md`,
`.claude/context/known-issues.md`, `docs/api.md` all updated. Not yet
committed — `git diff`/`git status` reviewed next; CR-019's own commit
already landed earlier this session, so this diff is CR-089/CR-020 only.
