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

No public `GET /v1/organizers/:id` yet — `Ride` exists (CR-017) but no ride
read endpoint does yet, so nothing embeds organizer info in a response
publicly; deferred to whichever ride ticket first needs to.

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

GET `/v1/rides` — collection, paginated — not yet implemented (CR-024, public
discovery: only `published`+ statuses, no auth).

GET `/v1/rides/mine` — **implemented (CR-088)**. Requires a valid session cookie
(`401` otherwise). Every ride owned by the caller, any status — distinct from the
above; no `OrganizerProfile` yet is `200 { items: [], nextCursor: null }`, not an
error. Cursor-paginated per ADR-011 (`apps/api/src/lib/cursor.ts`), sorted
`(createdAt desc, id desc)`. A malformed `cursor` → `400 invalid_cursor`.

GET `/v1/rides/:id` — **implemented (CR-016/CR-018)**. Requires a valid session
cookie (`401` otherwise) and ownership of the ride: `404 ride_not_found` both when
the id doesn't exist at all and when it belongs to a different organizer
(deliberately the same response either way — resource-enumeration reasoning, see
`.claude/rules/security.md`). `200` → `{ ride }` on success.

PATCH `/v1/rides/:id` — **implemented (CR-016/CR-018, "Edit draft")**. Same
401/404 rules as `GET`. Draft-only: `409 ride_not_editable` once the ride has left
`draft` (publishing/cancelling/finishing are separate tickets below, not a
broader "edit anything anytime" endpoint). Body: any subset of `title`,
`description`, `bicycleType`, `startsAt`+`startTimezone` (must arrive together or
not at all), `participantLimit`, `priceRub`, `distanceKm`, `elevationGainMeters`,
`paceKmh`, `durationMinutes`, `difficulty` — every field CR-017 left `null` at
creation. `coverImageUrl` stays out (KI-023, deferred to the S3 pipeline). `200`
→ `{ ride }` with the updated fields, `400 validation_error` on an invalid field.

POST `/v1/rides/:id/publish` — **implemented (CR-019)**. Requires a valid session
cookie (`401` otherwise) and ownership of the ride: `404 ride_not_found` both when the
id doesn't exist and when it belongs to a different organizer (same rule as `GET`/
`PATCH`). Also requires `emailVerified` on the caller's account (403
`email_verification_required`, fresh DB read — `.claude/rules/security.md`: "Require a
verified email before an account can act as an organizer (publish a ride)"; same code
`POST /v1/organizers/me` already uses). Draft-only: `409 ride_not_publishable` for any
non-`draft` status. `200` → `{ ride }` with `status: 'published'`. No request body.
`draft → published` only — the lifecycle's later states (`registration_open` onward)
have no owning ticket yet (`.claude/context/known-issues.md` KI-025).

POST `/v1/rides/:id/close-registration`
POST `/v1/rides/:id/cancel`
POST `/v1/rides/:id/finish`

## Registration

POST `/v1/rides/:id/register`
DELETE `/v1/rides/:id/register`
GET `/v1/rides/:id/participants` — collection, paginated
POST `/v1/rides/:id/waitlist`
DELETE `/v1/rides/:id/waitlist`

## Route

POST `/v1/rides/:id/route`
PATCH `/v1/rides/:id/route`
DELETE `/v1/rides/:id/route`
POST `/v1/rides/:id/stops`
PATCH `/v1/rides/:id/stops/:stopId`
DELETE `/v1/rides/:id/stops/:stopId`

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
