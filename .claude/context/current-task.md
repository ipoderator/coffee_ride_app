# Current Task

## Status

complete

## Task ID

CR-019 — Publish ride, together with the remaining scope of CR-059 — Email
verification flow ("gates organizer publish action" — `docs/tasks.md`'s own
note: "gating organizer publish on `emailVerified` is still open (no publish
action exists yet)"). CR-011 already shipped CR-059's token issue/verify
mechanism; the one piece left is exactly this gate, so it lands with CR-019
rather than as a separate pass — same reasoning as CR-016 landing with CR-018
last session.

## Goal

Continue `docs/tasks.md`'s Rides section per the user's "continue per the
plan" instruction. Next unchecked ticket is CR-019 ("Publish ride"):
`POST /v1/rides/:id/publish`, transitioning a `draft` ride to `published`
(`docs/product.md` Lifecycle: `draft → published → registration_open → ...`).

## Scoping decisions

- **`.claude/rules/security.md` names this exact trigger**: "Require a
  verified email before an account can act as an organizer (publish a
  ride)". `POST /v1/rides` and `POST /v1/organizers/me` already gate
  creation on `emailVerified` (403 `email_verification_required`, fresh DB
  read); publish is the one remaining organizer action with no such gate.
  Implementing CR-019 without it would leave a known CRITICAL security rule
  unmet on the exact action the rule names — not deferrable per CLAUDE.md's
  quality gate. Reuses the identical error code `email_verification_required`
  (`organizers.service.ts`'s `EMAIL_VERIFICATION_REQUIRED` pattern,
  duplicated locally in `rides.service.ts` — same as every other per-module
  domain-error factory in this codebase, e.g. `RIDE_NOT_FOUND` vs.
  organizers' own `NOT_FOUND`) so `apps/web` can branch on one stable code
  regardless of which endpoint returned it.
- **Only `draft → published`, not `draft → registration_open`.** The
  lifecycle string in `docs/product.md` has 4 states before
  `registration_closed` (`draft`/`published`/`registration_open`/
  `registration_closed`), but `docs/tasks.md` has no "open registration"
  ticket — only CR-019 (publish) and CR-020 (close registration) exist.
  CR-019 is scoped to exactly what its name says: `published`. Whatever
  transitions a ride into `registration_open` is a real gap in the backlog,
  not something to silently invent here — flagged as a new known issue
  (KI-025) for whichever of CR-020/CR-032 ("Register") turns out to be the
  right owner, not resolved by this ticket.
- **Ownership/not-found rules match `GET`/`PATCH /v1/rides/:id`
  exactly**: 404 `ride_not_found` whether the id doesn't exist or belongs to
  a different organizer (same resource-enumeration reasoning, `RIDE_NOT_FOUND`
  reused as-is from `rides.service.ts`).
- **Draft-only, like `PATCH`.** `409 ride_not_publishable` (new code, distinct
  from `PATCH`'s `ride_not_editable` — a different action, different
  detail message: "Only a draft ride can be published.") for any non-`draft`
  status, including re-publishing an already-`published` ride.
- **Check order: 401 → 404 (ownership) → 403 (email verification) → 409
  (not draft) → 200.** Ownership/existence first (never leak whether a ride
  exists to a non-owner, matching `GET`/`PATCH`); email verification next
  because it's a caller-level capability gate independent of which ride —
  same relative ordering `createOrganizerProfile` uses (identity/capability
  gates before resource-state checks).
- **No new "minimum completeness" gate invented.** Nothing in `docs/design.md`
  or `docs/product.md` requires `participantLimit`/`distanceKm`/etc. to be
  set before publishing, and CR-018 already allows every optional field to
  stay `null` indefinitely. Publishing a ride whose only guaranteed fields
  are the CR-017 minimum (`title`/`bicycleType`/`startsAt`/`startTimezone`)
  is allowed — inventing a stricter gate without a documented requirement
  would be scope creep, not a fix.
- **No migration.** `published` already exists in the `ride_status` pg enum
  (CR-017). This ticket only adds a new state _transition_, not a new state
  value.
- **Web: publish button lives on `/organizer/rides/[id]/edit`**, next to
  Save, visible only while `isDraft` — `docs/design.md` §8 has no separate
  "publish" screen, and the edit screen already flips to a read-only view the
  moment `ride.status !== 'draft'`, so publishing from here is what actually
  makes that transition visible without a full-page reload. One click, same
  duplicate-submit-protection/loading-state discipline as Save
  (`.claude/rules/frontend.md`) — no confirmation dialog: no such pattern
  exists anywhere yet in this codebase, and adding a one-off modal here would
  be new UI vocabulary invented mid-ticket, not a documented requirement.
  `email_verification_required` shows the same guiding message pattern
  `OrganizerProfileForm` already established (a dedicated banner rather than
  the generic form-error line), reusing the same Russian wording, added as a
  new `RIDE_EDIT_TERMS` key rather than cross-importing `ORGANIZER_TERMS`
  (each screen owns its own terminology block, existing convention).
- **`RidesList` unaffected.** It already renders whatever `RIDE_STATUS_TERMS`
  says for `published` (already defined since CR-064) — no changes needed
  there.

## Requirements

- `packages/types/src/api/rides.ts`: `PublishRideResponse` (`{ ride: Ride }`).
- `apps/api/src/modules/rides/rides.service.ts`: `publishRide(db, userId,
rideId)` + `RIDE_NOT_PUBLISHABLE`/`EMAIL_VERIFICATION_REQUIRED` error
  factories.
- `apps/api/src/modules/rides/rides.routes.ts`: `POST /:id/publish`.
- `apps/api/src/modules/rides/rides.routes.test.ts`: new `describe('POST
/v1/rides/:id/publish')` block (401/404-nonexistent/404-other-organizer/403-
  unverified-email/409-not-draft/200-happy-path-with-DB-read/403-CSRF); update
  the stale "No publish endpoint exists yet (CR-019)" comment on the existing
  `PATCH` non-draft test.
- `apps/web/src/features/organizer/rides/api.ts`: `publishRide(id)`.
- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`:
  publish button + `email_verification_required` banner.
- `packages/ui/src/terminology.ts`: `RIDE_EDIT_TERMS` gains `publish`/
  `publishPending`/`publishSuccess`/`publishEmailVerificationRequired`.
- `docs/api.md`: fill in the `POST /v1/rides/:id/publish` line (currently a
  bare, unimplemented-looking path with no detail).
- `.claude/context/known-issues.md`: new KI-025 ("no ticket transitions a ride
  into `registration_open`").
- `docs/tasks.md`: check CR-019; check CR-059 (its remaining scope is now
  done — token mechanism was CR-011, the gate is this ticket).

## Acceptance criteria

- `POST /v1/rides/:id/publish`: no cookie → 401; non-existent id → 404
  `ride_not_found`; another organizer's ride → 404 `ride_not_found`;
  caller's own ride but `emailVerified: false` → 403
  `email_verification_required`; caller's own **verified**, non-draft ride →
  409 `ride_not_publishable`; caller's own verified draft ride → 200, `{
ride }` with `status: 'published'`, `updatedAt` bumped, `updatedBy` = caller
  (cross-checked against a direct DB read); mismatched `Origin` → 403 CSRF.
- Web: on `/organizer/rides/[id]/edit` for a draft ride, a "Опубликовать"
  button appears next to "Сохранить"; clicking it publishes, shows a success
  message, and the form immediately becomes read-only (status badge now
  "Опубликован"); for an organizer with an unverified email, the same
  guiding banner `OrganizerProfileForm` uses appears instead of a generic
  error; a non-draft ride shows no publish button (already read-only).
- `turbo run lint/typecheck/build/test` all green; `format:check`/
  `lint:root` clean.
- Live check: curl sequence (401/404×2/403-unverified/409-not-draft/200,
  cross-checked against a direct DB read) plus a real-browser walkthrough via
  `browser-automation` covering draft → publish → read-only confirmation.

## Planned files

- `packages/types/src/api/rides.ts` (+`PublishRideResponse`).
- `apps/api/src/modules/rides/{rides.service.ts,rides.routes.ts,
rides.routes.test.ts}` (extend).
- `apps/web/src/features/organizer/rides/{api.ts,
components/EditRideForm.tsx}` (extend).
- `packages/ui/src/terminology.ts` (+4 `RIDE_EDIT_TERMS` keys).
- `docs/api.md` (Rides section, the publish line).
- `.claude/context/known-issues.md` (+KI-025).
- `docs/tasks.md` (check CR-019, CR-059).

## Implementation progress

- [x] Plan written (this file)
- [x] `packages/types` addition
- [x] `apps/api` rides module (`POST /:id/publish`) + tests
- [x] `apps/web` feature (button + banner) + terminology
- [x] Full validation
- [x] Live check
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck lint test build` (all 25 tasks, run three times across
  the session — after implementation, after adding the 3 new `apps/web`
  tests, and once more after the live checks — against a real
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`,
  Docker Desktop still unavailable in this environment): all green every
  time. `apps/api` 80 tests (was 73, +7 in `rides.routes.test.ts`). `apps/web`
  59 tests (was 56, +3 in `rides.test.tsx` for the publish button/banner/
  non-draft-hides-button cases).
- `pnpm format:check`/`pnpm lint:root`: clean (one incidental one-line
  Prettier fix in `docs/tasks.md` — pre-existing drift unrelated to this
  session, picked up while checking off CR-019/CR-059 in the same file).
- Live check via curl against a real Postgres + running `apps/api`: full
  sequence — register/verify/login/create-organizer-profile/create-draft-ride,
  then `POST /v1/rides/:id/publish`: no cookie → 401; non-existent id → 404
  `ride_not_found`; a second registered organizer's own ride → 404
  `ride_not_found`; a third account with `emailVerified` flipped back to
  `false` directly in the DB → 403 `email_verification_required`; happy path
  → 200, cross-checked against a direct `SELECT` (`status`/`updated_by`/
  `updated_at` all correct); re-publishing the same now-`published` ride →
  409 `ride_not_publishable`; mismatched `Origin` → 403
  `csrf_origin_mismatch`.
- Live browser check via the `browser-automation` skill against a real `next
dev` server + the pre-existing `apps/api`: logged in as a seeded organizer,
  opened a draft ride's `/organizer/rides/[id]/edit`, confirmed the
  "Опубликовать" button next to "Сохранить", clicked it, confirmed (via a
  `page.waitForResponse` assertion, not just the visible text) the
  `POST .../publish` response was `200`, then confirmed the success message
  "Заезд опубликован.", the status badge flipping to "Опубликован", the
  "Редактировать можно только черновик заезда." notice appearing, and both
  the publish and save buttons disappearing — screenshot taken and visually
  confirmed to match. No console errors or failed requests during the actual
  check itself (earlier attempts in the same session did surface console
  errors, but those were traced to a self-inflicted environment issue, not
  the app — see Discovered issues). Test accounts/rides deleted from the
  scratch DB afterward.
- Every acceptance criterion from above is met.

## Discovered issues

Found and fixed during implementation/validation (not left open):

- Self-inflicted environment issue, not a product bug: running `turbo run
build` (which invokes `next build` for `apps/web`) against the same `.next`
  directory a `next dev` server already had open corrupted that dev server's
  served chunks (404s on `main-app.js`/`layout.css`/etc., a 500 on `/me`)
  until restarted. Confirmed by killing the stale process, clearing
  `apps/web/.next`, and starting a fresh `next dev`, which immediately
  resolved it — the browser check above was run against that fresh server.
  Not a new known issue (a local sequencing caveat for running both `turbo
build` and `next dev` against the same checkout, not a code defect), but
  worth recording here so a future session recognizes the symptom (stale
  chunk 404s, an unrelated-looking 500) immediately rather than re-diagnosing
  it as an app bug.
- A first attempt at the browser check also hit a real script bug (not a
  product bug): the very first page load after starting a fresh `next dev`
  takes long enough (~15-20s, first-hit route compilation) that a `click()`
  issued too early lands before React hydration attaches `onSubmit`, so the
  browser falls back to a native form submission (a same-page GET,
  `/login?`) instead of the app's own fetch-based login. Fixed in the check
  script by waiting for `networkidle` (plus a small buffer) after the initial
  page load before interacting, and by asserting on the actual
  `page.waitForResponse` for `/api/v1/auth/login`/`.../publish` rather than
  only on visible text — this would have silently misreported a real
  end-to-end pass. Not a product bug: `LoginForm`/`EditRideForm`'s own logic
  was never at fault (unit tests for both already cover their behavior
  in isolation), and once the timing was fixed the flow worked cleanly on the
  first real attempt.

New known issues opened: KI-025 (no ticket transitions a ride into
`registration_open`) and KI-026 (no verify-email web screen exists,
now blocking two organizer actions) — both `.claude/context/known-issues.md`.

## Final result

CR-019 ("Publish ride") complete, together with CR-059's remaining scope
(gating organizer publish on `emailVerified`, `.claude/rules/security.md`).
`POST /v1/rides/:id/publish`: `draft -> published` only, same ownership rules
as `GET`/`PATCH /v1/rides/:id` (404 `ride_not_found` either way), a new
caller-level `emailVerified` gate (403 `email_verification_required`, same
code `POST /v1/organizers/me` already uses), and a new lifecycle gate (409
`ride_not_publishable` for any non-draft status). `apps/web`'s
`/organizer/rides/[id]/edit` gained a "Опубликовать" button (draft-only, next
to Save) and the same email-verification guiding banner `OrganizerProfileForm`
already established. No `packages/db` migration — `published` already
existed in the `ride_status` enum since CR-017. Deliberately did not invent a
"minimum completeness" gate or a `registration_open` transition beyond what
the ticket's own name and the existing docs support — the latter gap is
flagged as new KI-025 rather than silently resolved. Also surfaced, and
deliberately did not fix inline (out of scope), a real and growing gap: no
`/verify-email` web screen exists anywhere in `apps/web`, so an organizer who
hits either email-verification gate has no in-app recovery path — new
KI-026. All acceptance criteria met; full validation suite green three times
across the session (25/25 tasks each time); live-verified end to end over
both curl (7 distinct response codes, one cross-checked against a direct DB
read) and a real browser session (draft → publish → read-only confirmation,
screenshot-verified). `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md`, `.claude/context/architecture-map.md`,
`.claude/context/known-issues.md`, `docs/api.md` all updated. Not yet
committed — `git diff`/`git status` reviewed next; pre-existing unrelated
pending changes (`docs/product.md`, `.mcp.json`, `skills-lock.json`) again
left untouched and out of scope.
