# Current task

**CR-133 — CR-132 follow-ups: e2e home spec, dashboard read de-dup, auth rate limit for e2e, organizer back links, tab-bar decision**

(CR-132 is complete and recorded in `docs/changelog.md`/`docs/tasks.md`; still
uncommitted together with this task.)

## Goal

Close the follow-ups CR-132's run reported.

## Requirements / acceptance criteria

- [x] KI-067: `apps/web/e2e/home.spec.ts` checks the default grid view on `/`
      and the map view on `/?view=map`.
- [x] KI-066 (duplication part): concurrent identical organizer-cabinet GETs
      (`/rides/mine`, a ride's participants/waitlist) share one request —
      in-flight de-dup in `lib/organizer/own-rides.ts`, no TTL cache (no
      staleness after mutations). Aggregate endpoint stays the next action.
- [x] KI-014 note: optional `AUTH_RATE_LIMIT_MAX` (apps/api env, rejected in
      production) raises both auth tiers; Playwright's API server sets it so
      back-to-back e2e runs don't hit 429.
- [x] `/organizer/rides`, `/organizer/profile`: no «В кабинет организатора»
      back link (sidebar sections, not nested screens); design §8 rule refined;
      unused `BACK_LINK_TERMS.toOrganizerCabinet` removed.
- [x] Owner decision: mobile bottom tab bar and the shared header's hamburger
      panel coexist — design §8 + ADR-024 amendment.
- [x] participantLimit "not saved": not an app bug — `POST /v1/rides` accepts
      only title/bicycleType/startsAt/startTimezone (CR-017); capacity is a
      `PATCH` on the draft; unknown keys are stripped by Zod.

## Planned files

- `apps/web/e2e/home.spec.ts`
- `apps/web/src/lib/organizer/own-rides.ts` (+test) — subagent
- `apps/api/src/env.ts`, `modules/auth/auth.routes.ts` (+tests),
  `apps/web/playwright.config.ts`, `.env.example` — subagent
- `apps/web/src/app/organizer/{rides,profile}/page.tsx`, `packages/ui/src/terminology.ts`
- docs: design §8, decisions (ADR-024 amendment), changelog, tasks, known-issues,
  project-state

## Progress

- [x] own items (e2e spec, back links, decision docs)
- [x] subagent work reviewed (overview widget fixed on top: it awaited the
      profile before its ride reads, so it missed the shared requests)
- [x] validation
- [x] docs

## Validation results

- web 391/391, ui 152/152; api `env` + `auth.routes` 49/49 with live Redis
  (subagent: full api suite 438 passed / 4 skipped on rerun — first run hit an
  FK violation in `auth.routes.test.ts`'s `DELETE FROM users` from a parallel
  test file's rides; not reproduced).
- web/ui/api typecheck + lint clean; prettier clean on touched files.
- e2e 5/5 against the dev stack.
- Live `/organizer` request count (temporary spec, deleted): `/rides/mine` ×1,
  nearest participants ×1, waitlist ×1; `organizers/me`/`mine/summary` ×2 only
  from dev StrictMode.

## Final result

Done; docs updated (changelog, tasks, design §8, ADR-024 amendment,
known-issues: KI-067 archived, KI-066/KI-014 updated, project-state).
