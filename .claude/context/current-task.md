# Current task — CR-244 — password-reset email never arrives (production QA, high)

Source: owner, 2026-10-12 (chat) — production QA: an existing verified test account,
`/forgot-password` showed «ссылка отправлена», no email after several minutes; a Gmail
search for every message from `noreply@coffeeride.site` finds only the registration
verification email.

Previous task (CR-235..CR-243) is recorded in `docs/changelog.md`.

## Goal

Find why production accepts the reset request (UI success = API `204`) but no email is
delivered, and fix the root cause.

## Acceptance

- A reset requested for a real account on coffeeride.site arrives in the inbox.
- If the drop is in our code path, a test covers it; if it is external (Unisender,
  Gmail), it is recorded with evidence.

## Findings so far (local code read, no production access yet)

- Web: `ForgotPasswordForm` shows success only on a 2xx → the API answered `204`.
- Schema normalizes the email (`trim().toLowerCase()`), so lookup/recipient are fine.
- Both emails share `sendEmail` → `UnisenderEmailProvider.send` (same `track_links: 0`).
- The one asymmetry: `sendVerificationEmail` falls back to a direct send on
  `NotificationQueueUnavailableError` (producer Redis not `ready` / enqueue breaker
  open); `sendPasswordResetEmail` does not (KI-071/CR-142 decision: no latency
  oracle) — the email is dropped with only `logger.error('Failed to send password
reset email')`.
- Other drop points, each logged: enqueue timeout (same log line); worker job failing
  3× (`reportError` 'Notification job failed after exhausting retries', e.g. a
  Unisender refusal `code 903`/`failed_emails`); Unisender accepted but Gmail filed it
  in Spam (Gmail "All Mail" excludes Spam/Trash).

## Production evidence (read-only, owner-approved, 2026-10-12 18:35 UTC)

- No `Failed to send password reset email`, no `Notification job failed` in `api` logs;
  BullMQ `notifications` queue empty (wait 0, failed 0), worker connected.
- The QA account is `bca7bed1` (gmail), registered 18:12:30, verified 18:13:28
  (job 27 `verification_email` completed). Its stored address is a Gmail plus alias
  (`<13 chars>+<22 chars>@gmail.com`), normalized (lowercase, trimmed).
- The two `/forgot-password` requests from the same IP (18:15:49, 18:16:28 UTC) got
  `204` in 5–14 ms, but **no `password_reset_tokens` row and no job** were created →
  `requestPasswordReset` returned `userFound: false`: the typed address did not equal
  the stored one (most likely the base address without `+…`; Gmail delivers both to
  one inbox, so the verification email still shows in the search).
- Control: the same IP's 16:44 UTC request for another account (`6f88223b`, yandex)
  created a token and job 24 `password_reset_email`, completed in 265 ms (Unisender
  answered `success`).
- Conclusion: no defect in the send path; `204` without an email for an unknown
  address is the required no-enumeration behavior (`security.md`, do-not-break).

## Next step

QA repeats the reset with the exact registered address (with the `+…` part). Owner
call (product): optionally email an unknown address "no account for this email"
instead of silence.

## Validation

No code changed. Production checked read-only (logs, DB rows, Redis queue state).

## Final result (CR-244)

No defect — see `docs/changelog.md`. Waiting on the QA's retry with the exact address.

# CR-245 — the emailed verification link keeps `next` (KI-089)

Source: owner, 2026-10-12 — production QA (high): `/me/rides` → register → verify from
the email → «Перейти ко входу» goes to plain `/login`. «Проверяй локально».

- Acceptance: the emailed link carries a safe `next`; after verifying and signing in the
  user lands on the start page; an unsafe `next` never reaches the link nor blocks
  registration.
- Done: optional `next` on `registerRequestSchema`; `safeNextPath` + href builders
  moved to `packages/types/src/next-path.ts` (web re-exports); `/register` builds the
  emailed link with `verifyEmailHref`; `RegisterForm` sends the safe `next`.
- Validation: api auth+notifications 90/90 (5 skipped) on `coffee_ride_test`; web unit
  auth 94/94; web coverage 84.54 % ≥ 84.00; Storybook `EmailVerification` 8/8;
  tsc/eslint/prettier clean; browser run against a local Unisender stub:
  `/me/rides` → … → `/me/rides`.
- Incident: the first api test run used `.env`'s `TEST_DATABASE_URL` (= dev DB, only
  docker Postgres on :5432) and emptied dev data; re-seeded (`seed:demo --no-routes`).
- Final result: done on `fix/verify-email-next`, committed.
