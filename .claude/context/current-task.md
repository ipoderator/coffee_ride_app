# Current task — CR-253..CR-258 — fix the Lictor security-audit findings

Source: owner, 2026-10-14 ("нужно исправить все выявленные ошибки") after the first
`lictor-security-check` (CR-252, local `SECURITY-AUDIT.md`). Branch
`fix/security-audit-findings` (worktree `../coffeeride-security`).

## Scope (audit item → CR)

- 1.1 MEDIUM → CR-253: register/waitlist need a verified email; web banner + resend.
- 1.2 LOW → CR-254: reviews of an admin-hidden ride 404 for non-owners; no `userId`.
- 1.3 LOW → CR-255: per-user upload tier (10/min) on cover/GPX/avatar POST/PATCH.
- 1.4 LOW → CR-256: auth events (register/verify/login/google/reset/logout) logged
  with the user id.
- 1.6 LOW (KI-099) → CR-257: logout clears `__Host-session` with `Secure`.
- 1.5 LOW → CR-258: Dockerfile base images pinned by digest.
- Not fixed here: KI-097 (nonce CSP — needs the owner's ADR call), KI-095 (no upstream
  patch), the 2GIS key's domain restriction (owner, 2GIS cabinet).

## Acceptance

Each fix with a test through the real Fastify pipeline (or a component test + story
for the web banner); api/web/ui coverage gate holds; typecheck, lint, format, build.

## Validation results

- `pnpm test:coverage` (live Redis/S3, `coffee_ride_test`) green; `pnpm coverage:check`
  holds (reviews +0.18, plugins +1.12, lib +0.46, web +0.52).
- typecheck 8/8, `lint:root` + `lint` 9/9, `format:check`, `build` 7/7.
- Storybook 298/303: the 5 failures (AdminOverview, CabinetSectionTabs) also fail on
  clean `main` → KI-100. New `RegistrationTicket/EmailVerificationRequired` passes.
- Live upload-tier test ran (not skipped) against local Redis.
- Not run locally: Playwright e2e (CI), Docker image build (CI `docker-smoke`).

## Final result

Done on `fix/security-audit-findings`; PR into `main`.
