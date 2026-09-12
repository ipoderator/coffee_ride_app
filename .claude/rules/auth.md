# Authentication Rules

Superseded by `.claude/rules/security.md` (Authentication + Authorization sections) and
`docs/auth.md` — read those for the actual, current requirements. This file is kept as a
pointer, not a second source of truth, so it can't silently drift from them again.

Quick orientation:

- Authentication answers "who". Authorization answers "what they can do". They are
  enforced separately, server-side — see `.claude/rules/security.md`.
- Target architecture: email + password, Auth.js-compatible sessions (ADR-006, Accepted).
  The session store question is settled: database-backed sessions, single origin with
  `/api` behind the proxy, `SameSite=Lax` + `Origin` check for CSRF, no CORS —
  see `docs/decisions.md` ADR-013 and `.claude/rules/security.md`.
- Organizer mutations require server-side ownership/permission checks, not just a UI gate.

Do not re-add authentication/authorization requirements here — add them to
`.claude/rules/security.md` and cross-link if a shorter pointer is genuinely useful.
