# Current task — CR-267 — Final check of the auth mockup work (CR-260..CR-265)

Source: owner, 2026-10-14 (prompt 4 «Финальная проверка» of the mockup package
`reference/coffee-ride-auth-mockup/` — reference only, never edited). No subagents;
commit and push to `experiments` (owner). Fix only regressions of this work.

## Goal

Prove the auth mockup work end to end against the three mockup tabs («Вход»,
«Регистрация», «Техработы») and the brief, with OAuth/CAPTCHA mocked.

## Requirements

- Flow: register → confirm password → reCAPTCHA → email verification → password login
  → Google → Yandex → safe-next → logout → maintenance → recovery.
- Also: concurrent OAuth callbacks and identity linking; Google/Yandex-only accounts;
  generic auth errors; state/PKCE/nonce/cookie flags; 503/Retry-After/healthcheck;
  desktop/mobile vs the mockup; accessibility; console errors and data leaks.
- Full test suite, lint, typecheck, production build.

## Acceptance

- [x] every flow step passes in Chromium against the real API with fake providers
- [x] each extra check has evidence (test name or browser/HTTP output)
- [x] screenshots 1440/768/390/320 compared with the mockup tabs
- [x] axe (WCAG 2.1 AA) on login/register/maintenance/error: no violations
- [x] no console errors; no stack/secret/token/email in responses or logs checked
- [x] format, lint, lint:root, typecheck, build, test:coverage, Storybook, e2e green
      (or pre-existing failures named)

## Progress

- `experiments` merged with `main` (CR-262..CR-265 had landed via PRs #64..#69); the
  next free id was CR-267 (CR-266 = open PR #70, CI split).
- Harness (scratchpad, never committed): `next start` built with a fake site key + the
  real API with fake Google/Yandex/siteverify (`harness/mock-api.mts`), rate limits
  raised (all traffic from 127.0.0.1); `flow.mjs` 75/75, `maint.mjs` 37/37.

## Validation

- format:check (only the untracked mockup), lint (0 errors, warnings 8/29), lint:root,
  typecheck, build 7/7.
- test:coverage (live Redis/S3): api 917, web 1063, ui 301, db 17, resilience 15,
  maps-2gis 82 (+6 opt-in); coverage:check holds; first run hit KI-102 once.
- Storybook auth/status 44/44 with axe; full 326/331 (KI-100).
- e2e 63/69: the 6 failures are `visual-regression` screenshots (anti-aliasing only, local vs CI baselines), not auth.

## Discovered issues

- Fixed: `/register` kept «Пароли не совпадают.» (submit-time) after the passwords were
  made equal — hidden live «Пароли совпадают» until the next submit.
- Not changed (owner decision): provider buttons are app-drawn outlined buttons, the
  brief asks for GIS/Yandex-constructor rendering (white in the mockup).
- Harness-only: the global per-IP limit hides the social buttons once exceeded (status
  calls 429) — graceful; production sees real client IPs.

## Final result

Done — the auth mockup work holds end to end; one UX regression fixed.
