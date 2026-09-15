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

POST `/v1/auth/forgot-password`
POST `/v1/auth/reset-password`

## Users

PATCH `/v1/users/me` — **implemented (CR-013)**. Requires a valid session
cookie (`401` otherwise). Body: `{ displayName?, phone?, bio? }`, each
independently omittable (leaves the stored value unchanged) or `null`
(clears it) — `displayName` 1-80 chars, `phone` a loose 7-20 char format
check, `bio` ≤500 chars. `200` → `{ user }` (same shape as `GET /v1/auth/me`
— no separate `GET /v1/users/me`, `.claude/CLAUDE.md`: no duplicate
concepts). `400 validation_error` on an invalid field. `phone`/`bio` are
private — returned only to the profile's own owner; no endpoint exposes
another user's row yet (`.claude/rules/security.md`).

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

No public `GET /v1/organizers/:id` endpoint exists, and none is planned for
just this — CR-023 ("Ride detail") embeds `{ id, name }` directly on `GET
/v1/rides/:id`'s response instead (`docs/product.md` Principle 2: "complete
ride record, not a link out"). A standalone public organizer-read endpoint
would only be added if something else genuinely needs to look up an
organizer independently of a ride.

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
`400 invalid_cursor`.

GET `/v1/rides/mine` — **implemented (CR-088)**. Requires a valid session cookie
(`401` otherwise). Every ride owned by the caller, any status — distinct from the
above; no `OrganizerProfile` yet is `200 { items: [], nextCursor: null }`, not an
error. Cursor-paginated per ADR-011 (`apps/api/src/lib/cursor.ts`), sorted
`(createdAt desc, id desc)`. A malformed `cursor` → `400 invalid_cursor`.

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
field CR-017 left `null` at creation. `coverImageUrl` stays out (KI-023,
deferred to the S3 pipeline); `startLat`/`startLng` are entered manually —
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

## Registration

POST `/v1/rides/:id/register`
DELETE `/v1/rides/:id/register`
GET `/v1/rides/:id/participants` — collection, paginated
POST `/v1/rides/:id/waitlist`
DELETE `/v1/rides/:id/waitlist`

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

POST `/v1/rides/:id/updates`
GET `/v1/rides/:id/updates` — collection, paginated

## Reviews

POST `/v1/rides/:id/reviews`
GET `/v1/rides/:id/reviews` — collection, paginated

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
