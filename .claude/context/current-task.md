# Current task — CR-247 — Google sign-in (OIDC) next to the DB sessions

Source: owner, 2026-10-13 (chat). Branch `feat/google-oauth`. Committed and pushed for a PR into `main` (owner, 2026-10-13).

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
- [x] migration `0028`, API (client, transaction cookie, service, routes, plugin, env,
      preflight), web (button, alert, `/privacy`, `/terms`, sitemap), stories, docs

## Validation

- api 762/762 (0 skipped, live Redis/S3, `coffee_ride_test`), web 941/941, ui 278/278,
  db 17, resilience 15, maps-2gis 82 (+6 opt-in contract); Google: routes 36, client 6,
  transaction 5, terms 4, web google/legal 11.
- `test:coverage` + `coverage:check` hold (auth 97.81 % lines, +1.78 pp; branches +5.48).
- typecheck 8/8, lint 9/9 (`lint:root`/`format:check` flag only the untracked, locally
  excluded `brag-output*/`), `pnpm build` 7/7, prod compose renders `GOOGLE_*`.
- Storybook `GoogleSignIn` + `LegalDocument` 9/9 with axe.
- Local flow (api with placeholder `GOOGLE_*`, through the Next proxy): status
  `available`, `/login`/`/register` button keeps `next`, click → accounts.google.com
  (`invalid_client` for the placeholder id — endpoint and params accepted), cookie
  HttpOnly/Lax/600 s; callback: cancel → `oauth=cancelled`, forged state → `state`, no
  cookie → `expired`, real Google token endpoint with a fake code → `failed`; no secret
  or code in the API log. Full success path covered by tests with a fake Google.

- Real OAuth client (Google Cloud project `coffee-511414`) in the local `.env`: Google
  accepts it (consent → sign-in page, no `invalid_client`/`redirect_uri_mismatch`); a
  fake code at the token endpoint → `invalid_grant` (client secret accepted) →
  `oauth=failed`; no secret in the API log. A full sign-in needs a person at Google.

## Follow-up (owner, 2026-10-13): centred consent line, faster button

- The button appeared only after hydration + a client `GET …/google/status` (seconds
  in dev). Now `/login`/`/register` await `isGoogleSignInAvailable()` server to server
  (`features/auth/google/server-status.ts`, 1.5 s timeout, fails soft) and render
  `GoogleSignIn` only when true — the button is in the first HTML (~65–110 ms to
  visible). `GoogleSignIn` keeps `'use client'` (`ui`'s `buttonClassName` is a client
  export) but has no effect/fetch. Consent line `text-center`.
- Measured: our `/google` and `/google/callback` answer in 2–5 ms; the rest of a
  sign-in is Google (token exchange ~0.2–0.5 s, JWKS on a cold cache ~0.5 s).
- Validation: google unit tests 9/9, GoogleSignIn stories 4/4, tsc, eslint, prettier;
  `/login` 390/1440 screenshots.

## Final result

Done on `feat/google-oauth`, committed for a PR into `main`. Security
review: no CRITICAL/HIGH; KI-099 (pre-existing logout cookie) recorded.
