# Current task — CR-188: KI-085 follow-ups + red `main` CI — DONE (committed)

Source: the owner's list of CR-187 leftovers (KI-085 and the end-of-run «Found»),
worked through in order. Frontend + test config only — no API/schema/migration change.

## Goal / acceptance

1. A ride-workspace tab reads `GET /v1/rides/:id` once (frame only).
2. No form shows Zod's English `issue.message`; field errors are Russian.
3. `password-reset.spec.ts` passes without exporting `DATABASE_URL`.
4. Explain the 622 → 620 web test count.
5. «Обновления» doesn't hyphenate in the ride tabs on a phone.
6. KI-084 baselines + coverage baseline: unblock CI.
7. MCP connectors: not fixable from here (owner authorizes them).

## Done

1. Sections use `useRideWorkspace()` data and re-read via `refresh()`:
   `RouteUploadForm` (`route/api.ts` `routeStateOf`), `CoverImageUploadForm` (seeded),
   `useRideGroups(rideId, knownRideStatus?)`, `ParticipantTable`/`WaitlistTable`.
   Participants tab: 4 ride reads → 1. Tests: a `KI-085` case per section
   (`src/test-support/ride-workspace.tsx` = `TestRideWorkspace`).
2. `lib/forms/field-errors.ts` (`fieldErrorMessage`, `serverFieldErrorMessage`) +
   `VALIDATION_TERMS`/`RIDE_CONTACT_VALUE_ERRORS` in `packages/ui`;
   `features/organizer/rides/field-errors.ts` (`rideFieldShapeError`). Applied to 11
   forms. Tests updated from English to Russian; new draft-title case.
3. `playwright.config.ts` loads the root `.env` (env wins). Verified: fails without the
   change, passes with it.
4. 622 was recorded 15:48:54 (session 3894e8fd); `fetchOwnRide (CR-185)` (2 tests) was
   deleted 15:50 in the same session, before the 620 run. Nothing lost.
5. Real page fit at 390 px already (the report came from Storybook's narrower frame);
   it broke at 320–360. `RideWorkspaceTabs`: `@container` + `grid-cols-2
max-md:@min-[21rem]:grid-cols-3`. Measured 320…1280: every label fits.
6. CI on `main` was red: coverage gate (CR-187) + e2e screenshots (CR-185). Coverage
   raised with tests (`route-track-sketch.test.tsx`, `terminology-ride-workspace.test.ts`,
   readiness cases, field-errors tests); baseline raised for web/ui only. KI-084: six
   baselines from CI run 37022093199's actuals, every diff checked. Found the
   `route-points-stops` flake's cause (busy guard drops a click on an enabled-looking
   button) — row actions now disabled while saving.

## Validation

- web unit 651/651, ui 238/238; tsc + eslint web/ui clean; prettier clean.
- Storybook 145/145 (axe); live Storybook renders the new contact error string.
- e2e chromium 40/40 (twice, no `DATABASE_URL` exported); mobile functional 3/3;
  `route-points-stops` 16/16 with `--repeat-each 8` (unchanged code: 10/12).
- coverage: web 79.00/77.49/77.09/77.51, ui 100/99.56/100/93.32 — at/above the floor.

## Open

- KI-084 closes after the next CI run is green.
- KI-086: sidebar highlight on participants/updates tabs — owner decision.
- MCP connectors (claude.ai Strava/Supabase, plugin GitHub/Linear/Slack…) need the
  owner to authorize them (claude.ai connector settings / `/mcp`).
