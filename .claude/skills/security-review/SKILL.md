---
name: security-review
description: Use when asked to review, audit, or harden auth/authorization/security — e.g. "do a security review", "check this endpoint is safe", "audit the auth flow", or as part of CR-047. Walks the diff or the whole app against every item in rules/security.md systematically rather than an ad-hoc read-through.
---

# Security Review

Read first: `.claude/rules/security.md` in full — this skill is the walkthrough
procedure, `security.md` is the actual checklist content.

## Steps

Go through each section of `.claude/rules/security.md` against the code under review, and
report findings by severity (CRITICAL/HIGH/MEDIUM/LOW), same convention as the reviewer
agent:

1. **Authentication** — password hashing algorithm/params current, no plaintext
   anywhere (storage, logs, error responses, API responses), account-enumeration-safe
   error messages on login/reset, reset tokens single-use and expiring, auth endpoints
   specifically rate-limited, session cookie flags correct (httpOnly/Secure/SameSite),
   expiry/refresh policy actually enforced not just documented.

2. **Authorization** — every mutating endpoint checks identity from the verified session
   only; every ownership check happens server-side in the service layer; no endpoint
   relies on a hidden UI element as its only protection; default-deny confirmed (no
   endpoint found with zero authorization check where one is needed).

3. **Input handling** — Zod validation at every external boundary; parameterized
   queries only; no string-built SQL; participant/organizer data responses minimized to
   what the caller's capability requires.

4. **Transport/headers** — HTTPS enforced outside local dev; security headers present;
   CSRF mechanism present and matches what was decided/recorded for cookie-based
   sessions.

5. **Secrets** — `.env`/credentials not committed (check `.gitignore` and git history for
   the diff under review); only genuinely public values carry `NEXT_PUBLIC_`; no secret
   reachable from a client bundle.

6. **Rate limiting/abuse** — general API limiting present and sane; auth endpoints
   stricter; registration endpoints still correct under concurrent load
   (`.claude/rules/database.md` invariants) despite limiting.

7. **Dependencies** — no new auth/crypto-adjacent dependency merged without a second
   look; Dependabot alerts not ignored/stale.

8. **Audit trail** — sensitive mutations (cancellation, participant removal, profile
   changes) attributable at the DB level.

## Output

For each finding: severity, location, what's wrong, what `.claude/rules/security.md`
requires instead. If everything checked out, say so explicitly — don't pad the report
with restated content from security.md as if it were a finding.
