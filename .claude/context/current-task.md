# Current task

**CR-141 — Return to the ride after sign-in: `/login?next=` (KI-064)**

Status: complete, committed.

## Goal

An anonymous visitor who presses «Зарегистрироваться» (or a riders-list sign-in link) on
a ride lands back on that ride after signing in — including via «Нет аккаунта?» →
`/register` → «Войти». Critique P0 of the participant journey (discover → register).

## Requirements / acceptance criteria

- [x] One validator, `apps/web/src/lib/auth/next-path.ts`: accepts only a same-origin
      relative path (`/…`), rejects absolute URLs, protocol-relative `//host`,
      backslashes, control characters, overlong values and auth pages themselves
      (`/login`, `/register`) — open-redirect protection. Builds `/login?next=…` /
      `/register?next=…` hrefs.
- [x] `/login` and `/register` pages read `searchParams.next` server-side, validate it,
      pass it to the forms; `LoginForm` redirects to it after success (fallback `/me`).
- [x] `LoginForm` ↔ `RegisterForm` cross-links keep `next`; `RegisterForm`'s success
      card gets a «Войти» link that keeps it.
- [x] Ride page sign-in points pass `next`: `RegistrationButton` 401 →
      `/login?next=/rides/:id`, `RidersSection` link, `RiderProfileCard` link.
- [x] Unit tests: validator cases; login redirect to `next`/fallback/rejected value;
      ride-detail 401 push target. E2E: anonymous register click → login → back on ride.
- [x] Docs: KI-064 resolved/archived, changelog, tasks, project-state.

## Out of scope (noted)

- Header «Войти»/«Регистрация» and `CabinetShell`'s anonymous redirect keep landing on
  `/me` — same mechanism would apply, but that changes behaviour beyond KI-064.
- Email-verification link can't carry `next` (would change the email/API contract).

## Previous task

CR-140 (SeaweedFS replaces MinIO, KI-068) — complete; `ci` fully green on `b5d144f`
(run `36323215724`). Its `project-state.md` note shipped with this task's commit.

## Progress

## Validation results

- `next-path.test.ts` 23/23; login/register/ride-detail/rider-profile unit tests updated
  and added; web 420/420, ui 152/152; web+ui typecheck, lint; format clean.
- `e2e/login-return.spec.ts` passed against the local dev stack (left one e2e organizer,
  ride and participant in the dev DB).
- Not run locally: full e2e suite, `next build` (would clobber the running dev server's
  `.next`) — CI covers both.

## Discovered issues

## Final result
