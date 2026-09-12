# Security Rules

See `docs/decisions.md` → ADR-006 for the authorization/authentication architecture this
file operationalizes.

Treat all client input as untrusted.

Never:

- expose secrets in browser bundles;
- commit credentials;
- trust client-provided userId/organizerId;
- authorize only in the UI;
- return unnecessary participant data;
- log passwords/tokens/private contact data.

Protect:

- auth endpoints;
- organizer mutations;
- participant contact/emergency data;
- file uploads;
- registration endpoints.

Use rate limiting for abuse-prone endpoints, Redis where appropriate.
Validate file type, size, and content expectations.

These items apply from the first auth-related task (CR-011/CR-012) onward — CR-047
("Security review") is an audit against everything below, not where security starts.

## Authentication (who you are)

- Primary method: email + password.
- Hash passwords with Argon2id (preferred) or bcrypt at a current cost factor. Never
  store, log, or return plaintext passwords anywhere, including error messages/logs.
- Enforce a minimum password policy (favor length, e.g. 12+ characters, over forced
  complexity rules).
- Require a verified email before an account can act as an organizer (publish a ride) or
  before any future money-adjacent trust action. Participants may browse unverified.
- Login errors must not reveal whether the account exists — one generic message for both
  "no such account" and "wrong password".
- Password reset tokens are single-use and time-limited (e.g. 15–30 min), invalidated
  after use/expiry. Requesting a reset for a non-existent email returns the same response
  as for an existing one (no account enumeration).
- Rate-limit `/v1/auth/login`, `/v1/auth/register`, `/v1/auth/forgot-password`, per IP
  and per account, more aggressively than general API rate limits.
- Sessions are database-backed (ADR-013): the cookie carries an opaque token, the
  `Session` row stores its SHA-256 hash — never the token itself. Cookie is
  httpOnly, Secure, SameSite=Lax, Path=/. Lifetime 30 days, rolling: `expiresAt` is
  extended at most once per day, not silently on every request.
- Revocation must actually revoke: logout deletes the row, a password change revokes
  every session of that user, a block takes effect on the next request. Any session
  cache (Redis) is invalidated on revocation — Postgres stays the source of truth.
- OAuth providers can be added later (Auth.js-compatible architecture) but are not
  required for MVP — don't block CR-011/CR-012 on selecting one.
- 2FA is out of scope for MVP; the auth/session design should not preclude adding it
  later, but do not build it now.

## Authorization (what you can do)

- Capability-based, not a rigid role enum: every user is implicitly a participant; an
  `OrganizerProfile` grants organizer capabilities for resources that profile's user owns
  (see `docs/product.md` — a user can hold both capabilities at once).
- Every mutating endpoint checks authentication AND resource ownership server-side, on
  every request — identity comes only from the verified session, never from a
  client-supplied field.
- Ownership checks live in the service/use-case layer (`rules/backend.md`), not only in
  the UI. A hidden button is not access control.
- Default-deny: an endpoint with no explicit authorization check is a bug, not something
  to add "later."

## Transport & headers

- HTTPS only outside local dev; no mixed content.
- Apply standard security headers on API responses (e.g. `@fastify/helmet` or
  equivalent): CSP, X-Content-Type-Options, frame-ancestors/X-Frame-Options,
  Referrer-Policy.
- CSRF (decided in ADR-013, not left implicit): single origin — `example.com` serves
  the web app, `example.com/api/*` is proxied to the API — so protection is
  `SameSite=Lax` plus an `Origin`/`Referer` check on every unsafe method
  (POST/PATCH/DELETE). A double-submit token is not required under one origin.
- No CORS: cross-origin browser access is not a supported configuration. Do not add a
  permissive CORS policy "just in case" — if a genuine second origin appears, that is
  an ADR, not a config tweak.

## Dependencies

- Dependabot (`.github/dependabot.yml`) is configured for npm/actions/docker — review and
  merge security-relevant updates promptly rather than letting them queue.
- A new auth- or crypto-adjacent dependency deserves a second look before merging.

## Audit trail

- Sensitive state changes (ride cancellation, participant removal, organizer profile
  changes) should be attributable (who, when) at the database level from the start — via
  ordinary `updatedBy`/timestamp columns — even before a dedicated audit-log feature
  exists.
