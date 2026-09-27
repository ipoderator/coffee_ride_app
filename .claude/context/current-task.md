# Current task

**CR-142 — Notification fallback while Redis is down (KI-071)**

Status: complete, not committed.

## Goal

With `REDIS_URL` configured but Redis unreachable, notifications are no longer
silently dropped: a job that provably never reached Redis is delivered directly,
the same way the no-Redis configuration already does.

## Decision (product/resilience call, made in this task)

- The queue's `add()` throws `NotificationQueueUnavailableError` only when it
  rejected **before** touching Redis (circuit open, connection not `ready`) — the
  job certainly was not queued, so direct delivery cannot duplicate it.
- Any other enqueue failure (timeout, error mid-command) may have landed in Redis:
  log only, no fallback (a duplicate is worse than the known, logged gap).
- Fallback applies to in-app rows (`registration_confirmed`, `ride_update`,
  `ride_cancelled`) and the verification email (there is no resend endpoint, and
  `/register` already answers 409 for a taken email, so send latency reveals
  nothing new).
- The password-reset email stays queued-only: a direct Unisender send only for
  real accounts would make `/forgot-password`'s latency an account-existence
  oracle; the user can re-request once Redis is back.

## Acceptance criteria

- [x] `queue.ts` throws `NotificationQueueUnavailableError` for circuit-open and
      not-connected; other failures unchanged.
- [x] Producers fall back per the decision above; everything still log-and-swallow.
- [x] Unit tests: fallback on unavailable, no fallback on other errors, reset email
      never sent directly; queue.test asserts the error class.
- [x] `degraded-dependencies.test.ts`: with Redis down, the rider's inbox has the
      `registration_confirmed` notification.
- [x] Typecheck/lint/tests pass; docs (KI-071 archived, changelog, tasks, state).

## Progress / validation

- Service/queue/degraded tests + registrations/auth/rides suites: 331/331
  (TEST_DATABASE_URL from `.env`); live Redis notification suites 33/33.
- Mutation check: degraded test fails with the old plain-`Error` queue.ts.
- apps/api typecheck, eslint, prettier clean.
- Docs: KI-071 archived, changelog, tasks, project-state, resilience.md.
