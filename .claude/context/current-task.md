# Current task — CR-220 skip email verification on the test deploy — COMMITTED

Source: owner, 2026-10-08 — "в продакшене нужно убрать подтверждение по email, так как
это только тестовый деплой на сервер".

## Goal

Production (coffeeride.site, test deploy, no verified Unisender sender) lets a new
account act as organizer without confirming email.

## Approach

Env switch `AUTH_SKIP_EMAIL_VERIFICATION` (default off, allowed in production, preflight
warning while on). `registerUser` creates the user verified, no token; `/register` sends
no email. Web success card: «Подтверждать почту не нужно — можно сразу войти.» The
`emailVerified` gates (organizer profile, ride publish) are untouched.

## Validation

- api: env/preflight/auth suites 79 passed (TEST_DATABASE_URL docker 127.0.0.1).
- web: register 16 passed; storybook EmailVerification 8 passed (play + axe).
- typecheck + lint api/web/ui green. Full `coverage:check` not run (needs live stack).

## Remaining (needs owner approval — outward-facing)

- commit + push; on the server: `AUTH_SKIP_EMAIL_VERIFICATION=true` in `.env`,
  `git pull && deploy/deploy.sh`; one-off `UPDATE users SET email_verified = true`
  for accounts registered before the switch.
