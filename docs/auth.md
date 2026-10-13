# Authentication & Authorization

See `docs/decisions.md` → ADR-006 (decision) and `.claude/rules/security.md` (full
checklist). This file summarizes the user-facing shape; the rules file is the
implementation checklist.

## Method

Email + password, primary method. Google sign-in beside it (CR-247, ADR-034): a
server-side OIDC code flow (PKCE, `state`, `nonce`) that ends in the same DB session
cookie. Optional per deployment — hidden without `GOOGLE_CLIENT_ID`/`_SECRET`.

## Who can do what

There is no rigid "organizer account" vs "participant account" split. Every registered
user can browse and register for rides (participant capability). Creating an
`OrganizerProfile` grants organizer capabilities scoped to that user's own resources —
the same person can be an organizer for their own rides and a participant on someone
else's, using the same login.

## Flows

- **Register**: email + password (+ minimum password policy — see `security.md`). Sends a
  verification email. Unverified accounts can browse but cannot publish a ride or take
  other trust-sensitive actions.
- **Login**: email + password → session. Generic error on failure (no account
  enumeration).
- **Return target (CR-141)**: `/login?next=<path>` returns there after a successful
  sign-in (default `/me`); `/register?next=` hands it on to `/login`. `next` must be a
  same-origin relative path — absolute/protocol-relative URLs, backslashes, control
  characters and `/login`/`/register` themselves are dropped (open-redirect
  protection, `apps/web/src/lib/auth/next-path.ts`, the one place it is validated).
- **Google (CR-247, ADR-034)**: «Войти через Google» on `/login` and `/register`
  keeps `next`. The first sign-in creates a verified, password-less account (names go
  only into empty fields); an existing account with the same **verified** email is
  linked; an unverified one is claimed (CR-249, ADR-035): email marked verified,
  password, sessions and pending verify/reset links voided, then linked — a
  pre-hijacker keeps nothing. Password login of a
  password-less account gets the generic `invalid_credentials`; «Забыли пароль?»
  sets a password. Failures return to `/login?oauth=<outcome>`.
- **Logout**: invalidates the current session.
- **Password reset**: request by email → single-use, time-limited token → set new
  password. Same generic response whether or not the email exists.
- **Session**: database-backed (ADR-013). The cookie is httpOnly/Secure/SameSite=Lax and
  carries an opaque token; the `Session` row stores its hash. 30 days, extended at most
  once a day. Logout deletes the session; a password change revokes all of the user's
  sessions.

## Before production

- ~~select the concrete session store~~ — decided: database-backed sessions (ADR-013);
- ~~define cookie/security settings and CSRF mechanism~~ — decided: single origin,
  `SameSite=Lax` + `Origin` check on unsafe methods, no CORS (ADR-013);
- ~~define session expiry/refresh policy~~ — decided: 30 days, rolling, extended at
  most once per day (ADR-013);
- confirm password hashing parameters (Argon2id/bcrypt) against current guidance;
- define email verification and password-reset email delivery (ties to ADR-007
  notifications decision, still Pending);
- ~~decide whether/which OAuth providers to add, if any~~ — Google (ADR-034).

Authentication and authorization are separate concerns and are implemented as such:
authentication establishes identity; authorization (ownership checks, capability checks)
is evaluated per request against that identity — see `security.md`.
