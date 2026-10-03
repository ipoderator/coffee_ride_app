# Current task — CR-198: reschedule date change re-judges the time error — DONE (committed)

Source: owner QA report `QA_REPORT_fe0b4c2_2026-10-03.md` (P3). Branch `main`. CR-196 and
CR-197's changes were present and kept untouched; all three committed together.

## Goal

«Перенести заезд»: after «Это текущее время старта — выберите другое.», picking another
date with the same time must clear (or re-judge) that error at once.

## Acceptance criteria

- Date change re-judges the pair-dependent time error (`inPast`/`unchanged`). — done.
- «Укажите новое время старта.» (time-only) is not cleared by a date change. — done.
- Regression test for the QA scenario. — done (3 cases; 2 fail on the old component).
- No visual change; no commit/push.

## Files

`apps/web/src/features/organizer/rides/{components/RescheduleRideCard.tsx,
reschedule-ride-card.test.tsx}`, `apps/web/src/stories/RescheduleRideCard.stories.tsx`;
docs: changelog, tasks, project-state.

## Validation

web typecheck + lint exit 0; web unit 767/767; Storybook `RescheduleRideCard` 7/7 (axe).

## Final result

Implemented, validated, committed and pushed (with CR-196, CR-197).
