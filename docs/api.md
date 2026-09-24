# REST API Contract

Shape of the contract (versioning, pagination, errors) is fixed by `docs/decisions.md` →
ADR-011. Read that before adding an endpoint; this file lists the endpoints themselves.

## Versioning

All application endpoints are served under `/v1`. `/health` is intentionally outside the
versioned namespace — it is consumed by the deployment platform, not by product clients.

A backward-incompatible change introduces `/v2` for the affected endpoints and keeps `/v1`
alive until every client is migrated (`.claude/rules/extensibility.md`).

## Auth

POST `/v1/auth/register` — **implemented (CR-011)**. Body: `{ email, password }`
(`password` min 12 chars, `.claude/rules/security.md`). `201` →
`{ user: { id, email, emailVerified, createdAt }, verificationUrl? }` —
`verificationUrl` is present only outside production (real email delivery is
ADR-007, still Pending; see `docs/decisions.md`). `409 email_already_registered`
on a duplicate email (case-insensitive). Rate-limited (5/min/IP,
`.claude/context/known-issues.md` KI-022 for the interim-hardening caveats).

POST `/v1/auth/verify-email` — **implemented (CR-011)**. Body: `{ token }`.
`200` → `{ user }` with `emailVerified: true`. `400` with code
`invalid_verification_token` / `verification_token_already_used` /
`verification_token_expired` as appropriate — single-use, 24h expiry. Same
rate-limit tier as register.

POST `/v1/auth/login` — **implemented (CR-012)**. Body: `{ email, password }`.
`200` → `{ user }` + `Set-Cookie: session=<opaque token>` (httpOnly, `Secure`
in production only, `SameSite=Lax`, `Path=/`, 30-day rolling expiry —
ADR-013). `401 invalid_credentials` for both an unknown email and a wrong
password — identical body/status, no account enumeration
(`.claude/rules/security.md`). Does not require `emailVerified` (that gate is
organizer-action-specific, not a login precondition). Same rate-limit tier as
register.

POST `/v1/auth/logout` — **implemented (CR-012)**. Requires a valid session
cookie (`401` otherwise). Hard-deletes the `Session` row (ADR-013 — not a
soft-revoke), clears the cookie. `204`.

GET `/v1/auth/me` — **implemented (CR-012)**. Requires a valid session cookie
(`401` otherwise). `200` → `{ user }`. As of CR-013, `user` includes
`displayName`/`phone`/`bio` (all `null` until set via `PATCH /v1/users/me`) —
an additive field change, not a new endpoint (`.claude/rules/extensibility.md`).
CR-125 adds `firstName`/`lastName` the same additive way — the name shown in a
ride's riders/participants/waitlist lists in preference to `displayName` when
either is set.

POST `/v1/auth/forgot-password` — **implemented (CR-060)**. Body: `{ email }`.
Always `204` with no body, whether or not the email belongs to a real
account (`.claude/rules/security.md`: no account enumeration) — a real
account gets a new `password_reset_tokens` row (single-use, 30 min expiry);
an unknown one gets nothing, with an identical response either way. No dev
convenience field exists for this token (unlike `register`'s
`verificationUrl`) — exposing it even outside production would make the
response shape itself enumerable. Same rate-limit tier as register/login.

POST `/v1/auth/reset-password` — **implemented (CR-060)**. Body: `{ token,
password }` (`password` min 12 chars, same policy as register). `200` →
`{ user }`. `400` with code `invalid_reset_token` /
`reset_token_already_used` / `reset_token_expired` as appropriate. On
success: every other outstanding reset token for that user is invalidated
too, and every one of that user's sessions is revoked
(`.claude/rules/security.md` — a password change ends every existing
login); the caller is not automatically logged in and must `POST
/v1/auth/login` with the new password. Same rate-limit tier as
register/login.

## Users

PATCH `/v1/users/me` — **implemented (CR-013)**. Requires a valid session
cookie (`401` otherwise). Body: `{ displayName?, phone?, bio? }`, each
independently omittable (leaves the stored value unchanged) or `null`
(clears it) — `displayName` 1-80 chars, `phone` a loose 7-20 char format
check, `bio` ≤500 chars. `200` → `{ user }` (same shape as `GET /v1/auth/me`
— no separate `GET /v1/users/me`, `.claude/CLAUDE.md`: no duplicate
concepts). `400 validation_error` on an invalid field. `phone`/`bio` are
private — returned only to the profile's own owner; no endpoint exposes
another user's row yet (`.claude/rules/security.md`). CR-125 adds
`firstName?`/`lastName?` the same way, 1-60 chars each.

CR-126 additively extends the same body with `profileVisibility?` (`'closed'
| 'co_participants' | 'open'`, not nullable — the column defaults
`co_participants` and is never cleared to nothing) and `distanceWeekKm?`/
`distanceMonthKm?`/`distanceYearKm?` (nullable integers, self-reported —
`400 validation_error` outside 0-3000/0-10000/0-100000 respectively). See
"Rider profile" below for what these actually gate.

### Bikes (User)

CR-126 ("garage"): `me`-scoped CRUD, paginated list per ADR-011, same
ownership discipline as the avatar endpoints below.

GET `/v1/users/me/bikes` — **implemented (CR-126)**. Requires a valid session
cookie. Query: `limit?`/`cursor?`. `200` → `{ items: Bike[], nextCursor }`,
`Bike = { id, bikeType, brand, model, isActive }`.

POST `/v1/users/me/bikes` — Body: `{ bikeType, brand?, model?, isActive? }`.
`bikeType` is one of `'road' | 'gravel' | 'mtb'` — narrower than `Ride`'s own
`bicycleType` (which also has `'any'`, a ride requirement, not a real bike).
`201` → `{ bike }`. `409 bike_limit_reached` past 20 bikes.

PATCH `/v1/users/me/bikes/:bikeId` — same body shape, every field optional
(`brand`/`model` nullable to clear). `200` → `{ bike }`. `404
bike_not_found` for another account's bike or a nonexistent id.

DELETE `/v1/users/me/bikes/:bikeId` — `204`. `404 bike_not_found` as above.

`isActive: true` on either verb atomically deactivates whichever other bike
was active for that user (partial unique index, `docs/database.md`) — never
more than one active bike at a time.

### Avatar (User)

CR-097 (KI-023 remainder, ADR-019 point 7): reuses the same validate/resize/
storage pipeline `POST/PATCH/DELETE/GET /v1/rides/:id/cover` already
established (`apps/api/src/lib/image-processing.ts`/`image-storage.ts`,
relocated there from `modules/rides/` once a second and third caller
appeared) — same accepted types (JPEG/PNG/WebP, decoded not trusted), same 8
MB cap, same 1920×1920 resize bound, same metadata-stripping. Entirely
"me"-scoped, no `:id` variant here — there is still no `GET /v1/users/:id`
(`.claude/rules/security.md`: no endpoint exposes another user's row by a
bare user id). CR-126 adds a _ride-scoped_ avatar path for viewing another
participant's own avatar — see "Rider profile" below; it is a different
route entirely (keyed by ride + registration, access-gated), not a `:id`
variant of the routes in this section.

