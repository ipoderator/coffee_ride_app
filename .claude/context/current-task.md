# Current task — CR-262 — Register screen to the auth mockup

Source: owner, 2026-10-14. Mockup package `reference/coffee-ride-auth-mockup/`
(`index.html` tab «Регистрация», `CLAUDE-CODE-BRIEF.md`, `desktop-clean-bg.png`) —
reference only, never edited. No subagents, no commit/push/PR (owner).

## Goal

`/register` looks like the mockup's «Регистрация» tab (desktop story panel + form,
compact single column on a phone), with server-checked password confirmation and a
register endpoint that no longer reveals whether an email has an account.

## Requirements

- Layout: story panel (`lg`+) with the decorative abstract route; social sign-in first
  (Google and Yandex ID equal, two columns from `sm`), divider «или создайте пароль»,
  email form, «Уже есть аккаунт? Войти», consent line. Existing components/tokens, no
  mockup CSS/JS copied. `/login` unchanged (separate task).
- Password: strength meter (4 segments + text, not color alone) and the 12+ policy kept;
  «Повторите пароль» with a live match state; show/hide toggles.
- Confirmation checked in the browser AND by the API: `registerRequestSchema` gets an
  optional `confirmPassword` that must equal `password` when sent (the web form always
  sends it). Supersedes ADR-038's "never sent" — ADR-039.
- No account enumeration on `/register`: an existing email gets the same `201` and body
  as a new one; the owner of the address gets an «аккаунт уже есть» email (login +
  forgot-password links) instead of an error. Decoy Argon2 hash on that path; the notice
  is delivered by the same policy as the verification email. Response drops `user`:
  `{ emailVerificationRequired, verificationUrl? }` (dev-only URL only for a new account).
- Keep: Google + Yandex OAuth (no change to flows), reCAPTCHA (server-verified, fail
  closed), safe `next`, rate limits, Fastify auth, DB sessions.
- No new env vars, no migration needed (`auth_identities` already holds `yandex`).

## Acceptance

API tests: success, weak password, mismatch confirmation, no confirmation, duplicate
email → identical 201 + notice email (case-insensitive, race), captcha
required/invalid/expired/unavailable. Web tests: strength, match states, sends
`confirmPassword`, generic success, captcha errors. Stories for new components; browser
check 320/390/768/1440 light/dark with OAuth/CAPTCHA fakes. lint, typecheck, related tests,
build green.

## Planned files

types `api/auth.ts`; api `auth.service.ts`, `auth.routes.ts`, notifications
service/queue, tests; ui `terminology.ts` (+tests); web `app/(public)/register/page.tsx`,
`features/auth/{layout,password}/*`, `RegisterForm.tsx`, `OAuthSignIn.tsx`, register
api/tests, stories, e2e fixture; docs ADR-039, `api.md`, `auth.md`, rules
(`do-not-break.md`, `security.md`), changelog, tasks, project-state.

## Progress

- [x] API + types (schema refinement, `created: false` path, account-exists email/job,
      auth event, wrapped-`23505` fix)
- [x] web layout/form/password components, `OAuthSignIn intent="register"`, stories
- [x] docs/rules (ADR-039, api.md, auth.md, security.md, do-not-break.md)
- [x] validation

## Validation results

- format:check — clean except the untracked mockup `reference/…/index.html` (not ours to
  edit); lint 9/9 (warnings unchanged: api 8, web 29); lint:root; typecheck 8/8;
  `pnpm build` 7/7 (with `NODE_ENV` unset — see discovered issues).
- tests: api 884/884 (live Redis + S3, `S3_*` from `.env`), web 999, ui 293, db 17,
  resilience 15, maps-2gis 82; `coverage:check` holds (api auth +3.06 pp lines).
- Storybook (auth stories) 41/41 with axe; e2e `login-return` + `critical-journeys` 7/7
  (ports 3200/4200).
- Chromium against the real API with in-process fakes (Google, Yandex, siteverify) and a
  routed fake reCAPTCHA widget: 24/24 — 320/390/768/1440 light/dark (no horizontal
  scroll, panel only at `lg`+), success, taken email (identical card and body), mismatch,
  short and weak passwords, captcha required/invalid/expired/widget expiry, Google and
  Yandex sign-up returning to a safe `next`, unsafe `next` dropped.

## Discovered issues

- KI-101: wrapped-`23505` miss in reviews/ride-groups/organizers (auth fixed here).
- KI-102: `EditRideForm` dismiss test flaky under coverage load.
- The cloud environment now exports `NODE_ENV=development`: `next build` then fails
  prerendering `/me` and `/_global-error` (`useContext` of null). Unset it for builds.
- `queue.live.test.ts` times out while another API with a BullMQ worker shares the same
  Redis (a dev server) — it steals the job; not a code issue.

## Final result

Done, validated and committed on `experiments` (no PR yet). See `docs/changelog.md` CR-262.

Follow-up CR-263 (owner, 2026-10-14): story column is text only — no panel fill, border
or decorative route (`AuthSplitLayout`). Committed on `experiments`.
