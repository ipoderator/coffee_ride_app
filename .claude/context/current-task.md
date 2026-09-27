# Current task

## CR-143 — Edit-screen ownership check (KI-069) + MapGL-key test isolation (KI-070)

Status: complete, not committed.

### Goal

Two small open known-issues, taken together: (1) a non-owner viewing a published
ride's edit screen sees the form/lifecycle buttons instead of not-found; (2)
`ride-detail.test.tsx` fails when the shell has sourced a real MapGL key.

### Acceptance criteria

- [x] `GetRideResponse` gains additive `isOwner: boolean` (`packages/types`),
      server-computed from the verified session only.
- [x] `rides.routes.ts`/`rides.service.ts` return it; `rides.routes.test.ts`
      asserts it for the owner and a stranger-session view of a published ride.
- [x] `EditRideForm` shows its not-found state when `isOwner` is `false`; web
      test covers it (mutation-checked: fails against the old code).
- [x] `e2e/access-control.spec.ts` tightened to assert not-found + no lifecycle
      button (previously accepted either outcome).
- [x] `ride-detail.test.tsx` stubs `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` itself;
      verified passing with the real key exported.
- [x] Typecheck/lint/format/tests pass; docs (KI-069/KI-070 archived,
      changelog, tasks, project-state, docs/api.md).

### Progress / validation

- apps/api: 457/457 (incl. new/extended `rides.routes.test.ts` cases).
- apps/web: 421/421 (incl. new `rides.test.tsx`/updated `ride-detail.test.tsx`
  cases); also ran with the real MapGL key sourced (50/50 in that file).
- Mutation checks: reverting `EditRideForm`'s gate fails the new web test;
  reverting `queue.ts`'s error type (CR-142, prior task) failed the degraded
  test — unrelated, confirms the pattern held across both tasks.
- Typecheck (api, web, packages/types) and eslint/prettier (same three) clean.
- Docs: KI-069/KI-070 archived with resolutions, changelog (CR-143), tasks,
  project-state, `docs/api.md`'s `GET /v1/rides/:id` section.
