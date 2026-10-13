# Current task — CR-246 — Strava sync: cancel, expired state, retry copy (production QA)

Source: owner, 2026-10-13 (chat) — production QA of the Strava sync (CR-234).

## Goal / acceptance

1. «Отменить» on Strava's consent screen → «Подключение Strava отменено» (not «Strava не дала доступ…»).
2. After a return from Strava the card makes clear Strava is not connected and offers «Проверить поездку снова».
3. Broken/expired `state` → visible toast; back to the original ride when safe.
4. Positive «Проверено Strava» — QA data (no bike activity near the test ride); not a code defect.

## Result

Done on `fix/strava-sync-qa` — see `docs/changelog.md` (CR-246). Validation there.
Deployed 2026-10-13 (`784755a`, PR #48) — see the changelog's «CR-246 deployed».