POST `/v1/users/me/avatar` — Requires a valid session cookie (`401`
otherwise). `multipart/form-data`, one file field named `file`. `400
avatar_missing`/`avatar_invalid`/`avatar_too_large`, `409
avatar_already_exists` (use `PATCH` to replace), `503
avatar_storage_unavailable`. `201` → `{ avatarUrl }`, always
`/v1/users/me/avatar`.

PATCH `/v1/users/me/avatar` — same rules as `POST`. `404 avatar_not_found`
if none exists yet. `200` → `{ avatarUrl }`; the old S3 object is deleted
best-effort after the DB row already points at the new one.

DELETE `/v1/users/me/avatar` — `404 avatar_not_found` if none exists.
`204` — DB row cleared first, S3 cleanup best-effort afterward.

GET `/v1/users/me/avatar` — authenticated, "me"-scoped (unlike the ride
cover/organizer avatar downloads below, this is never public). `404
avatar_not_found` if none exists. `200` → the raw image bytes.

## Organizers

POST `/v1/organizers/me` — **implemented (CR-014)**. Requires a valid session
cookie (`401` otherwise) and a verified email (`403
email_verification_required` otherwise — `.claude/rules/security.md`:
"Require a verified email before an account can act as an organizer"). Body:
`{ name, description? }` — `name` 1-100 chars, `description` ≤500 chars.
`201` → `{ organizerProfile }`. `409 organizer_profile_already_exists` if the
caller already has one (at most one `OrganizerProfile` per `User`, ADR-006).
`400 validation_error` on an invalid field.

GET `/v1/organizers/me` — **implemented (CR-014)**. Requires a valid session
cookie (`401` otherwise). `200` → `{ organizerProfile }`. `404
organizer_profile_not_found` if the caller has none yet.

PATCH `/v1/organizers/me` — **implemented (CR-014)**. Requires a valid session
cookie (`401` otherwise). `404 organizer_profile_not_found` if the caller has
none yet (create first via `POST`). Body: `{ name?, description? }`, each
independently omittable (leaves the stored value unchanged) — `description`
also accepts explicit `null` to clear it; `name` cannot be cleared (`NOT
NULL`). `200` → `{ organizerProfile }`. `400 validation_error` on an invalid
field.

CR-043 ("Organizer rating summary"): all three `/v1/organizers/me` responses above
additively carry `rating`/`reviewCount` siblings alongside `organizerProfile` — see
`## Reviews` below. CR-097 additively carries `avatarUrl` too (see "Avatar" below).

No public `GET /v1/organizers/:id` JSON endpoint exists, and none is planned
for just this — CR-023 ("Ride detail") embeds `{ id, name }` directly on `GET
/v1/rides/:id`'s response instead (`docs/product.md` Principle 2: "complete
ride record, not a link out"). A standalone public organizer-read endpoint
would only be added if something else genuinely needs to look up an
organizer independently of a ride. `GET /v1/organizers/:id/avatar` (below) is
the one exception — it serves raw image bytes, not a JSON organizer read, and
an organizer's `id`/`name` are already public via `RideOrganizerSummary`.

### Avatar (OrganizerProfile)

CR-097 (KI-023 remainder, ADR-019 point 7): same pipeline as the Users avatar
above and `.../rides/:id/cover`. Unlike the user avatar, mutations are
"me"-scoped but the download is keyed by `:id` and fully public (no session
consulted at all) — an `OrganizerProfile`'s identity, including a photo, is
already public via `RideOrganizerSummary` on every ride listing, so there is
no viewer-visibility check to make the way a `Ride`'s draft-gated cover needs.

POST `/v1/organizers/me/avatar` — Requires a valid session cookie (`401`
otherwise) and an existing `OrganizerProfile` (`404
organizer_profile_not_found` otherwise — create one first via `POST
/v1/organizers/me`). Same file/size/type rules as the ride cover image.
`409 avatar_already_exists` (use `PATCH`). `201` → `{ avatarUrl }`,
`/v1/organizers/:id/avatar`.

PATCH `/v1/organizers/me/avatar` — same rules as `POST`. `404
avatar_not_found` if none exists yet. `200` → `{ avatarUrl }`.

DELETE `/v1/organizers/me/avatar` — `404 avatar_not_found` if none exists.
`204`.

GET `/v1/organizers/:id/avatar` — public, no session required. `404
avatar_not_found` for a non-existent organizer id or one with no avatar
uploaded (same 404 either way — organizer ids are already public, so there
is nothing to protect by distinguishing the two). `200` → the raw image
bytes.

## Rides

POST `/v1/rides` — **implemented (CR-017)**. Requires a valid session cookie
(`401` otherwise) and an existing `OrganizerProfile` (`403
organizer_profile_required` otherwise — mirrors `POST /v1/organizers/me`'s
`email_verification_required` gate/UX; not the same check as CR-016
"Organizer authorization", which is about an _existing_ ride's ownership on a
later mutation). Body: `{ title, bicycleType, startsAt, startTimezone }` —
only what a minimal, valid draft needs (`.claude/context/current-task.md`);
`title` 1-140 chars, `bicycleType` one of `road`/`gravel`/`mtb`/`any`,
`startsAt` an ISO 8601 instant, `startTimezone` any IANA zone identifier.
`201` → `{ ride }` with `status: 'draft'`, `organizerId` set to the caller's
own profile, `updatedBy` set to the caller, and every other field `null`.
`400 validation_error` on an invalid field.

