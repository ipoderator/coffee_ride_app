# Current task — CR-234 — «Синхронизировать со Strava»: finish verified by a Strava activity

Source: owner, 2026-10-11 (chat). Status: **done — committed to `main` (2026-10-12).**
Previous task (CR-228..CR-233, admin panel) is merged/deployed and recorded in
`project-state.md`/changelog.

## Owner decisions (2026-10-11)

- Effect of a match: sets the participant's finish **claim** + a «проверено Strava»
  mark; the organizer still decides `attendance` (ADR-027 unchanged).
- Matching: time window + bike sport type (not `VirtualRide`) + the activity's track
  covers the ride's route (≥70% of route points within 200 m).
- Organizer sees only the mark «Strava ✓» — no km/time/track from Strava is shown to
  anyone but the participant, or stored (Strava API Agreement: a user's data is shown
  only to that user).

## Verified environment (2026-10-11)

- Strava app: Client ID `286429`, secret in `.env` (`STRAVA_CLIENT_ID/SECRET`), pair
  accepted by `POST /oauth/token`; callback domain currently `localhost`.
- `www.strava.com` reachable from the prod VPS (HTTP 401 unauthenticated, 0.13 s).
- New Strava apps: athlete capacity 1 until Strava reviews the app (owner-side).

## Plan (proposed)

One-shot OAuth, **no stored Strava tokens**:

1. `POST /v1/rides/:id/strava-sync` (auth, active registration, ride `started`/
   `finished`) → `{ authorizeUrl }` with `scope=activity:read`, `state` = HMAC-signed
   (key derived from `AUTH_SECRET`) `{userId, rideId, exp 10 min, nonce}`.
2. `GET /v1/strava/callback?code&state` → verify state against the session user →
   exchange code (no retry) → list activities in the window → match → write result →
   deauthorize the token (frees Strava athlete capacity) → 303 to
   `/rides/:id?strava=verified|no_match|denied|unavailable`.
3. Module `apps/api/src/modules/strava/` (client with `callWithResilience` + own
   breaker, `StravaUnavailableError`; pure `match.ts` with polyline decode + coverage);
   env `STRAVA_CLIENT_ID/SECRET` optional — absent = feature off (button hidden).
4. Migration `0027`: `registrations.strava_verified_at timestamptz`,
   `strava_activity_id bigint`, both-or-neither check. Withdrawing the claim clears it.
5. Contracts: own registration gets `stravaVerifiedAt` + `stravaActivityId` (own link
   «Открыть в Strava»); organizer participants list gets `stravaVerified: boolean`.
6. Web: button «Синхронизировать со Strava» in `FinishCheckIn` (before and after a
   claim), result toast from `?strava=`, «Strava ✓» badge in `ParticipantTable` and
   live-rides; terminology strings; stories.
7. ADR-033 (Strava integration: one-shot OAuth, no token storage, data visibility).

## Acceptance criteria

- A participant with a matching Strava ride gets claim + mark; organizer sees «Strava ✓».
- No Strava token persists anywhere (DB, Redis, logs).
- Forged/expired/foreign `state` → no write; Strava down → clear message, no 500.
- Feature disabled cleanly without env vars.
- Unit tests for matching/state; route tests with a mocked Strava client; storybook.

## Progress

- [x] approval (owner, 2026-10-11) → implemented as planned. Review change: the callback
      exchanges the code before the gate checks so every path revokes the grant.

## Validation

- api 702/702 on disposable `coffee_ride_test` (dev data untouched); Strava: 41 tests.
- web unit 895+ (ride-detail 129), ui 267; Storybook touched stories 43/43 (axe).
- `test:coverage` + `coverage:check` green with live Redis/S3; baseline raised,
  new scope `src/modules/strava/` (96.4 % lines).
- typecheck, lint (29 pre-existing warnings, 0 new), `format:check` (only ignored
  `brag-output/`), api build, `next build --webpack` in a temp copy, prod compose config.
- Dev stack: real Strava accepts the redirect URI; bogus code → `error`; cancel →
  `denied`; foreign session → `/me/rides?strava=error`; headless browser: button,
  consent redirect, toast + param removal.
- Not run: e2e (no spec covers check-in; CI has no Strava env), docker smoke.
- Post-validation stream fallback: owner's live retry 2026-10-11 17:07 → `verified`
  (2 candidates, 1 track via streams, coverage 1.0, activity 20375864969).
- Strava brand (owner request): official «Connect with Strava» orange button
  (`StravaConnectMark.tsx`, SVG verbatim from developers.strava.com 1.1 zip) replaces
  the text button; activity link reads «View on Strava» (guidelines §3). ride-detail
  129/129, ui terminology 78/78, RegistrationTicket stories 14/14 (axe), web/ui
  typecheck + lint (0 errors; 1 justified `no-restricted-syntax` disable for
  `#FC5200`), screenshots 390 light/dark + 1440 checked in Storybook.
- «Проверено Strava» in Strava's brand style (owner request): tokens `strava`
  (#FC5200) / `strava-text` (light #AD3C00, dark #FF6A26, AA incl. the tint),
  shared `ui` `StravaVerifiedBadge` (ticket + organizer participant list), orange
  text in the live widget, «View on Strava» link in `strava-text`, official «Powered
  by Strava» logo (`StravaPoweredByMark.tsx`, orange/white by theme) under it.
  web unit 904/904, ui 268/268, Storybook RegistrationTicket/Badge/LiveRidesWidget/
  RideWorkspaceSections 50/50 (axe), web/ui typecheck + lint (0 errors), screenshots.
- Still to re-run before commit: api suite, `test:coverage` + `coverage:check`.

## Final result

Done. Acceptance criteria met: match → claim + mark (route test «verifies a matching
ride»); no token persisted (service holds it in a local, revoked in `finally`; route
logs at `warn`); forged/expired/foreign state → no write (route test); Strava down →
`unavailable` redirect (route + client tests); disabled without env (status/503 tests).
Discovered: admin stories' axe failure (pre-existing, project-state "In progress").

## Side fix (owner request, 2026-10-11) — header on one line

`AppHeader`: the centred 24px wordmark's baseline sat 3.8px below the 16px nav
labels/account menu (measured 45.4 vs 41.6px at 1700px). Fix: `md:-translate-y-[0.16em]`
on the `Wordmark`. New `src/stories/AppHeader.stories.tsx` (signed-in light/dark, guest)
asserts every label's baseline equals the wordmark's (±0.75px) — fails with 3.81px
without the fix, 3/3 with it. web typecheck/lint 0 errors, site unit 21/21.
