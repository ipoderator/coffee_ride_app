# Current task

## Task ID

CR-083 — Idempotency for `POST /v1/rides/:id/register` (`docs/tasks.md`
"Contract & model follow-ups").

## Goal

A network retry of an already-successful register/waitlist-join call must
not surface as an error to the caller. Ticket text: "the DB constraint is
the backstop, not the design" — today it's the opposite.

## Investigation

- `registrations.service.ts`'s `createRegistration` already atomically
  prevents a _second row_ (the `SELECT ... FOR UPDATE` row lock +
  `existingActive` check + the DB-level partial unique index backstop,
  CR-034/035) — that invariant is correct and untouched by this ticket.
  The actual gap: when a retry of the exact same (rideId, userId) register
  call lands after the first one already committed, the _client_ gets back
  `409 registration_already_exists` — indistinguishable, from the client's
  perspective, from "you tried to double-register." `joinWaitlist` has the
  identical shape for its own `existingWaiting` check
  (`409 waitlist_entry_already_exists`).
- Checked `apps/web/src/features/participant/ride-detail/`: `RegistrationButton`'s
  `isPending` guard only stops a second _click_ while the first request is
  in flight — it does nothing for a genuine network-level retry (the
  original request actually succeeded server-side, but the response never
  reached the client, e.g. a dropped connection). Today that shows the
  user a generic error (`RIDE_DETAIL_TERMS.registrationActionError`) despite
  them actually being registered — the real, concrete bug this ticket is
  about, not a theoretical one.
- Confirmed `joinWaitlist` has _two_ different "already" checks that must
  NOT be treated the same way: `existingActive` (caller already has an
  active registration — a genuine conflict, "register/cancel instead," not
  a retry of the waitlist-join call) must stay a `409
registration_already_exists` error. Only `existingWaiting` (caller
  already has a `waiting` entry — the literal same action being retried)
  is the idempotency case.
- `apps/web`'s `registerForRide`/`joinRideWaitlist`/`cancelRideRegistration`
  clients (`ride-detail/api.ts`) branch on `response.ok` (2xx), not on the
  exact status code — so returning `200` instead of `409` for the
  idempotent-replay case requires **zero** frontend changes and directly
  fixes `RegistrationButton`'s latent retry-shows-an-error bug for free.
  Verified by reading the client code, not assumed.
- Only 2 of the existing tests in `registrations.routes.test.ts` assert the
  old error-on-retry behavior for the exact cases this ticket changes:
  "rejects a duplicate active registration with 409
  registration_already_exists" (register) and "rejects a duplicate waiting
  entry with 409 waitlist_entry_already_exists" (waitlist). A third test
  ("rejects joining while already actively registered with 409
  registration_already_exists") and a fourth (the rejoin-after-promotion
  assertion inside the auto-promotion test) both hit the _different_,
  still-an-error `existingActive`-inside-`joinWaitlist` conflict — verified
  these stay unchanged.

## Decision

- `registrations.service.ts`:
  - `createRegistration` now returns `{ registration, created: boolean }`.
    When `existingActive` is found, return the existing row with
    `created: false` instead of throwing `REGISTRATION_ALREADY_EXISTS()` —
    same lock, same read, just a different outcome on the branch that used
    to throw. The `registration_confirmed` notification only fires when
    `created` is `true` (a retry must not fan out a second notification for
    an action that already notified once).
  - `joinWaitlist` now returns `{ waitlistEntry, created: boolean }`. Same
    shape for its `existingWaiting` branch. Its `existingActive` branch is
    untouched — still throws `REGISTRATION_ALREADY_EXISTS()`, a real
    conflict, not a retry.
  - `existingActive`'s query widened from `select({ id: ... })` to a full
    row select (needed to return it); same change for
    `existingWaiting`.
- `registrations.routes.ts`: both `POST` handlers reply `201` when
  `created` is `true`, `200` when `false` (idempotent replay of an existing
  resource) — both status codes added to each route's Zod response schema.
