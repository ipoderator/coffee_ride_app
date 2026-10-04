# Current task — CR-207: Toast timers survive unmount (CI red) — DONE (committed)

Source: CI run 37189001650 (`main`, CR-206's push) failed the `ci` job while every
test passed. Triaged from the run log, not reproduced locally at first.

## Goal

Fix the root cause of `ReferenceError: window is not defined` failing
`web#test:coverage`, and cover it with a regression test.

## Diagnosis

`ToastProvider` scheduled two bare `setTimeout`s per toast (`AUTO_DISMISS_MS` then
`EXIT_MS`) and never cleared them. A toast shown shortly before the provider
unmounts fires its `setToasts` afterwards:

- in the browser — a React state update on an unmounted component;
- under jsdom — a hard `ReferenceError: window is not defined` once Vitest has torn
  the environment down, which Vitest reports as an unhandled error and exits 1 with
  **every test passing** (`Test Files 68 passed`, `Tests 772 passed`, `Errors 1`).

Timing-dependent, so it only shows on the slower CI runner: the same error already
failed run 37149360054 (`e9e0ee8`, the README commit) **before** CR-206 — not a
regression from the dependency cleanup. Origin file was
`src/features/participant/ride-detail/ride-detail.test.tsx`, but the error is
`packages/ui`'s, not that test's.

## Acceptance criteria

- Pending auto-dismiss/exit timers are cleared when `ToastProvider` unmounts.
- A test asserts it and fails on the old code (verified: `expected 1 to be +0`).
- `packages/ui` timers don't accumulate across a long-lived provider session.
- ui + web + storybook suites, typecheck, lint, format green; web coverage run
  reports no `Errors` line.

## Planned files

- `packages/ui/src/components/Toast.tsx`
- `packages/ui/src/components/Toast.test.tsx`

## Progress

- [x] root cause found from the CI log
- [x] `timers` ref + `useEffect` cleanup; `schedule()` also deletes a fired id
- [x] regression test (fails on old code, passes on new)
- [x] validation

## Validation results

- `pnpm --filter ui test` — 246 passed (was 245 + the new one), 33 files
- `pnpm --filter web test:coverage` — 68 files / 772 tests passed, **no `Errors` line**
  (the failing run had `Errors 1 error`)
- `pnpm --filter web test:storybook` — 196 passed (27 files)
- `pnpm typecheck` 8/8, `pnpm lint` 9/9, `pnpm format:check` clean
- `packages/ui` coverage: statements 99.58 % vs the 99.57 % floor, lines/functions
  100 %, branches 93.49 % — unchanged floor, no `coverage:baseline` update needed
- full `pnpm coverage:check` NOT run: it needs live Postgres/Redis/S3 and Docker
  Desktop had shut down again; without the live flags it reports false drops

## Discovered issues

1. `gh run watch --exit-status` exited 0 on a run whose `ci` job failed — the
   watch's own exit code can't be trusted; check `gh run view --json conclusion`.
2. `gh run view --log-failed` returned the api job's log, not the failing web step;
   the real failure was only in the full `--log` output.
3. Dependabot's own runs (zod, next, lucide-react, tailwind-merge) are red for the
   same reason — this fix should clear them too.

## Final result

One real defect fixed (a timer leak that also affected the browser, not just tests)
plus its regression test. CI's remaining red, if any, is unrelated to this.
