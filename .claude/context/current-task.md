# Current task — CR-168: resend email verification (closes KI-026's last real half)

## Task ID

CR-168 (new ticket; KI-026 + KI-042 revisit).

## Goal

Give a signed-in user with an unverified email a working in-app way to obtain a
fresh verification link. Today this is a genuine dead end: the screens exist
(CR-099) but nothing in the product can ever _issue_ a new token to a real
user, so a lost/undelivered first email is terminal for that account.

## What the investigation actually found

KI-026/KI-042's headline ("no `/verify-email`, `/forgot-password`,
`/reset-password` screens") is **stale** — CR-099 built all three:

- `apps/web/src/app/verify-email/page.tsx` + `features/auth/verify-email`
- `apps/web/src/app/forgot-password/page.tsx` + `features/auth/forgot-password`
- `apps/web/src/app/reset-password/page.tsx` + `features/auth/reset-password`

The remaining halves of both KIs are recorded as "waiting on ADR-007 /
`EMAIL_FROM_ADDRESS`", i.e. owner-side config. That is true for `/forgot-password`
(a user can always re-request a reset link — the flow is self-service and
complete; only delivery is unconfigured).

It is **not** the whole story for verification. There, a second, independent,
code-side gap exists and is reachable even with email delivery fully working:

- `POST /v1/auth/register` issues the one and only verification token a user
  will ever get (`auth.service.ts` `registerUser`).