- `docs/api.md`: documents the `200`-on-idempotent-replay behavior for both
  endpoints; `POST .../register`'s `409 registration_already_exists` line
  removed (no longer a possible outcome); `POST .../waitlist`'s
  `409 registration_already_exists` line kept (still real, cross-resource
  conflict), its `409 waitlist_entry_already_exists` line replaced with the
  idempotent-`200` behavior.
- Update the 2 tests whose asserted behavior actually changes; add new
  assertions that a retry returns the _same_ row id and does not fan out a
  second notification (regression coverage per `.claude/rules/testing.md`:
  "every bug fix should add regression coverage").
- No new ADR, no migration — behavior-only change inside the existing
  transaction/lock structure; the DB-level invariants
  (`.claude/rules/database.md`) are unchanged.

## Requirements / acceptance criteria

- A repeat `POST /v1/rides/:id/register` while already actively registered
  returns `200` with the existing registration, not `409`.
- A repeat `POST /v1/rides/:id/waitlist` while already waiting returns
  `200` with the existing entry, not `409`.
- `POST .../waitlist` while actively registered (the real conflict) still
  returns `409 registration_already_exists`, unchanged.
- No duplicate row is ever created (unchanged invariant — same lock +
  unique index).
- No duplicate `registration_confirmed` notification is created for a
  retried register call.
- Relevant tests/typecheck/lint pass; `docs/api.md` reflects the new
  contract.

## Planned files

- `apps/api/src/modules/registrations/registrations.service.ts`
- `apps/api/src/modules/registrations/registrations.routes.ts`
- `apps/api/src/modules/registrations/registrations.routes.test.ts`
- `docs/api.md`
- `docs/tasks.md`
- `docs/changelog.md`, `.claude/context/project-state.md`

## Implementation progress

- [x] `registrations.service.ts` (`createRegistration`/`joinWaitlist`)
- [x] `registrations.routes.ts` (status code branching + response schemas)
- [x] Test updates + new regression coverage
- [x] `docs/api.md`
- [x] Validation (typecheck/lint/test)
- [x] Docs/context updated, `git diff` reviewed

## Validation results

- `pnpm --filter api typecheck`/`lint`: clean (one expected
  `no-unused-vars` error after the fix — the now-unreachable
  `WAITLIST_ENTRY_ALREADY_EXISTS` factory — removed, then clean).
- `vitest run src/modules/registrations/registrations.routes.test.ts`:
  38/38 pass, including the two rewritten idempotency tests (same row id
  on retry, `registrationsCount`/waitlist count stay at 1, exactly one
  `registration_confirmed` notification).
- `pnpm turbo run lint typecheck build test --filter='!web'` (real local
  `DATABASE_URL`): 25/25 tasks green, 305 passed + 1 skipped — same total
  as before this ticket (two tests rewritten in place, not added).
  `apps/web` untouched, no rebuild needed (no web changes).

## Discovered issues

None beyond what Investigation already covered.

## Final result

CR-083 closed. `createRegistration`/`joinWaitlist` now return
`{ resource, created }`; a repeat register/waitlist-join call for a row
that already exists returns `200` with that existing row instead of `409`,
with no duplicate row and no duplicate notification. The _other_
"already registered" conflict inside `joinWaitlist` (blocks joining the
waitlist while actively registered) is untouched, still an error — verified
its two tests still pass unchanged. `apps/web` needed zero changes (its
clients already branch on `response.ok`), which also fixes a real latent
UX bug (`RegistrationButton` showing a spurious error after a lost-response
retry) as a side effect. `docs/api.md`, `docs/tasks.md`,
`docs/changelog.md`, `.claude/context/project-state.md` all updated. Next
logical task: CR-092 (critical-journey e2e specs) — the one remaining open
ticket not blocked on anything unavailable in this environment.
