# Authentication & Authorization

See `docs/decisions.md` → ADR-006 (decision) and `.claude/rules/security.md` (full
checklist). This file summarizes the user-facing shape; the rules file is the
implementation checklist.

## Method

Email + password, primary and only required method for MVP. Auth.js-compatible
architecture so OAuth providers can be added later without restructuring, but no OAuth
provider is required to ship.

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
- **Logout**: invalidates the current session.
- **Password reset**: request by email → single-use, time-limited token → set new
  password. Same generic response whether or not the email exists.
- **Session**: httpOnly/Secure/SameSite cookie; explicit expiry/refresh policy (defined
  during CR-012, recorded in `docs/changelog.md` once decided — the exact session store,
  database-backed vs JWT, is still open, see ADR-006).

## Before production

- select the concrete session store (database-backed sessions vs JWT) — currently open;
- define cookie/security settings and CSRF mechanism (see `security.md`);
- define session expiry/refresh policy;
- confirm password hashing parameters (Argon2id/bcrypt) against current guidance;
- define email verification and password-reset email delivery (ties to ADR-007
  notifications decision, still Pending);
- decide whether/which OAuth providers to add, if any.

Authentication and authorization are separate concerns and are implemented as such:
authentication establishes identity; authorization (ownership checks, capability checks)
is evaluated per request against that identity — see `security.md`.
