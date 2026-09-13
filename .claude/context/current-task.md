# Current Task

## Status

complete

## Task ID

CR-012 — Login/logout/session

## Goal

Implement `POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/me`, backed by
the database-backed session store ADR-013 already decided (Postgres `Session` row,
opaque cookie token, SHA-256 hash at rest). This is also where ADR-013's CSRF mechanism
(`SameSite=Lax` + `Origin`/`Referer` check on every unsafe method) gets its first real
implementation — ADR-013 names CR-012 explicitly as where that's recorded.

Context read this session: `.claude/rules/security.md` (Authentication + Authorization),
`docs/decisions.md` ADR-013, `docs/api.md` (Auth section — login/logout/me endpoints
already documented as not-yet-implemented), `packages/db/src/schema/user.ts`,
`apps/api/src/modules/auth/*` (existing register/verify-email module to extend, not
duplicate), `apps/api/src/app.ts`/`env.ts`/`plugins/error-handler.ts`.

CR-011 was committed this session (`75f1269`) before starting CR-012 — pre-existing
unrelated pending changes (`docs/product.md`, `skills-lock.json`) were left untouched,
out of scope for both tickets.

## Requirements

- `POST /v1/auth/login` — body `{ email, password }`. Generic `invalid_credentials`
  error (401) for both "no such account" and "wrong password" — no account enumeration
  (`.claude/rules/security.md`). Does NOT require `emailVerified` (that gate is
  organizer-action-specific, not login-specific, per `.claude/rules/security.md` and
  `docs/auth.md`). Same interim per-IP rate-limit tier as register/verify-email
  (KI-022 already documents this as an open upgrade, not a new gap). On success: create
  a `Session` row, set the session cookie, return `{ user }`.
- `POST /v1/auth/logout` — requires a valid session (401 without one). Deletes the
  `Session` row (hard delete, per ADR-013 — not a `revokedAt` soft-delete), clears the
  cookie, `204`.
- `GET /v1/auth/me` — requires a valid session (401 without one). Returns the current
  user's public fields, `200`.
