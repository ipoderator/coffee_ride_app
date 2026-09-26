# Current task

**CR-135 — Expand critical E2E journeys (P1)**

Status: complete, committed.

## Goal

Playwright coverage for the journeys `apps/web/e2e/critical-journeys.spec.ts`
(CR-092) doesn't reach: waitlist promotion, pace groups, the full ride
lifecycle, access control, password reset, profile visibility, notifications.

## Requirements / acceptance criteria

- [x] Cancelling a registration (UI) promotes the _first_ waitlisted rider;
      the second stays waitlisted.
- [x] Choosing a pace group on register and changing it afterwards (UI).
- [x] A ride with groups can't be registered without a group (button disabled + hint; API `422 group_required`).
- [x] Lifecycle through the organizer UI: draft → published → registration
      open → closed → started → finished; and a cancel path (confirm dialog).
      Public page shows the resulting status.
- [x] Access control: a participant can't change another organizer's ride,
      can't read/manage its participants or groups, can't see private data
      (API rejections + UI error states + ride unchanged afterwards).
- [x] Password reset through the UI: forgot-password form, reset page, login
      with the new password, old password rejected, link single-use.
- [x] Profile visibility (open / co_participants / closed) set through
      `/me/profile`, checked from a co-participant's and an outsider's view.
- [x] Notifications: ride update and ride cancellation reach a participant's
      inbox; opening one marks it read.
- [x] Specs pass locally (`pnpm test:e2e`), lint + typecheck clean.

## Planned files

- `apps/web/e2e/helpers/api-fixtures.ts` (extend), `helpers/db-fixtures.ts`
  (new — reset-token seed; no API channel exposes the raw token),
  `helpers/ui.ts` (new — shared UI login / actor contexts)
- `apps/web/e2e/{registration-waitlist,pace-groups,ride-lifecycle,
access-control,password-reset,profile-visibility,notifications}.spec.ts`
- `apps/web/package.json` (`postgres` devDependency for the DB seed)
- `apps/api/src/{env.ts,env.test.ts,app.ts}`, `apps/web/playwright.config.ts`,
  `.env.example` — `RATE_LIMIT_MAX` (the suite outgrew the global 100/min/IP)
- context/docs updates

## Progress

- Context read; UI/API surfaces mapped; helpers + 7 specs written.
- Fixed along the way: global rate limit 429 (→ `RATE_LIMIT_MAX`), CR-092
  discover ride pushed off page 1 of `/` (→ starts in 1 h), fixture
  assumptions (`groups` is top-level in `GET /v1/rides/:id`; organizer
  participant list has no phone by design).

## Validation

- `playwright test`: 17/17 — twice in parallel (API without Redis), then with a
  Redis-backed API with 1 worker and in parallel. Run against an isolated API
  on :4100 (`API_INTERNAL_URL`), not the running dev API on :4000.
- `turbo lint typecheck --filter=web --filter=api`: 17/17 tasks.
- api vitest: 440 passed / 4 skipped, twice. One earlier run just after a
  Docker Desktop restart had 14 failures in one file; not reproduced.

## Discovered issues

- `/organizer/rides/[id]/edit` loads via the public `GET /v1/rides/:id`, so a
  non-owner sees the edit form + lifecycle buttons for any non-draft ride; the
  server rejects every action. UX gap, not an authz hole → KI-069.
- KI-014 closed (Redis queue → Worker → notification row exercised).