GET `/v1/rides` — **implemented (CR-024, public discovery; extended CR-025,
"Filters"; extended CR-026, "Map discovery")**. No session cookie ever
required or consulted — fully public. Every ride whose status has left
`draft` (`published`/`registration_open`/`registration_closed`/`started`/
`finished`/`cancelled` — same "published+" rule `GET /v1/rides/:id` uses)
**and** whose `startsAt` has not yet passed — a ride that has already
started/finished, or a past-dated cancelled one, no longer appears here at
all (CR-025, resolves KI-029), though it stays reachable directly at
`/rides/:id`. Optional `?bicycleType=` narrows to one of
`road`/`gravel`/`mtb`/`any`; omitted returns every type. Optional map-viewport
filter (CR-026, ADR-014): `?bboxNorth=&bboxSouth=&bboxEast=&bboxWest=` (all
four required together — a partial bbox is `400 validation_error`) narrows to
rides whose `startLat`/`startLng` fall inside the box; a ride with no
coordinates never appears in a bbox-filtered result (it still appears in the
plain, unfiltered list — `.claude/rules/resilience.md`). Each item carries
`organizer: { id, name }` (same embed as the single-ride response).
Cursor-paginated per ADR-011, sorted `(startsAt asc, id asc)` — soonest-first,
distinct from `/mine`'s `(createdAt desc, id desc)`. A malformed `cursor` →
`400 invalid_cursor`. **CR-116** (discovery cards) — additive item fields
(`PublicRideListItem`, this endpoint only; `GET /v1/registrations/mine` keeps plain
`PublicRide`): `registrationsCount` (active registrations), `startLabel` (label of the
ride's oldest `start` route point, `null` if none/unlabelled), `routePreview` (the
stored route geometry as at most 40 `[lat, lng]` pairs, 5 decimals — stride-sampled to
≤200 points in SQL, then Douglas–Peucker by point budget; `null` without a route; for a
card sketch, never navigation), `groups` (`[{ name, paceKmh }]` in `position` order,
`[]` without groups). Computed with four batched queries per page, never per row.

GET `/v1/rides/mine` — **implemented (CR-088)**. Requires a valid session cookie
(`401` otherwise). Every ride owned by the caller, any status — distinct from the
above; no `OrganizerProfile` yet is `200 { items: [], nextCursor: null }`, not an
error. Cursor-paginated per ADR-011 (`apps/api/src/lib/cursor.ts`), sorted
`(createdAt desc, id desc)`. A malformed `cursor` → `400 invalid_cursor`.

GET `/v1/rides/mine/summary` — **implemented (CR-103, organizer dashboard
glanceability)**. Requires a valid session cookie (`401` otherwise). A single-resource
aggregate, not a page — no `nextCursor` (ADR-011 only requires pagination for
collections). `200` → `{ summary: { totalRides, draftRides,
openRegistrationRides, activeRegistrations, waitlisted } }`, counted across every
ride the caller organizes (`activeRegistrations`/`waitlisted` sum across all of them,
not per-ride). No `OrganizerProfile` yet is an all-zero summary, not an error, same
precedent as `/mine` above.

GET `/v1/rides/:id` — **implemented (CR-016/CR-018, extended CR-023 "Ride
detail")**. No session cookie required — a session, if present and valid, is
resolved but never rejected (`resolveOptionalUser`, distinct from every other
`/v1/rides` route's `requireAuth`). Visibility: the ride's own organizer sees
it at any status; anyone else (including no session at all) sees it unless
it's still `draft` — `404 ride_not_found` both when the id doesn't exist at
all and when a non-owner requests a `draft` (deliberately the same response
either way — resource-enumeration reasoning, see `.claude/rules/security.md`).
`200` → `{ ride, organizer: { id, name } }` — `organizer` is additive (CR-023)
alongside the unchanged `ride` field. `route` is a second additive field
(CR-027, `RouteSummary | null` — `id`/`gpxFileName`/`gpxFileSizeBytes`/
`distanceKm`/`elevationGainMeters`/`pointCount`/`createdAt`/`updatedAt`, no
`geometry` array; `null` until a GPX is uploaded).

PATCH `/v1/rides/:id` — **implemented (CR-016/CR-018, "Edit draft"; extended
CR-026, "Map discovery")**. Same 401/404 rules as `GET`. Draft-only: `409
ride_not_editable` once the ride has left `draft` (publishing/cancelling/
finishing are separate tickets below, not a broader "edit anything anytime"
endpoint). Body: any subset of `title`, `description`, `bicycleType`,
`startsAt`+`startTimezone` (must arrive together or not at all),
`startLat`+`startLng` (CR-026, ADR-014: must arrive together or not at all,
each `null` to clear; `startLat` in `[-90, 90]`, `startLng` in
`[-180, 180]`), `participantLimit`, `priceRub`, `distanceKm`,
`elevationGainMeters`, `paceKmh`, `durationMinutes`, `difficulty` — every
field CR-017 left `null` at creation — plus `participantsVisible` (CR-125, not
nullable, default `true`; toggles `GET /v1/rides/:id/riders` for the whole
ride, same draft-only gate as every other field here). `coverImageUrl` stays
out — it is
computed, not settable, from the dedicated `.../cover` endpoints below
(ADR-019/CR-086); `startLat`/`startLng` are entered manually —
no geocode-by-address UI exists yet (KI-016). `200` → `{ ride }` with the
updated fields, `400 validation_error` on an invalid field.

POST `/v1/rides/:id/publish` — **implemented (CR-019)**. Requires a valid session
cookie (`401` otherwise) and ownership of the ride: `404 ride_not_found` both when the
id doesn't exist and when it belongs to a different organizer (same rule as `GET`/
`PATCH`). Also requires `emailVerified` on the caller's account (403
`email_verification_required`, fresh DB read — `.claude/rules/security.md`: "Require a
verified email before an account can act as an organizer (publish a ride)"; same code
`POST /v1/organizers/me` already uses). Draft-only: `409 ride_not_publishable` for any
non-`draft` status. `200` → `{ ride }` with `status: 'published'`. No request body.
`draft → published` only — opening registration is a separate endpoint below
(KI-025, resolved by CR-089).

POST `/v1/rides/:id/open-registration` — **implemented (CR-089)**. Same
401/404-ownership rule as `publish`. No `emailVerified` gate (only publish names that
trigger in `.claude/rules/security.md`, and there is no de-verification flow that could
affect an already-published ride). Published-only: `409
ride_registration_not_openable` for any other status. `200` → `{ ride }` with
`status: 'registration_open'`. No request body. `published → registration_open` only.

POST `/v1/rides/:id/close-registration` — **implemented (CR-020)**. Same
401/404-ownership rule as `publish`/`open-registration`, no `emailVerified` gate.
`registration_open`-only: `409 ride_registration_not_closable` for any other status.
`200` → `{ ride }` with `status: 'registration_closed'`. No request body.

