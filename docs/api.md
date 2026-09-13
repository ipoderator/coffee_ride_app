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

POST `/v1/auth/login`
POST `/v1/auth/logout`
GET `/v1/auth/me`

POST `/v1/auth/verify-email` — **implemented (CR-011)**. Body: `{ token }`.
`200` → `{ user }` with `emailVerified: true`. `400` with code
`invalid_verification_token` / `verification_token_already_used` /
`verification_token_expired` as appropriate — single-use, 24h expiry. Same
rate-limit tier as register.

POST `/v1/auth/forgot-password`
POST `/v1/auth/reset-password`

## Rides

GET `/v1/rides` — collection, paginated
GET `/v1/rides/:id`
POST `/v1/rides`
PATCH `/v1/rides/:id`
POST `/v1/rides/:id/publish`
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
