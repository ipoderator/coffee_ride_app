# Current task — CR-264 — Login screen to the auth mockup

Source: owner, 2026-10-14 (mockup package `reference/coffee-ride-auth-mockup/`, tab
«Вход», prompt 2 of `CLAUDE-CLOUD-PROMPTS.md`) — reference only, never edited. No
subagents, no commit/push/PR (owner).

## Goal

`/login` looks like the mockup's «Вход» tab, and the Yandex ID / Google sign-in meets
the brief: server-side code flow with state + PKCE (nonce where applicable), safe
`next`, short-lived httpOnly/Secure(prod)/SameSite=Lax cookies, no stored tokens,
identity by stable provider id, atomic race-safe linking by verified email, and a
social-only account's password login = generic `invalid_credentials` with the same
Argon2 work.

## Requirements

- Layout in CR-262/263's frame (`AuthSplitLayout`, story text only): «Вход», lead,
  Google then Yandex ID as equal buttons, «или через email», email + password
  (placeholders, «Забыли пароль?» on the label line, show/hide), «Войти», «Нет
  аккаунта? Зарегистрироваться», consent line. Existing components/tokens; no mockup
  JS/CSS copied.
- Keep: Fastify auth, DB sessions, Google OIDC, Yandex flow (ADR-037), reCAPTCHA on
  password login (ADR-038), rate limits, generic errors.

## Acceptance

- [x] `/login` per mockup at 1440/768/390/320, no horizontal overflow, one `h1`.
- [x] Yandex: S256 PKCE + state, `yandex-oauth` cookie HttpOnly/Lax/600 s, `__Host-` +
      Secure in production (set and clear), session cookie `__Host-session` Secure/
      HttpOnly/Lax — tests + Chromium.
- [x] Google: PKCE + state + nonce (existing tests; nonce mismatch refused).
- [x] Invalid state / no cookie / forged or rejected code / denial / replay / unsafe
      `next` / unavailable provider — tests (and Chromium for state/expired/next).
- [x] Repeat login by provider id; linking/races (existing suites, both providers).
- [x] Yandex-only and Google-only password login → identical `invalid_credentials`,
      one decoy Argon2id verify (same hash params).
- [x] Tests, lint, typecheck, build green.

## Planned / changed files

ui `FormField.tsx` (+`labelAction`), `terminology.ts` (`LOGIN_PAGE_TERMS`,
`passwordPlaceholder`, Yandex label; removed `registerLink`, `OAUTH_SIGN_IN_TERMS.divider`)

- tests; web `(public)/login/page.tsx` (+test), `features/auth/login/components/
{LoginScreen,LoginForm}.tsx`, `features/auth/oauth/components/OAuthSignIn.tsx` (buttons
  only, Google first), tests, stories (`LoginScreen` new, `OAuthSignIn`), e2e selectors;
  api `yandex.routes.test.ts`; `coverage-baseline.json`; docs.

## Validation

format:check (only the untracked mockup), lint, lint:root, typecheck, build 7/7;
`test:coverage` (live Redis/S3): api 886, web 1011, ui 298, db 17, resilience 15,
maps-2gis 82 (+6 opt-in); coverage holds (auth 99.09 % lines); Storybook auth 56/56
with axe; e2e login-return + password-reset + critical-journeys 9/9; Chromium flows on
the dev stack with mock provider client ids.

## Discovered issues

- The hydration warning seen in the Chromium run is Playwright's own `caret-color`
  injection on a screenshot taken before dev hydration — not the app.
- Mockup's login has no CAPTCHA; ADR-038 keeps it (renders only with a site key).

## Final result

Done and validated; committed and pushed on `experiments` on the owner's request (no PR yet).