POST `/v1/rides/:id/cancel` — **implemented (CR-021)**. Same 401/404-ownership
rule as `publish`/`open-registration`/`close-registration`, no `emailVerified`
gate. Three valid source statuses (`docs/product.md`'s Lifecycle): `published`,
`registration_open`, `registration_closed` — `409 ride_not_cancellable` for any
other status (`draft`/`started`/`finished`/already-`cancelled`). `200` →
`{ ride }` with `status: 'cancelled'`. No request body.

POST `/v1/rides/:id/start` — **implemented (CR-090)**. Same 401/404-ownership
rule as every other transition, no `emailVerified` gate.
`registration_closed`-only: `409 ride_not_startable` for any other status.
`200` → `{ ride }` with `status: 'started'`. No request body.

POST `/v1/rides/:id/finish` — **implemented (CR-022)**. Same 401/404-ownership
rule as every other transition, no `emailVerified` gate. `started`-only: `409
ride_not_finishable` for any other status. `200` → `{ ride }` with
`status: 'finished'` — the terminal, non-cancelled end of the lifecycle. No
request body.

### Pace groups (CR-117, ADR-022)

A ride can have up to 6 pace groups (`RideGroup`: `id`/`rideId`/`name`/`paceKmh`/
`description`/`position`/`createdAt`/`updatedAt`/`updatedBy`). All four endpoints
require a session (`401`) and ownership — `404 ride_not_found` for a non-existent ride
or someone else's, same resource-enumeration-safe rule as every organizer endpoint.
Unlike stops/route points (draft-only), groups are editable in every status except
`finished`/`cancelled` → `409 ride_groups_not_editable` (organizers adjust groups after
publishing). Mutations lock the `rides` row, the same lock registration uses.

GET `/v1/rides/:id/groups` — organizer-only, any status. `200` → `{ items: (RideGroup &
{ registrationsCount })[], nextCursor }`, `position` order, paginated per ADR-011
(`400 invalid_cursor`).

POST `/v1/rides/:id/groups` — body `{ name, paceKmh, description? }`: `name` trimmed,
1–60 chars (the client suggests «Группа N»; the API never invents one), `paceKmh` 5–60,
`description` ≤500 or `null`. Appended at the end (`position` server-assigned). `201` →
`{ group }`. `409 group_limit_reached` past 6, `409 group_name_taken` for a
case-insensitive duplicate name within the ride, `400 validation_error`.

PATCH `/v1/rides/:id/groups/:groupId` — any subset of `name`/`paceKmh`/`description`/
`position` (0–5). `position` moves the group to that slot and shifts the others; a
value past the last slot is clamped to the end (reordering is deliberately this one
field, no separate reorder endpoint). `200` → `{ group }`. `404 group_not_found` for an
unknown group or another ride's, `409 group_name_taken`.

DELETE `/v1/rides/:id/groups/:groupId` — `204`. `409 group_has_registrations` while an
active registration or a waiting waitlist entry points at the group (move them first —
`PATCH .../register`); cancelled/promoted history rows lose their `groupId` instead.
Remaining groups are renumbered.

`GET /v1/rides/:id` gains `groups: [{ id, name, paceKmh, description, position,
registrationsCount }]` (public, `position` order, `[]` without groups);
`viewerRegistration.groupId`/`viewerWaitlistEntry.groupId` say which one the caller
chose.

## Registration

POST `/v1/rides/:id/register` — **implemented (CR-032, "Register")**. Requires a valid
session cookie (`401 unauthorized` otherwise) — any authenticated user, not just the
ride's organizer (every user is implicitly a participant, ADR-006). Same
resource-enumeration-safe visibility rule as `GET /v1/rides/:id`: `404 ride_not_found`
for a non-existent ride _or_ someone else's still-`draft` one. `409
ride_registration_not_open` for any other status (a ride is only registrable while
`registration_open`). `409 ride_full` once active registrations reach
`participantLimit` (no auto-waitlist — joining the queue is a separate, explicit
action, `POST .../waitlist` below). Bundles
CR-034 ("Capacity enforcement") and CR-035 ("Duplicate protection"): a single
`SELECT ... FOR UPDATE` on the `rides` row inside the transaction serializes every
concurrent registration attempt for the same ride, making the duplicate check, the
capacity check, and double-submit protection all race-free at once
(`apps/api/src/modules/registrations/registrations.service.ts`). No request body.
`201` → `{ registration }` (`Registration`: `id`/`rideId`/`userId`/`status`/
`createdAt`/`updatedAt`/`cancelledAt`) on a fresh registration. **Idempotent (CR-083)**:
a repeat call while the caller already has an active registration for this ride —
most commonly a network retry of a call that actually succeeded — returns `200` with
that same existing `registration` instead of an error or a second row; no duplicate
`registration_confirmed` notification fires either.

**CR-117 (pace groups)**: optional body `{ groupId }` (no body at all stays valid).
Once the ride has any group, `groupId` is required — `422 group_required`; it must be
one of _this_ ride's groups — `422 group_not_found` (also for any `groupId` on a ride
without groups; the composite FK is the DB backstop). Checked inside the same locked
transaction, after the idempotent-replay return and before capacity; capacity stays
ride-level. An idempotent replay returns the existing registration unchanged even with
a different `groupId`. `Registration` gained `groupId` (nullable).

PATCH `/v1/rides/:id/register` — **implemented (CR-117)**. The caller moves their own
active registration to another group of the same ride: body `{ groupId }` (required
uuid). `200` → `{ registration }`. `401` without a session, `404
registration_not_found` without an active registration (non-existent ride included),
`409 group_change_not_allowed` once the ride is `finished`/`cancelled`, `422
group_not_found` for a group that isn't this ride's. Same `rides` row lock as register/
cancel, so it cannot race a group delete.

DELETE `/v1/rides/:id/register` — **implemented (CR-033, "Cancel registration")**.
Same auth requirement as `POST`. `404 registration_not_found` if the caller has no
active registration for this ride (covers a non-existent ride the same way — no
separate ride-existence check). No status gate beyond "an active registration
exists" — cancellation stays available even after the organizer closes registration.
Sets `status: 'cancelled'` + `cancelledAt`, does not delete the row (audit trail); a
later re-registration is a fresh row. `204`, no body.

GET `/v1/rides/:id` (CR-016/CR-018/CR-023) gained two additive fields alongside
`route`/`stops`/`routePoints`: `registrationsCount` (active registrations for this
ride) and `viewerRegistration` (the caller's own active registration, `null` if none
or unauthenticated). CR-036 ("Waitlist") added a third: `viewerWaitlistEntry` (the
caller's own `waiting` queue entry, `null` if none/unauthenticated/promoted/
cancelled). CR-042 ("Review") added a fourth: `viewerReview` (the caller's own
review for this ride, `null` if none/unauthenticated — see `## Reviews` below).

POST `/v1/rides/:id/waitlist` — **implemented (CR-036, "Waitlist")**. Same auth
requirement and resource-enumeration-safe `404 ride_not_found` as `POST .../register`.
`409 ride_registration_not_open` for any status other than `registration_open`. `409
registration_already_exists` if the caller already has an active registration for
this ride (a genuine conflict — register/cancel instead, not a retry of this call).
`409 ride_not_full` if the ride still has an open spot, or has no `participantLimit`
at all — call `POST .../register` instead of joining a queue for a spot that isn't
scarce. Re-derives capacity itself inside the same `SELECT ... FOR UPDATE` lock
`POST .../register` uses, rather than trusting a stale `409 ride_full` the client
might be reacting to. **Idempotent (CR-083)**: a repeat call while the caller already
has a `waiting` entry for this ride returns `200` with that same existing
`waitlistEntry` instead of `409 waitlist_entry_already_exists`.
`201` → `{ waitlistEntry }` (`WaitlistEntry`: `id`/`rideId`/`userId`/`status`/
`createdAt`/`updatedAt`/`cancelledAt`/`promotedAt`). No request body — **CR-117**: the
same optional `{ groupId }` body and group rules as `POST .../register`
(`WaitlistEntry.groupId`); a promotion carries the entry's group into the new
registration.

DELETE `/v1/rides/:id/waitlist` — **implemented (CR-036, "Waitlist")**. Same auth
requirement as `POST`. `404 waitlist_entry_not_found` if the caller has no `waiting`
entry for this ride. No status gate beyond "a waiting entry exists" — same "stays
available even after the organizer closes registration" discipline as
`DELETE .../register`. Sets `status: 'cancelled'` + `cancelledAt`, does not delete the
row. `204`, no body.

**Auto-promotion**: `DELETE /v1/rides/:id/register` (cancellation) now also promotes
the oldest `waiting` entry (FIFO, by `createdAt`) for that ride — if one exists — into
a brand-new active `Registration`, inside the same transaction/row lock as the
cancellation itself. The promoted `WaitlistEntry` is marked `status: 'promoted'` +
`promotedAt` (terminal, kept as a row). This is not a separate endpoint; it is a side
effect of cancellation, invisible to the cancelling caller's own response.

GET `/v1/rides/:id/participants` — **implemented (CR-037, "Organizer participant
list")**. Organizer-only, at any ride status (not draft-only): `401 unauthorized` with
no session, `404 ride_not_found` for a non-existent ride or one that isn't the
caller's (same resource-enumeration-safe rule every other organizer-only endpoint
uses). Active registrations only, `createdAt asc` (registration order). Own response
shape, not `Registration` — deliberately minimal (`.claude/rules/security.md`
"protect participant contact... information"): `200` → `{ items:
RideParticipantSummary[], nextCursor }`, each item `{ id, userId, displayName,
createdAt }` — no phone/email. Collection, paginated per ADR-011 (`?limit=`/
`?cursor=`, `400 invalid_cursor` for a malformed one) — no "load more" UI consumes it
yet, same precedent `GET /v1/rides/mine`'s screen already set.

**CR-117**: each item gains `group: { id, name, paceKmh } | null` (additive; also on
`GET .../waitlist` below, which shares the item shape). **CR-125**: `displayName` here
is computed the same way as `GET .../riders` below —
`"{firstName} {lastName}"` when either is set, else the free-text `displayName`.

GET `/v1/rides/:id/riders` — **implemented (CR-117)**. Who is riding, for any
**signed-in** user: `401` without a session (anonymous visitors see only `GET
/v1/rides/:id`'s `registrationsCount`). Same visibility as `GET /v1/rides/:id` — `404
ride_not_found` for a non-existent ride or someone else's `draft`. Active registrations,
`createdAt asc`, paginated per ADR-011 (`400 invalid_cursor`). `200` → `{ items: [{
registrationId, displayName, group: { id, name, paceKmh } | null }], nextCursor }` —
deliberately no user id, email, phone or emergency data (`.claude/rules/security.md`),
and the response schema itself strips anything else. Rationale for "signed-in only":
seeing who else rides is part of deciding to join, but a name list of people attending
a dated, located event should not be scrapeable anonymously; a signed-in account is the
minimum accountability for viewing it (product owner decision, CR-115…120 brief).
`displayName` is `null` when the participant never set one; **CR-125**: this field is
now `"{firstName} {lastName}"` when either is set on the user, falling back to the
free-text `displayName` column, then `null`. **CR-126**: `registrationId` (previously
omitted entirely — "the opaque cursor encodes a registration id; it grants nothing on
its own" was true before this ticket) is now returned per item — it is not a user id,
and the only thing it unlocks is the access-gated "Rider profile" endpoints just below,
themselves gated by the profile owner's own `profileVisibility` setting.

**CR-125**: `403 riders_hidden` for every caller (including the ride's own organizer —
use `GET .../participants` instead) when the organizer has set
`Ride.participantsVisible` to `false`. `GET /v1/rides/:id`'s `registrationsCount` is
unaffected — only this named list is gated. Checked after the existing 401/404 rules
above, so a non-existent/someone-else's-draft ride still 404s first.

### Rider profile

CR-126: a participant's card, reached only through a `registrationId` from the
`/riders` list above — never a bare `GET /v1/users/:id` (`.claude/context/
project-state.md`'s standing constraint; `known-issues-archive.md`'s KI-059).
Both routes below share one access check, `resolveRiderAccess`
(`apps/api/src/modules/registrations/registrations.service.ts`): `401` without a
session; `403 riders_hidden` if the organizer turned off the riders list (same rule
as `/riders` itself — checked first); `404 rider_not_found` for a `registrationId`
that isn't an active rider of this ride; otherwise access is granted when the viewer
is the profile's own owner, the ride's organizer, `profileVisibility: 'open'`, or
`profileVisibility: 'co_participants'` **and** the viewer has their own active
registration on this same ride — sharing this one ride is sufficient evidence of
"co-participant", no search of the viewer's whole ride history. Anything else is
`403 profile_private`.

GET `/v1/rides/:id/riders/:registrationId/profile` — `200` → `{ profile: {
registrationId, displayName, bio, avatarUrl, bikes: Bike[], distanceWeekKm,
distanceMonthKm, distanceYearKm, recentRides: [{ id, title, startsAt }] } }`. Never
`phone`/`email` — the query behind this route doesn't even select them, regardless
of `profileVisibility` (`.claude/rules/security.md`). `recentRides` is up to 5, most
recent first: other rides with an active registration for this user, `status:
'finished'`, and that ride's own `participantsVisible` true — reusing that existing
flag as the one visibility rule here too, rather than a second concept.

GET `/v1/rides/:id/riders/:registrationId/avatar` — the raw image bytes behind that
`avatarUrl`, same `Cache-Control: private, max-age=31536000, immutable` as
`/v1/users/me/avatar`. Same access gate as the profile route above; `404
avatar_not_found` if the rider has no avatar set.

GET `/v1/rides/:id/waitlist` — **implemented (CR-037)**. Adds a `GET` to the existing
`POST`/`DELETE /v1/rides/:id/waitlist` path — the organizer's collection view of the
same resource. Same auth/ownership/pagination rules as `GET .../participants`.
`waiting` entries only, `createdAt asc` — exact FIFO order, the same order
`DELETE .../register`'s auto-promotion already promotes by. Same
`RideParticipantSummary` item shape (reused as-is — the fields needed are identical,
only the underlying filter differs).

GET `/v1/registrations/mine` — **implemented (CR-091, "My registrations")**. Requires
a valid session cookie (`401` otherwise). Own prefix, not nested under `/rides` — this
list has no single-ride parent, and `/v1/rides/mine` is already the organizer's
own-rides list (CR-088). The caller's own **active** registrations only (a cancelled
one is not "a ride you're registered for" any more, same filter
`GET .../participants`/`.../waitlist` already use), each joined with its ride's
public+organizer summary. `400` if `when` is missing/invalid — required, one of
`upcoming` (`ride.startsAt >= now()`, ordered `startsAt asc`, soonest first) or `past`
(`ride.startsAt < now()`, ordered `startsAt desc`, most recent past first); two
independently cursor-paginated tabs, not one page split client-side. Waitlist entries
are out of scope (still visible on the specific ride's `/rides/[id]` page). `200` →
`{ items: MyRegistrationSummary[], nextCursor }`, each item `{ registration: Registration,
ride: PublicRide }` — reuses both existing shapes, no third one invented. Collection,
paginated per ADR-011 (`?limit=`/`?cursor=`, `400 invalid_cursor` for a malformed
one).

## Route

POST `/v1/rides/:id/route` — **implemented (CR-027, "GPX upload")**. Requires a valid
session cookie (`401` otherwise) and ownership of the ride: `404 ride_not_found` both
when the id doesn't exist and when it belongs to a different organizer (same rule as
`GET`/`PATCH /v1/rides/:id`). Draft-only: `409 ride_not_editable` once the ride has
left `draft` (same code/meaning `PATCH` uses). `multipart/form-data`, not JSON — one
file field named `file`, a `.gpx` track. `400 gpx_file_missing` if no file part is
sent, `400 gpx_file_too_large` past ADR-015's 10 MB cap, `400 gpx_invalid` if the file
isn't well-formed GPX with at least one `trk/trkseg/trkpt`. `409 route_already_exists`
if the ride already has a route (use `PATCH` to replace it). `503
route_storage_unavailable` (RFC 9457, degraded state per `.claude/rules/
resilience.md`) if the S3-compatible object store is unreachable or unconfigured
(KI-015 — never live-verified against a real MinIO in this environment). `201` →
`{ route }` (`RouteSummary`: `id`/`rideId`/`gpxFileName`/`gpxFileSizeBytes`/
`distanceKm`/`elevationGainMeters`/`pointCount`/`createdAt`/`updatedAt`) — distance/
elevation gain are computed from the GPX itself (haversine sum / positive-elevation-
delta sum), independent from `Ride.distanceKm`/`elevationGainMeters`'s
organizer-entered values. CR-029 ("Route metadata", resolves KI-034): in the same DB
transaction as the route insert, whichever of `Ride.distanceKm`/`elevationGainMeters`
is still `null` gets auto-filled from these computed values — independently per
field, and only on this first upload; an already-entered value is never overwritten,
and `PATCH .../route` (replace) never touches `Ride`'s fields either way.

PATCH `/v1/rides/:id/route` — **implemented (CR-027)**. Same auth/ownership/draft-only
rules and request shape as `POST`. `404 route_not_found` if the ride has no route yet
(use `POST` instead). `200` → `{ route }`, replacing the file and recomputed metrics —
the old S3 object is deleted best-effort, after the DB row already points at the new
one.

DELETE `/v1/rides/:id/route` — **implemented (CR-027)**. Same auth/ownership/
draft-only rules. `404 route_not_found` if none exists. `204` — the DB row is deleted
first; the S3 object is deleted best-effort afterward (never blocks the response).

POST `/v1/rides/:id/route/build` — **implemented (CR-114, "Route builder")**. Same
auth/ownership/draft-only rules as `POST .../route`. JSON body `{ points: { lat, lng }[] }`
(2–25, ordered). Routes the waypoints along 2GIS's road graph (bicycle profile,
altitudes requested) and stores the result as the ride's route — creating it, or
replacing an existing one (uploaded or built). The line is stored exactly like an
uploaded track: serialized to GPX (`route-2gis.gpx`, so `.../download` works), measured
by the same parser, same ride auto-fill rule on create (elevation only when 2GIS returned
altitudes). `200` → `{ route }`. `422 route_not_buildable` when 2GIS has no road path
between the points (nothing is stored — the API never substitutes straight lines between
waypoints); `503 route_builder_unavailable` when no `MAPS_2GIS_API_KEY` is configured or
2GIS is unreachable; `503 route_storage_unavailable` as for upload. Rate limit: 30/min
per IP (every call is a billed 2GIS request).

GET `/v1/rides/:id/route/download` — **implemented (CR-027)**. Not in the original
contract sketch — added to fulfill `docs/product.md`'s "route (including a
downloadable track)" promise (same "product spec requires it, add the endpoint"
reasoning as KI-024/KI-025/KI-027). Same viewer-visibility rule as `GET
/v1/rides/:id` (`resolveOptionalUser`: the ride's owner always, anyone else only once
the ride has left `draft`). `404 route_not_found` if the ride has no route. `200` →
the raw GPX bytes, `Content-Type: application/gpx+xml`,
`Content-Disposition: attachment; filename="<original filename>"`. `503
route_storage_unavailable` on a storage failure, same as `POST`/`PATCH`.

GET `/v1/rides/:id/route/geometry` — **implemented (CR-028, "Route rendering")**.
Resolves KI-035. Same viewer-visibility rule as `.../download` (`resolveOptionalUser`:
the ride's owner always, anyone else only once the ride has left `draft`). `404
route_not_found` if the ride has no route. `200` → `{ points }`
(`RouteGeometryPoint[]`: `lat`/`lng`/`elevationMeters` — the full ordered track,
separate from `GET /v1/rides/:id`'s `route` summary field, which deliberately has no
`geometry`). No S3 call — the geometry is already in the `routes` row from `POST/PATCH
.../route`, so there is no `route_storage_unavailable` case here.

## Cover image

POST `/v1/rides/:id/cover` — **implemented (CR-086, ADR-019)**. Same
auth/ownership/draft-only rules as `POST .../route` (`resolveOwnDraftRide`):
`404 ride_not_found` if the ride doesn't exist or isn't the caller's, `409
ride_not_editable` once it has left `draft`. `multipart/form-data`, one file
field named `file`. Accepted types: JPEG/PNG/WebP, verified by actually
decoding the file with `sharp` — never trusted from the client
`Content-Type` (`.claude/rules/security.md`); SVG is explicitly excluded
(script-in-SVG XSS risk). `400 cover_image_missing` if no file part is sent,
`400 cover_image_too_large` past an 8 MB raw-upload cap (smaller than GPX's
10 MB, `@fastify/multipart`'s per-call `limits.fileSize`), `400
cover_image_invalid` if `sharp` can't decode it as one of the accepted
types. `409 cover_image_already_exists` if the ride already has a cover
image (use `PATCH` to replace it). The image is resized to a 1920×1920 max
(`fit: 'inside'`, no upscaling), EXIF orientation baked in via `.rotate()`,
then remaining metadata (including any GPS EXIF) stripped — original format
preserved, no forced re-encode. `503 cover_storage_unavailable` if the
S3-compatible object store is unreachable or unconfigured. `201` →
`{ coverImageUrl }` — always the same computed path,
`/v1/rides/:id/cover`, never a direct S3 URL (the bucket stays fully
private — same reasoning as `.../route/download`).

PATCH `/v1/rides/:id/cover` — **implemented (CR-086)**. Same auth/ownership/
draft-only/validation rules and request shape as `POST`. `404
cover_image_not_found` if the ride has no cover image yet (use `POST`
instead). `200` → `{ coverImageUrl }`, replacing the stored image — the old
S3 object is deleted best-effort, only after the DB row already points at
the new one (`.claude/rules/resilience.md`: the DB row is the source of
truth).

DELETE `/v1/rides/:id/cover` — **implemented (CR-086)**. Same
auth/ownership/draft-only rules. `404 cover_image_not_found` if none
exists. `204` — the DB row is cleared first; the S3 object is deleted
best-effort afterward (never blocks the response).

GET `/v1/rides/:id/cover` — **implemented (CR-086)**. Same viewer-visibility
rule as `GET /v1/rides/:id`/`.../route/download` (`resolveOptionalUser`:
the ride's owner always, anyone else only once the ride has left `draft`).
`404 ride_not_found` for a non-existent/someone-else's-draft ride (same
resource-enumeration-safe rule as every other viewer-facing endpoint), `404
cover_image_not_found` if the ride has no cover image. `200` → the raw
image bytes, `Content-Type` matching the stored, `sharp`-verified format.
`503 cover_storage_unavailable` on a storage failure, same as
`POST`/`PATCH`. Deliberately a proxy, not a redirect to a direct S3 URL —
`next.config.ts` needs no `images.remotePatterns` entry as a result
(relative, same-origin path).

`GET /v1/rides/:id`'s `coverImageUrl` field (present since CR-017, always
`null` until this ticket) is now real once a cover image exists — computed
from `rides.cover_image_key` at response time, not stored as a URL
directly (`docs/database.md`'s Rides table).

POST `/v1/rides/:id/stops` — **implemented (CR-030, "Stops")**. Same
auth/ownership/draft-only rules as `POST .../route` (`resolveOwnDraftRide`): `404
ride_not_found` if the ride doesn't exist or isn't the caller's, `409
ride_not_editable` once it has left `draft`. Body: `{ name, description?, lat, lng,
durationMinutes? }` — `lat`/`lng` are required (unlike `Ride.startLat/startLng`, a
stop's whole reason for existing is a location). `position` is never in the request —
server-assigned as the current stop count for the ride (appended at the end); no
reorder support in this ticket. `201` → `{ stop }`.

PATCH `/v1/rides/:id/stops/:stopId` — **implemented (CR-030)**. Same draft-only gate.
Any subset of `name`/`description`/`lat`/`lng`/`durationMinutes` — `position` cannot be
changed via this endpoint. `404 stop_not_found` if the id doesn't exist or belongs to a
different ride (checked after the ride-level ownership/draft gate — same
resource-enumeration-safe shape as `ride_not_found`). `200` → `{ stop }`.

DELETE `/v1/rides/:id/stops/:stopId` — **implemented (CR-030)**. Same draft-only gate;
`404 stop_not_found` as above. `204` on success. Does not renumber the remaining
stops' `position` values — a gap in the sequence is harmless for display.

`GET /v1/rides/:id`'s response gained an additive `stops: Stop[]` field (CR-030),
ordered by `position` — same "no separate read endpoint, embed it in the ride detail
response" precedent as `route` (CR-027). Same viewer-visibility rule as the rest of
that response.

POST `/v1/rides/:id/route-points` — **implemented (CR-031, "Route points")**. Not in
an earlier contract sketch — designed this session by close analogy to `POST
.../stops`. Same auth/ownership/draft-only rules (`resolveOwnDraftRide`): `404
ride_not_found` if the ride doesn't exist or isn't the caller's, `409
ride_not_editable` once it has left `draft`. Body: `{ type, label?, description?,
lat, lng }` — `type` is one of `start`/`finish`/`stop`/`danger`/`water`/`food`/
`technical`/`other` (`docs/database.md`'s list); `lat`/`lng` are required, same
reasoning as `Stop`. Unlike `POST .../stops`, no server-assigned `position` — a route
point is a typed map pin, not an ordered itinerary entry, so more than one marker of
the same `type` is allowed (e.g. two `water` points). `201` → `{ routePoint }`.

PATCH `/v1/rides/:id/route-points/:routePointId` — **implemented (CR-031)**. Same
draft-only gate. Any subset of `type`/`label`/`description`/`lat`/`lng`. `404
route_point_not_found` if the id doesn't exist or belongs to a different ride (same
resource-enumeration-safe shape as `stop_not_found`). `200` → `{ routePoint }`.

DELETE `/v1/rides/:id/route-points/:routePointId` — **implemented (CR-031)**. Same
draft-only gate; `404 route_point_not_found` as above. `204` on success.

`GET /v1/rides/:id`'s response gained an additive `routePoints: RoutePoint[]` field
(CR-031), ordered by `createdAt` (a route point has no `position` — order isn't
meaningful for typed map pins) — same embedding precedent as `stops`/`route`. Same
viewer-visibility rule as the rest of that response. No participant-facing UI reads
this array yet — see `docs/database.md`'s `RoutePoint` entry and KI-036.

## Updates

POST `/v1/rides/:id/updates` — **implemented (CR-039, "Ride updates")**. Requires a
valid session cookie (`401` otherwise) and organizer ownership of the ride: `404
ride_not_found` both when the id doesn't exist and when it belongs to a different
organizer (same rule as `GET /v1/rides/:id/participants`). No ride-status gate
beyond ownership — sending an update on a ride with no active registrants yet is
harmless (zero notifications created), not an error. Body: `{ message }` (1-2000
chars). `201` → `{ rideUpdate }` (`RideUpdate`: `id`/`rideId`/`message`/
`createdAt`). Fans out a `ride_update` notification (see Notifications below) to
every currently-active registrant, after the `RideUpdate` row has already been
inserted — never inside the same transaction (`.claude/rules/resilience.md`); a
fan-out failure is logged and never turns this endpoint's response into an error.

GET `/v1/rides/:id/updates` — **implemented (CR-039)**. Organizer-only, same
ownership rule as `POST`. `200` → `{ items: RideUpdate[], nextCursor }`, newest
first. Collection, paginated per ADR-011.

## Notifications

GET `/v1/notifications/mine` — **implemented (CR-041, "In-app notifications")**.
Requires a valid session cookie (`401` otherwise). Own `/notifications` prefix, not
nested under `/rides` — same reasoning as `GET /v1/registrations/mine` (no
single-ride parent). The caller's own notifications only, newest first — no filter
dimension of its own (unlike `/registrations/mine`'s required `when`). `200` →
`{ items: Notification[], nextCursor }`. Each item: `{ id, userId, type, ride: {
id, title }, message, createdAt, readAt }` — `type` is one of
`registration_confirmed` / `ride_update` / `ride_cancelled`; `message` is the
originating `RideUpdate.message` text for `ride_update`, `null` otherwise;
`readAt` is `null` until marked read. Collection, paginated per ADR-011.

POST `/v1/notifications/:id/read` — **implemented (CR-041)**. Requires a valid
session cookie. `404 notification_not_found` if the id doesn't exist or belongs to
someone else (identity from the session only). Idempotent — re-marking an
already-read notification keeps its original `readAt`. `200` → `{ notification }`.

Notifications are created (never returned by any endpoint other than the two
above) by three producers, all in-app-only for now (ADR-007 is Pending — no
email/push in this ticket):

- `POST /v1/rides/:id/register` (CR-032) and a waitlist auto-promotion inside
  `DELETE /v1/rides/:id/register` (CR-036) each create one
  `registration_confirmed` notification for the newly-registered user, after
  their own transaction has already committed.
- `POST /v1/rides/:id/updates` (CR-039, above) fans out one `ride_update`
  notification per currently-active registrant.
- `POST /v1/rides/:id/cancel` (CR-021) fans out one `ride_cancelled` notification
  per registrant who was actively registered at cancellation time.

Every producer inserts directly into the `notifications` table in the same
request, after its own critical transaction commits — not a Redis queue. See
`.claude/context/known-issues.md` for why this is an accepted interim posture
(CR-050 is the ticket that would change it) rather than the full
`.claude/rules/resilience.md` async-queue pattern.

## Reviews

POST `/v1/rides/:id/reviews` — **implemented (CR-042)**. Requires a valid session
cookie (`401` otherwise). `404 ride_not_found` for a non-existent ride. `409
ride_not_finished` unless the ride's status is `finished`. `403 not_a_participant`
unless the caller has an _active_ registration for the ride (a cancelled registrant
cannot review). `409 review_already_exists` on a second submission from the same
caller for the same ride (also enforced by a DB unique index). Body: `{ rating,
comment? }` — `rating` an integer 1-5, `comment` ≤2000 chars, nullable/omittable.
`201` → `{ review }`.

GET `/v1/rides/:id/reviews` — **implemented (CR-042)**. Public — no session cookie
required or consulted, same "complete ride record" reasoning as `GET
/v1/rides/:id`. `404 ride_not_found` for a non-existent ride. Cursor-paginated per
ADR-011, newest first (`createdAt desc`). `200` → `{ items, nextCursor }`, each item
`{ id, rideId, userId, authorName, rating, comment, createdAt }` — `authorName` only
(no phone/email, `.claude/rules/security.md`).

CR-043 ("Organizer rating summary"): no new endpoint — `avg(rating)`/`count(*)`
across every review on any of an organizer's rides is exposed as additive
`rating`/`reviewCount` fields on the existing `organizer: { id, name }` embed
(`GET /v1/rides`, `GET /v1/rides/:id` — same "no standalone organizer endpoint"
reasoning the `## Organizers` section above already established) and on
`GET`/`POST`/`PATCH /v1/organizers/me`'s response, alongside `organizerProfile`.
`rating` is `null` with `reviewCount: 0` for an organizer with no reviews yet — never
a real `0` (`docs/design.md` §6).

## Health

GET `/health` — reports DB/Redis/S3 status; must not fail hard if one dependency is
degraded (CR-051, `.claude/rules/resilience.md`). Unversioned by design (ADR-011).

## Pagination

Every collection endpoint — including ones added later — accepts `?limit=` and `?cursor=`
and returns:

```json
{ "items": [], "nextCursor": "opaque-string-or-null" }
```

- `limit`: default 20, maximum 100; values above the maximum are clamped, not rejected;
- `cursor`: opaque to the client — never parsed or constructed client-side;
- `nextCursor: null` means the end of the collection.

Adding a collection endpoint without pagination is a contract bug, not a shortcut to fix
later (ADR-011).

## Errors

Every non-2xx response is `application/problem+json` per RFC 9457:

```json
{
  "type": "https://coffee-ride.example/errors/ride-full",
  "title": "Ride is full",
  "status": 409,
  "detail": "Human-readable, safe to show to the user.",
  "instance": "/v1/rides/42/register",
  "code": "ride_full",
  "errors": [{ "path": "startsAt", "message": "..." }]
}
```

- `code` — stable machine-readable domain code clients branch on. `title`/`detail` are
  human-facing and may be reworded without that being a breaking change;
- `errors` — present only for validation failures, one entry per field;
- `detail` never leaks a stack trace, SQL, or driver internals (`.claude/rules/backend.md`).

## Rules

- protected endpoints require auth;
- organizer mutations require ownership;
- input is runtime validated;
- errors use the RFC 9457 shape above (ADR-011);
- collections are paginated (ADR-011);
- participant data is minimized;
- auth endpoints (`/v1/auth/login`, `/v1/auth/register`, `/v1/auth/forgot-password`) carry
  a stricter rate limit than the general API (`.claude/rules/security.md`);
- `/v1/auth/forgot-password` and `/v1/auth/verify-email` responses do not reveal whether
  the target email exists — a uniform error envelope does not mean a more informative one.

## CSRF (CR-012, ADR-013)

Every `POST`/`PUT`/`PATCH`/`DELETE` under `/v1` is checked against the `Origin` header
(falling back to `Referer` when `Origin` is absent): a mismatch against the configured
`WEB_ORIGIN` returns `403 csrf_origin_mismatch`. When **neither** header is present the
request is allowed through — `SameSite=Lax` is the primary defense, this header check is
defense in depth for what Lax doesn't cover. `GET`/`HEAD` are never affected.

Consequence for manual/curl testing: a state-changing request against a real deployment
needs an `Origin: <WEB_ORIGIN>` header, including `/v1/auth/register` and
`/v1/auth/verify-email` (unaffected in shape, but now behind this check like every other
unsafe `/v1` method).
