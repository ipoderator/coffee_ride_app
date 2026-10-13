# Current task — CR-247 — Google sign-in (OIDC) next to the DB sessions

Source: owner, 2026-10-13 (chat). Branch `feat/google-oauth`. No commit/push.

## Goal

Google sign-in via a server-side OIDC Authorization Code Flow (`openid-client`), ending
in the existing DB session cookie (ADR-013 unchanged).

## Requirements / acceptance

1. `GET /v1/auth/google?next=…` → 303 to Google: scopes `openid email profile`, PKCE
   S256, `state`, `nonce`; one short-lived httpOnly, SameSite=Lax (Secure in prod)
   HMAC-signed transaction cookie; `next` through `safeNextPath`.
2. `GET /v1/auth/google/callback` → checks state (cookie vs query), exchanges the code,
   validates the ID token (iss/aud/exp/nonce + signature via JWKS), creates the usual
   session cookie, 303 to `next` or `/me`. Errors → `/login?oauth=<code>&next=…`.
   Google tokens never stored or logged; the transaction cookie is cleared every time.
3. `auth_identities(user_id, provider, provider_account_id, created_at, updated_at)`,
   UNIQUE(provider, provider_account_id); Google id = `sub`. `users.password_hash`
   nullable. Migration.
4. Password login of a Google-only account → `invalid_credentials`, same Argon2 work.
5. New user: Google-verified email only, `emailVerified=true`, names only into empty
   fields. Existing verified email → linked atomically (row lock + ON CONFLICT);
   races (two callbacks, callback vs register) end in one user + one identity.
   Existing unverified email → refused (pre-hijack protection), blocked → refused.
6. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`: env schema, preflight pair warning,
   `.env.example`, `deploy/production.env.example`, `docker-compose.prod.yml`.
7. Web: Google button on `/login` and `/register` keeping `next`, hidden when not
   configured (`GET /v1/auth/google/status`); `?oauth=` error message.
8. Russian `/privacy` and `/terms` pages (data, sessions, deletion, contact
   `glebchurkin48@gmail.com`).
9. Tests: OAuth happy path, state/nonce/token errors, cookies, safe next, concurrency.
10. lint, typecheck, all tests, build; local flow checked.

## Planned files

api: `env.ts`, `preflight.ts`, `app.ts`, `plugins/google.ts`,
`modules/auth/{google-client.ts,google-transaction.ts,google.service.ts,google.routes.ts,
session-cookie.ts,auth.routes.ts,auth.service.ts}` + tests; db: `schema/auth-identity.ts`,
`schema/user.ts`, migration `0028`; types: `api/auth.ts`; web: login/register pages,
`features/auth/google/`, `app/(public)/{privacy,terms}`, terminology; docs.

## Progress

- [x] context read, `openid-client@^6.8.8` added to `apps/api`
