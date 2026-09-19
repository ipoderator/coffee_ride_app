# Current task

## Task ID

CR-092 — Real critical-journey Playwright specs (`docs/tasks.md`).

## Goal

Write the three e2e journeys `.claude/rules/testing.md` names: participant
discovers+registers, organizer creates+publishes a ride, organizer views
participants. `home.spec.ts` is a one-page smoke check, not this.

## Decision

- New `apps/web/e2e/helpers/api-fixtures.ts`: `registerAndVerify`/`login`/
  `createOrganizerProfile`/`createPublishedRide`/`registerForRide`/
  `setDisplayName`, direct `/api/v1/...` calls with the CSRF `Origin`
  header (Playwright's `APIRequestContext` doesn't send one automatically
  the way a real browser fetch does). Every call asserts a 2xx response
  (`assertOk`) so a setup failure (e.g. hitting the shared auth rate limit)
  surfaces clearly instead of a downstream `undefined` crash.
- New `apps/web/e2e/critical-journeys.spec.ts`: the three journeys, each
  seeding only its own preconditions via the helpers above and driving the
  actually-tested journey through real UI interaction (fill forms, click
  buttons, assert rendered state).
- `test.describe.configure({ mode: 'serial' })` on the whole file:
  `/v1/auth/register`/`/v1/auth/login` each carry a 5/min/IP in-memory rate
  limit (KI-014's interim tier); the three journeys together need exactly 5
  of each (spec 3 reuses `page.request`'s already-logged-in organizer
  cookie instead of a redundant second UI login for the same identity).
- No new ADR — test-suite work.

## Bugs found and fixed while writing these

- `loginViaUi` originally clicked login's submit button and immediately
  called `page.goto(...)` — raced `LoginForm`'s own `await login(...)`, and
  the hard navigation could cancel that in-flight fetch before the session
  cookie was ever set. Fixed with `page.waitForURL('/me')` after the click.
- Fixture calls had no failure check — a rate-limited/failed setup call
  surfaced several lines downstream as `Cannot read properties of
undefined`. Fixed with `assertOk()`.
- Unrelated to this ticket: a stale `apps/web/.next/types` artifact from an
  earlier session's production build made `web#typecheck` fail on files
  that no longer existed. `rm -rf apps/web/.next` fixed it (Next
  regenerates on the next dev/build/typecheck run) — not caused by this
  ticket's changes, confirmed by the error referencing routes untouched
  here.

## Validation results

- `pnpm --filter web typecheck`/`lint`: clean.
- `pnpm turbo run test:e2e`: 4/4 passing (`home.spec.ts` + the 3 new
  journeys), run twice to confirm no flakiness once outside the
  rate-limit collision window (one back-to-back manual rerun within the
  same ~60s did trip the shared limit once during development — expected
  given exactly 5 of each per run, not a bug; a real CI run only executes
  the suite once).
- Full `pnpm turbo run lint typecheck build test` (real local
  `DATABASE_URL`): 29/29 tasks green.

## Final result

CR-092 closed. Every ticket in `docs/tasks.md` is now checked off or
explicitly blocked (CR-058 on KI-014/live Redis) — no open, actionable
ticket remains. `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md` all updated.
