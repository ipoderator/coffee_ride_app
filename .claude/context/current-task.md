# Current task — CR-268 — Terms, privacy and separate legal consents

Source: owner, 2026-10-15 — prompt 4 «Условия, конфиденциальность и согласия» of the
updated mockup package (`coffee-ride-auth-cloud-package.zip`; `reference/` keeps the
older prompts file and is never edited). No subagents; no commit/push/PR unless the
owner asks. Run only this stage's tests and the touched packages' typecheck; the full
suite/lint/build belongs to the final check (prompt 5).

## Goal

Full, accessible `/terms` and `/privacy`, a separate `/personal-data-consent`, explicit
consent on account creation (password and first Google/Yandex sign-in), re-consent on a
material new version, and a provable minimal audit trail — every factual statement
checked against code/infra; unknowns go to «Needs owner input».

## Requirements

- `/terms`: subject, account and age, organizer/participant rules, ride safety, user
  content, prohibitions, moderation/appeal, cancellations, third-party maps/services,
  availability, account termination, changes, applicable law, contacts.
- `/privacy`: operator and contact, subjects/categories, purposes and legal bases,
  operations and methods, sources, recipients/processors and countries, storage
  location, cookies/OAuth/CAPTCHA/email/maps/Strava/logs/backups, retention per category,
  protection, rights/requests/withdrawal/deletion, incidents, minors, version history.
- `/personal-data-consent`: a separate, plain consent document.
- Real versions and effective dates; version history.
- Register: two separate required unchecked checkboxes (terms; personal-data consent
  linking `/personal-data-consent`); CAPTCHA separate; submit disabled until both;
  errors reachable by screen readers.
- Password login: links informational only.
- New Google/Yandex user: consent step after a verified callback, before any account or
  session; OAuth PII never in a readable cookie.
- Material new version: re-consent after sign-in, without blocking documents, logout or
  account deletion.
- Audit trail: userId, document type, immutable version + hash, acceptedAt, source;
  unique/idempotent, transactional. No IP/User-Agent.
- Server-side validation (never trust the client); migrations; tests: unchecked/partial
  consent, direct API bypass, current/stale version, repeat, password/OAuth first
  login, callback replay, concurrent flow, links, mobile/a11y.

## Design (ADR-041)

- `packages/types/src/legal.ts`: the registry — documents, versions (version,
  effectiveAt, sha256 of the content, material, summary), helpers; `consents` schema.
  A web test pins each version's content to its hash (text change without a new
  version fails).
- DB `0029`: `legal_acceptances` (unique user+document+version, checks on document/
  source/hash, cascade with the user); `oauth_pending_signups` (token hash, provider
  identity, email/names, next, 10-min expiry; unique provider+account).
- API: `register` requires current `consents` and writes acceptances in the user's
  transaction; OAuth callback for a would-be-new user stores a pending signup (httpOnly
  opaque cookie) and redirects to `/register/consent`; `GET/POST/DELETE
/v1/auth/oauth-signup` (POST consumes the row single-use in one transaction with the
  account + acceptances); `POST /v1/legal/acceptances`; `GET /v1/auth/me` returns
  `legal.pending`; `requireAuth` refuses unsafe methods with `403
legal_acceptance_required` while acceptance is pending (logout and acceptance exempt).
- Web: versioned document content, `LegalDocument` with version + history,
  `/personal-data-consent`, consent checkboxes on `/register`, `/register/consent`,
  `/legal-update` + a client gate, informational links on `/login`.

## Acceptance

- [x] documents complete, every fact traceable to code/infra; unknowns listed
      (`legal-document.test.tsx` topic checklist; owner inputs below)
- [x] register refuses missing/partial/stale consents via API (`legal.routes.test.ts`,
      browser bypass check)
- [x] OAuth new user: no user/session before consent; replay/concurrency tests
      (`oauth-signup.routes.test.ts` 17, browser 200/410/410)
- [x] re-consent: pending after a material version; gate exempts docs/logout
      (`legal.routes.test.ts` material/non-material, `consent.test.tsx`, browser)
- [x] audit rows idempotent, in the creating transaction (concurrency tests, DB CHECKs)
- [x] stories (both themes) + axe for new/changed components (67/67)
- [x] stage tests + typecheck of touched packages green

## Progress

- done: types registry, migration 0029, API (register consents, OAuth park/complete/
  cancel, acceptances, `/documents`, `me.legal`, requireAuth gate, claim voids
  acceptances), web (versioned documents + history, consent fields, register,
  `/register/consent`, `/legal-update`, gate, login info line), stories, tests, docs,
  ADR-041, seed/k6/e2e callers.

## Validation results

- typecheck 8/8; lint 0 errors (new files warning-free); prettier on changed files
- api 945 passed (one earlier run right after the browser check: 66 failures from the
  shared Redis rate-limit window — re-run clean); web unit 1093; ui 307; db 17
- Storybook (auth/legal/header) 67/67 with axe; e2e login-return + critical-journeys +
  access-control 10/10; `next build` (fake site key) OK
- browser check `scratchpad/268/legal.mjs` 60/60; API log: no email/token/hash

## Discovered issues

- `/privacy` h1 overflowed at 320/390 (pre-existing since CR-247) — soft hyphen.
- the gate lost `next` when the session resolved on `/login` — `returnTarget`.
- KI-104: expired sessions/tokens/pending sign-ups never purged (policy says so).

## Final result

Implemented and validated; not committed (owner instruction for this prompt). Needs
owner input (operator details, hosting country, age, cross-border notice, incident
e-mail promise) and a lawyer's review before production.