- No resend endpoint exists anywhere — confirmed by `grep -rni resend` over
  `apps/api/src`, `apps/web/src`, `packages/ui/src`, `docs/api.md`: the single
  hit is `notifications.service.ts:407`, a comment that _names this gap_
  ("KI-071: ... there is no resend endpoint, so a dropped email would leave the
  account unverifiable").
- So: token expires (24h TTL), email lands in spam, user mistypes nothing at
  all and simply closes the tab — the account is permanently unverifiable, and
  `POST /v1/organizers/me` + `POST /v1/rides/:id/publish` both stay 403
  `email_verification_required` forever. Re-registering is impossible too:
  `/register` 409s `email_already_registered`.
- The UI copy already promises a resend that does not exist:
  `VERIFY_EMAIL_TERMS.invalidOrExpired` says «Запросите новую при следующем
  входе» (nothing at login does this) and
  `ORGANIZER_TERMS.emailVerificationRequired` says «Ссылка ... была отправлена
  при регистрации» (a dead end, not an action).

This is exactly the wall the user hit an hour ago, and it is fixable in code
now — unlike the delivery-config half.

## Requirements

1. `POST /v1/auth/resend-verification` — session-authenticated, no request body.
   - Identity from the verified session only (`.claude/rules/security.md`:
     never trust a client-supplied email/userId). With no email in the body
     there is **no enumeration surface at all**, so unlike
     `/forgot-password` this endpoint can answer honestly.
   - Already-verified caller → `204` (idempotent no-op, nothing issued).
   - Unverified caller → invalidate outstanding tokens, issue a fresh one,
     send/enqueue the email, `204`.
   - Rate-limited on both tiers (per-IP + per-account) like every other auth
     route. Per-account key = the session's user id, not a body field.
2. Invalidate the user's previous outstanding verification tokens when issuing
   a new one — same precedent as `resetPassword`'s token sweep, so an older
   link can't still be used after a newer one is requested.
3. Web UI: a «Отправить письмо повторно» action wherever the dead end is
   reachable —
   - `/verify-email` error states (invalid/expired/used token),
   - the organizer `email_verification_required` banners
     (`OrganizerProfileForm`, `EditRideForm` publish).
     Shown only to a signed-in user (the endpoint needs a session).
4. Fix the two misleading strings in `packages/ui/src/terminology.ts` so the
   copy matches what the product can actually do.
5. Tests: API (verified no-op, unverified issues + sweeps old, unauthenticated
   401, rate limit) + web (resend button states) + Storybook stories for any
   new/changed UI (per user's standing rule).

## Acceptance criteria

- A signed-in, unverified user can get a new verification email from the UI
  without curl/DB access.
- An expired/used verification link is recoverable in-app.
- Requesting a new link invalidates the old one.
- Unauthenticated `POST /v1/auth/resend-verification` → 401.
- Already-verified caller issues no token.
- No endpoint response differs in a way that reveals account existence.
- typecheck + lint + relevant tests + Storybook a11y pass.
- Coverage baseline not lowered.

## Planned files

- `packages/types/src/api/auth.ts` — (no new request schema needed; document
  the bodyless contract)
- `apps/api/src/modules/auth/auth.service.ts` — `resendEmailVerification`
- `apps/api/src/modules/auth/auth.routes.ts` — the route
- `apps/api/src/modules/auth/auth.routes.test.ts` — API tests
- `packages/ui/src/terminology.ts` — resend copy + the two misleading strings
- `apps/web/src/features/auth/verify-email/api.ts` + `VerifyEmailStatus.tsx`
- `apps/web/src/features/organizer/profile/components/OrganizerProfileForm.tsx`
- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`
- a shared resend component (used by all three surfaces)
- `apps/web/src/stories/*.stories.tsx`
- `docs/api.md`, `docs/changelog.md`, `docs/tasks.md`,
  `.claude/context/known-issues.md`, `project-state.md`

## Implementation progress

- [x] Investigation: confirmed screens exist; located the real gap (no resend).
- [x] API: `resendEmailVerification` + `POST /v1/auth/resend-verification` + 7 tests
- [x] Shared UI (`ResendVerificationButton`) + `RESEND_VERIFICATION_TERMS`
- [x] Wired all three surfaces; fixed the three misleading strings
- [x] 7 Storybook stories (axe a11y at `test: 'error'`)
- [x] Validation (below)
- [x] Docs/context

## Validation results

- `apps/api`: **546 passed / 0 skipped** with the full live stack up
  (Postgres + Redis + S3, `RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1`). 7 new
  resend cases.
- `apps/web` unit: **515 passed** (9 new for `ResendVerificationButton`).
- Storybook: **76 stories pass**, 7 of them new, axe at `test: 'error'`.
- typecheck + lint: green on `api`, `web`, `ui`.
- `pnpm coverage:check`: **"Coverage holds at or above the baseline."**
  `apps/api` total up on all four metrics; `modules/auth` branches +0.30 pp,
  functions +0.32 pp (lines −0.08 pp, inside the 0.1 pp tolerance). Baseline not
  regenerated — the gains are within tolerance of the existing floor.
- Live-verified in a real browser against the running dev stack: register → log
  in unverified → stale `/verify-email?token=` → «Отправить письмо повторно» →
  «Письмо отправлено…», button retires itself; same affordance on
  `/organizer/profile`'s 403 banner (screenshotted). Anonymous visitor on the
  same URL gets «Войдите в аккаунт…» instead of a dead button.
- Verified over HTTP: resend → `204`; the previous link then returns
  `verification_token_already_used`; a resend-issued token verifies the account
  (`emailVerified: true`); a second resend afterwards issues nothing. DB rows
  confirm: old row swept, exactly one fresh unused row.

## Discovered issues

1. **KI-026/KI-042's "Next action" was stale** — pointed only at
   `EMAIL_FROM_ADDRESS`/ADR-007 and missed the code-side resend gap entirely,
   which `notifications.service.ts` had been naming in a comment since CR-050.
   Corrected by appending updates to both (history left intact).
2. **`useSession()` throws without a provider**, which took down the whole
   organizer form rather than just the embedded button. Fixed by adding
   `useOptionalSession()` rather than weakening `useSession()` — `CabinetShell`
   still wants the hard guarantee. Regression-tested.
3. **Measuring coverage without the live flags gives a false ~4 pp drop** in
   `modules/notifications` (three live suites skip themselves). Exactly what
   `.claude/rules/testing.md` warns about. Additionally, the local Redis needs
   its password — `redis://:redis-dev-only@127.0.0.1:6379`, from `.env`'s
   commented line; CI's passwordless URL yields `NOAUTH` against it. Worth
   adding to the testing rules if it bites a third time.

## Final result

Done. KI-026's code-side half is closed and live-verified end to end; its only
remaining half is owner-side (`EMAIL_FROM_ADDRESS` + a network that resolves
`unisender.ru`, KI-055). KI-042 was re-checked and does not share the gap.

Committed and pushed to `main`.