- Session cookie: httpOnly, `Secure` in production only (local dev is plain HTTP),
  `SameSite=Lax`, `Path=/`, 30-day lifetime. Opaque random token; only its SHA-256 hash
  is persisted (same pattern as CR-011's email-verification token, `tokens.ts`).
- Rolling expiry: `expiresAt` extended at most once per day on session use, not on
  every request (ADR-013).
- CSRF: a preHandler under `/v1` rejects POST/PUT/PATCH/DELETE when `Origin` (or
  `Referer` fallback) is present and does not match the configured web origin. Request
  is allowed through when neither header is present (documented reasoning: `SameSite=Lax`
  already blocks the classic cross-site cookie-riding vector; the header check is
  defense in depth for the cases Lax doesn't cover, not the only layer) — this also
  applies to the existing `/v1/auth/register`/`/verify-email` routes (ADR-013 says
  "every unsafe method", not just the new ones), which changes their curl-based
  live-check recipe (needs an `Origin` header now).
- New env var: `WEB_ORIGIN` (the single allowed browser origin for the CSRF check) —
  required, since the check needs a real value to compare against in every environment,
  not just production.
- `packages/db`: new `sessions` table + migration, per ADR-013's exact column list
  (tokenHash, userId, createdAt, expiresAt, lastUsedAt, revokedAt) — `revokedAt` is
  unused by any CR-012 code path (no admin "block" feature exists yet) but is part of
  the already-Accepted ADR-013 schema, not new scope creep.
- `packages/types`: `loginRequestSchema`, `MeResponse`/`LoginResponse` (both just
  `{ user: User }`, reusing the existing `User` type).

## Acceptance criteria

- Login: correct credentials → 200 + cookie + user; wrong password → 401
  `invalid_credentials`; unknown email → 401 `invalid_credentials` (identical body/
  status/timing-shape to the wrong-password case); missing/malformed body → 400.
- `GET /v1/auth/me`: valid cookie → 200 + user; no cookie / expired / tampered /
  logged-out cookie → 401.
- Logout: valid cookie → 204, `Session` row actually deleted (verified via a direct DB
  query in the test, not just the HTTP response), cookie cleared (`Set-Cookie` with
  past expiry), and the same cookie value reused after logout → 401. No cookie → 401,
  nothing to delete.
- Session rows never expose `tokenHash` anywhere in an HTTP response.
- CSRF: a state-changing `/v1` request with a mismatched `Origin` → 403; matching
  `Origin` → passes through to the route; a `GET` is never blocked by this check
  regardless of `Origin`.
- Rolling expiry: a session used again after >24h updates `expiresAt`/`lastUsedAt`; used
  again <24h later does not change `expiresAt` (unit-tested against the service function
  with an injected/fake "now", not a real 24h wait).
- `turbo run lint/typecheck/build/test` (run separately, per CR-011's documented
  turbo-concurrency caveat) all green; `format:check`/`lint:root` clean.
- Live check: real Postgres + both dev servers, curl-driven login → me → logout → me
  (401) sequence, plus one CSRF-rejection curl call with a wrong `Origin` header.

## Planned files

- `packages/db/src/schema/session.ts` (new), `packages/db/src/schema/index.ts` (export),
  new migration.
- `packages/types/src/api/auth.ts` (add `loginRequestSchema` + response types),
  `packages/types/src/index.ts` unchanged (already re-exports `./api/auth.js`).
- `apps/api/src/modules/auth/session.ts` (new — create/validate/revoke session,
  rolling-expiry logic), `apps/api/src/modules/auth/auth.service.ts` (add `loginUser`),
  `apps/api/src/modules/auth/auth.routes.ts` (add the three routes), new
  `apps/api/src/modules/auth/auth.routes.test.ts` cases (extends the existing file).
- `apps/api/src/plugins/auth.ts` (new — `requireAuth` preHandler + `request.user`/
  `request.sessionId` decorators), `apps/api/src/plugins/csrf.ts` (new — the
  Origin/Referer preHandler).
- `apps/api/src/app.ts` (register `@fastify/cookie`, the auth plugin, the CSRF plugin),
  `apps/api/src/env.ts` (+ `WEB_ORIGIN`), `apps/api/package.json` (+ `@fastify/cookie`).
- `.env.example` (+ `WEB_ORIGIN`), `docs/api.md` (mark login/logout/me implemented,
  document the CSRF behavior change), `docs/database.md` (sessions table).
- `docs/decisions.md` — NOT a new ADR (ADR-013 already covers this design fully;
  CR-012 implements it, doesn't decide anything new) unless something forces a real
  deviation during implementation.

## Implementation progress

- [x] Plan approved (user explicitly instructed implementation to proceed this
      session; plan content unchanged from what's written above)
- [x] `packages/db`: `sessions` schema + migration (`0001_sparkling_toro.sql`),
      applied to scratch Postgres (`coffee_ride_dev`)
- [x] `packages/types`: login/me contract schemas (`loginRequestSchema`,
      `LoginResponse`, `MeResponse`)
- [x] `apps/api`: `@fastify/cookie`, session module, auth/CSRF plugins, three
      routes, `WEB_ORIGIN` env
- [x] Tests: unit (rolling expiry — `session.test.ts`) + route-level
      (login/logout/me/CSRF — extended `auth.routes.test.ts`); `requireAuth`/
      CSRF preHandler covered at the route level (every route already needs
      one or both), not via a separate isolated preHandler unit test
- [x] Live check: real Postgres + running `apps/api`, curl sequence including
      a CSRF-reject case (see Validation below — apps/web dev server was not
      needed, this ticket adds no web UI)
- [x] Full validation (`turbo run lint/typecheck/build/test` separately,
      format/lint:root)
- [x] Context/docs updated (changelog, project-state, architecture-map,
      known-issues, tasks.md, docs/api.md, docs/database.md)
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck` (all 8 packages): clean.
- `turbo run lint` (all 8 packages): clean.
- `turbo run build` (6 buildable packages): clean, including `apps/web`'s
  `next build`.
- `pnpm format:check` / `pnpm lint:root`: clean.
- `turbo run test` against `DATABASE_URL` pointed at the local scratch
  Postgres (`coffee_ride_dev`): all green — `packages/ui` 82 tests,
  `apps/web` 8 tests, `apps/api` 32 tests (was 15 before this ticket).
  `apps/api`'s full suite re-run 3 consecutive times to confirm the
  TRUNCATE-deadlock fix (see Discovered issues) is actually stable, not
  just lucky once.
- Live check via curl against a real `apps/api` (`tsx src/server.ts`,
  `WEB_ORIGIN=http://localhost:3000`) + the same scratch Postgres:
  register (`Origin` header present, passes CSRF) → login (200, `Set-Cookie:
session=...; Path=/; HttpOnly; SameSite=Lax`, no `Secure` since
  `NODE_ENV=development`) → `GET /me` (200, same user) → logout (204,
  `Set-Cookie` with `Max-Age=0`/past `Expires`) → `GET /me` with the same
  (now-deleted) cookie (401 `unauthorized`) → login with
  `Origin: http://evil.example` (403 `csrf_origin_mismatch`). All matched
  the acceptance criteria exactly.
- Every acceptance criterion from above is met: generic `invalid_credentials`
  for both unknown-email and wrong-password (verified same status/code/title/
  detail in `auth.routes.test.ts`); `GET /me` 401s on missing/expired/
  tampered/logged-out cookie (4 separate test cases); logout verified via a
  direct DB `SELECT` that the row is gone, not just the HTTP response;
  `tokenHash` never appears in any response body (asserted via
  `JSON.stringify(body)` substring checks, same pattern as CR-011's
  `passwordHash` check); rolling expiry unit-tested with an injected `now`
  for both the ">24h → extends" and "<24h → unchanged" branches.

## Discovered issues

Found and fixed during implementation (not left open):

- Once `session.test.ts` became a second Vitest file touching
  `users`/`email_verification_tokens`/`sessions`, the existing CR-011
  `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` `beforeEach` pattern started
  deadlocking intermittently under Vitest's default parallel-file execution
  (two concurrent `TRUNCATE`s took conflicting Postgres `ACCESS EXCLUSIVE`
  locks). Root-caused and fixed by switching every such `beforeEach` (both
  test files) to `DELETE FROM users`, relying on the existing
  `ON DELETE CASCADE` foreign keys to clear `email_verification_tokens`/
  `sessions` — `DELETE` takes row-level locks, not a table-level exclusive
  one. Verified stable across 3 consecutive full-suite runs. Documented in
  `docs/changelog.md` and inline comments; no open known-issue entry needed
  (resolved same-session, same convention as CR-065's KI-R10).

No other issues found — no open known-issue entries were created by this
ticket; KI-022 was narrowed (its CSRF gap closed) rather than replaced.

## Final result

CR-012 complete. `POST /v1/auth/login`, `POST /v1/auth/logout`,
`GET /v1/auth/me` implemented per ADR-013, all acceptance criteria met,
full validation suite green, live-verified end to end over real HTTP against
a real Postgres database. `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md`, `.claude/context/architecture-map.md`,
`.claude/context/known-issues.md`, `docs/api.md`, `docs/database.md` all
updated. Not yet committed — `git diff`/`git status` reviewed, awaiting the
user's go-ahead to commit (pre-existing unrelated pending changes,
`docs/product.md` and `skills-lock.json`, again left untouched and out of
scope, same as at the start of this session).
