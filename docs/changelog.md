# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## 2026-10-12 — CR-240 — `AppHeader` phone menu is a modal layer

Summary: production browser QA item 6. The below-`lg` panel was a bare disclosure: Escape did nothing, focus stayed on the toggle, the page behind stayed in the Tab order and the accessibility tree, a tap outside didn't close it, and widening past the breakpoint left it "open". Now opening moves focus to the first item and makes everything outside the header `inert` (`lib/site/inert-outside.ts`); Escape closes it and returns focus to the toggle; a tap outside or reaching `lg` closes it and restores the page.
Contract: none.
Files: `apps/web/src/components/site/{AppHeader.tsx,AppHeader.test.tsx}`, new `apps/web/src/lib/site/inert-outside.ts`, `apps/web/src/stories/AppHeader.stories.tsx`.
Validation: see CR-243.
Decisions: the header itself stays live (toggle, theme control); `inert` attribute, not property (jsdom).
Follow-up: none.

## 2026-10-12 — CR-241 — No sideways overflow at 320–1023 px

Summary: production browser QA item 7, Playwright audit at 320/390/768/989/1024. The filter chips and the cabinet section tabs scroll sideways with a hidden scrollbar: the filters faded a fixed right 15 % (last chip and a focused one stayed washed out), the tabs were cut hard. Shared `lib/site/scroll-row.ts` fades only an edge that hides content and scrolls a focused child clear of it. `AppHeader`'s full bar needed ~1000 px but started at `md` (768–1023 overflowed by up to 257 px): it now starts at `lg`, the account email truncates (full in the menu header). `OrganizerHeader`'s wordmark is 22 px below `sm` (320 px overflowed by 9 px).
Contract: `ui` `NavMenu` gains optional `header` (CR-243).
Files: `apps/web/src/lib/site/scroll-row.ts`, `apps/web/src/components/{site/AppHeader,cabinet/{CabinetSectionTabs,OrganizerHeader}}.tsx`, `apps/web/src/features/participant/discovery/components/DiscoveryFilters.tsx`, tests, `apps/web/e2e/mobile-cabinets.spec.ts`, `docs/design.md`.
Validation: see CR-243.
Decisions: hamburger + panel below `lg` (was `md`); the bottom tab bar still hides at `md`.
Follow-up: mobile `visual-regression` baselines (discovery, organizer dashboard) need a refresh from CI.

## 2026-10-12 — CR-242 — «Поделиться» and `.ics` say what happened

Summary: production browser QA item 8. Share used only `navigator.share`, else the async clipboard (absent outside a secure context, refused in some webviews); any failure showed «Не удалось скопировать ссылку.» as a _success_ toast with no way to get the link, and a failed share sheet never fell back. Now: share sheet → clipboard → legacy `execCommand('copy')` → `ShareLinkDialog` with the link for a manual copy (and a retry); closing the sheet stays silent. «Добавить в календарь» toasts success or a danger-toned failure, revokes the blob URL after 30 s instead of synchronously, and falls back to a `data:` URL without `download` support.
Contract: `RIDE_POSTER_TERMS.shareManual*`, `RIDE_PAGE_TERMS.calendarDownloaded/calendarFailed`.
Files: `apps/web/src/features/participant/ride-detail/{lib/{share,calendar}.ts,components/{RideDetailView,ShareLinkDialog}.tsx,ride-detail.test.tsx}`, `packages/ui/src/terminology.ts`, stories `ShareLinkDialog`, `RideDetailView`.
Validation: see CR-243.
Decisions: no toast after a completed share sheet — the OS sheet is its own feedback.
Follow-up: none.

## 2026-10-12 — CR-243 — Small QA items: group counter, `fitBounds`, menu semantics, focus

Summary: production browser QA item 9. Group chip «N из 6»: `GroupsEditor`'s conflict paths resynced the list only (repro: delete a group removed in another tab → chip 3 over 2 groups) and a failed list re-read skipped the workspace's; both now re-read together and `RideWorkspace.refresh` applies only the latest reply. `maps-2gis` `applyFit` drops NaN/out-of-range points, waits while the container is 0×0 and clamps padding to the map. `NavMenu` `header` slot takes `OrganizerHeader`'s account heading out of `role="menu"`; theme options are `menuitemradio` + `aria-checked`. `RescheduleRideCard`'s form heading no longer suppresses its focus ring.
Contract: `ui` `NavMenu` optional `header`; `menuitemradio` items navigable.
Files: `apps/web/src/features/organizer/{groups/components/GroupsEditor.tsx,rides/components/{RideWorkspace,RescheduleRideCard}.tsx}`, `packages/maps-2gis/src/render.ts`, `packages/ui/src/components/NavMenu.tsx`, `apps/web/src/components/{site/ThemeToggle,cabinet/OrganizerHeader}.tsx`, tests, stories `NavMenu`, `OrganizerHeader`.
Validation (CR-240..243): web 929/929, ui 272/272, maps-2gis 82/82 (+6 live skipped); `coverage:check` passes (web +0.4–0.9 pp; maps-2gis +0.05 st); 20 new/changed tests fail on `HEAD` sources; tsc/eslint (0 errors)/prettier clean; Storybook 288/293 — the 5 known failures (`AdminOverview` ×3, `CabinetSectionTabs` Admin Last Tab ×2, same on the `HEAD` component); e2e themes/mobile-cabinets/critical-journeys/ride-lifecycle/pace-groups 25 passed except the 2 `themes` darwin-baseline checks (no darwin snapshots by design); Playwright audit + keyboard runs in the local app at 320/390/768/989/1024/1280.
Decisions: the `fitBounds` hardening lives in the adapter, not in each map caller.
Follow-up: refresh mobile visual baselines from the CI artifact.

## 2026-10-12 — CR-235..CR-243 deployed

Deploy: `ef49fcd` (PR #43, squash) on coffeeride.site via `deploy/deploy.sh` after green CI on `main` (ci incl. e2e + visual baselines, docker-smoke); no migrations. `/health` db/redis/s3 ok; `/`, `/organizer`, `/me/rides` 200.
CI: the PR's first run failed only on the mobile `organizer-dashboard` screenshot (3 % of pixels): the intended CR-241 header/tabs change plus CI's subpixel text antialiasing, which the CR-188 baseline lacked; refreshed from the run's actual (layout below the tabs unchanged).

## 2026-10-12 — CR-234 Strava switched on in production

Ops: `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` appended to the VPS `.env` from the local one over stdin (values never printed; backup `.env.bak-20261012-strava`, mode 600 kept), `deploy/deploy.sh` recreated `api`/`web`; `GET /v1/strava/status` → `available:true`, `/health` ok. Still owner-side: the Strava app's callback domain `coffeeride.site` and Strava's app review (1 athlete until then).

## Archiving (keep this file cheap to read)

When this file exceeds ~15 entries, move all but the most recent ~8 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly,
and update the pointer line below. Routine work reads only the last 3 entries of the
_live_ file (`awk` on `^## 20`, or `tail`) — the archive exists for humans and for deep
audits (grep it by CR id), not for routine agent context. (CR-202 lowered this from ~40/~15.)

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed and why, in 1-3 sentences (≤ ~600 characters).
Contract: API/types/ui contract changes, migrations — or "none".
Files: key files/dirs touched (globs, not every test file).
Validation: commands run + pass counts, one line.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

Detail beyond that (root-cause narratives, live-verification transcripts) belongs in the
commit message body or the KI entry, not here — every agent re-reads these entries.

---

Entries before CR-234 (CR-000 through CR-233, 2026-09-09..2026-10-10) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213, CR-205..CR-218 on 2026-10-08 by CR-226, CR-219..CR-227 on 2026-10-10 by CR-232, CR-228..CR-233 on 2026-10-12 by CR-239),
per this section's own rule.

## 2026-10-11 — CR-234 — «Синхронизировать со Strava»: finish backed by a Strava ride

Summary: A registered rider of a started/finished ride can back the finish claim with their own Strava ride. One-shot OAuth (`activity:read`): the callback exchanges the code, matches a bike activity (not `VirtualRide`) starting −90…+120 min around the start whose track (`summary_polyline`, else the `latlng` stream) passes within 200 m of ≥70% of the route (no route: meeting point + distance), writes claim + mark, then revokes the grant — no token stored. Organizer sees only «Проверено Strava»; `attendance` stays theirs (ADR-027).
Contract: additive — `Registration.stravaVerifiedAt/stravaActivityId`, `RideParticipantSummary.stravaVerified`; `GET /v1/strava/status`, `POST /v1/rides/:id/strava-sync`, `GET /v1/strava/callback` (303 `?strava=<outcome>`); `types` `STRAVA_SYNC_OUTCOMES`; `ui` `STRAVA_SYNC_TERMS`. Migration `0027_strava_verification`. Env `STRAVA_CLIENT_ID/SECRET` (optional; off without both) + preflight check.
Files: `apps/api/src/modules/strava/*`, `plugins/strava.ts`, `env.ts`, `preflight.ts`, `registrations.*`; `packages/db` schema + `0027`; `packages/types`, `packages/ui/terminology.ts`; web `ride-detail` (`StravaSync.tsx`, ticket, api), `ParticipantTable`, `LiveRidesWidget`, stories; `docker-compose.prod.yml`, env examples; `docs/{api,database,decisions}.md`; `coverage-baseline.json` (+`src/modules/strava/` scope).
Validation: api 702/702 (new: match, oauth-state, client, 14 route tests; disposable `coffee_ride_test`), web unit 895+, ui 267, Storybook touched stories 43/43 with axe; `test:coverage` + `coverage:check` green (CI env, live Redis/S3), baseline raised; typecheck, lint (no new warnings), `format:check`, api build, `next build --webpack` (temp copy); live on dev: real Strava accepts the redirect URI, real code exchange → `error`, cancel → `denied`, foreign session → `/me/rides?strava=error`; headless browser: button, consent redirect, outcome toast.
Decisions: ADR-033.
Brand: per Strava's guidelines the sync is Strava's official «Connect with Strava» button (`StravaConnectMark.tsx`, their SVG verbatim) and the activity link reads «View on Strava»; «Проверено Strava» is a Strava-orange mark (`ui` `StravaVerifiedBadge`, tokens `strava`/`strava-text`, docs/design.md §3) with the official «Powered by Strava» logo on the ticket; live retry with the streams fallback → `verified`.
Follow-up: owner — set the Strava app's callback domain to `coffeeride.site`, put both env vars on the VPS, ask Strava for app review (athlete capacity 1). E2E not run locally (no spec covers check-in; CI has no Strava env, so no visual change).

## 2026-10-12 — Header: wordmark on the nav labels' baseline

Summary: Owner report — in `AppHeader` the centred 24px wordmark's baseline sat 3.8px below the 16px nav labels and account menu (45.4 vs 41.6px). The `Wordmark` is lifted `md:-translate-y-[0.16em]`, so logo, labels and the account menu share one line; mobile (logo + menu button only) is unchanged.
Files: `apps/web/src/components/site/AppHeader.tsx`; new `src/stories/AppHeader.stories.tsx` (signed-in light/dark, guest) asserting every label's baseline equals the wordmark's (±0.75px; fails at 3.81px without the fix).
Validation: stories 3/3, site unit 21/21, web typecheck/lint.

## 2026-10-12 — CR-234 deployed; CI flake fixed; branch flow

Deploy: `542f27c` on coffeeride.site via `deploy/deploy.sh` after green CI on `main` (ci incl. e2e + visual baselines, docker-smoke): migration `0027` applied (28 total, `registrations.strava_*` present), `/health` db/redis/s3 ok, home 200. Strava stays off on prod (`GET /v1/strava/status` → `available:false`) until `STRAVA_CLIENT_ID/SECRET` are in the VPS `.env` and the Strava app's callback domain is `coffeeride.site`.
CI: the first `main` run (`f60bab5`) failed on a race in `route-builder.test.tsx` (asserted the polyline before the re-render that draws it); `542f27c` waits for the line.
Process: owner asked for branch → PR → `main` → prod; `rules/git.md` "Branch flow", `commit-push` step 8, GitHub branch protection on `main` (PR + `ci`/`docker-smoke` required, admins included) — PR #41.

## 2026-10-12 — CR-235 — «Опубликовать» saves the draft form first (P0)

Summary: production browser QA (reproduced locally, prod untouched): the draft form's «Опубликовать» called `publishRide` directly, so a ride went out as last saved and unsaved edits were lost. `requestPublish` now runs the same validation + `PATCH` as «Сохранить» (`saveForm()`) and publishes only after it succeeds; without a route it saves, then asks (dismissing leaves a saved draft, «Изменения сохранены.»). One `busyRef` guards save/publish: a double click = one save + one publish; fields lock meanwhile.
Contract: none (web only; no API/types/ui/terminology change).
Files: `apps/web/src/features/organizer/rides/{components/EditRideForm.tsx,rides.test.tsx}`, `apps/web/src/stories/{RideManagement.stories.tsx,ride-workspace-fixtures.ts}`, `.claude/rules/do-not-break.md`.
Validation: `rides.test.tsx` 90/90 (6 new, all fail on the old component); web unit 910/910 with coverage above baseline (lines 84.06/84, branches 82.0/81.95); `tsc`, eslint, prettier clean; e2e `critical-journeys` + `ride-lifecycle` 7/7 on the local stack; Storybook RideManagement/RideWorkspaceSections 36/36 with axe (new `DraftPublishSaveFails`), full suite 257/262 — the 5 failures are the pre-existing AdminOverview/CabinetSectionTabs axe findings; local UI via Playwright: edit+publish, double click, empty title, failed save (500), dismissed dialog.
Decisions: save before the no-route question, so validation errors show before it and a dismissed question still keeps the edits.
Follow-up: a failed save shows the generic «Не удалось загрузить заезд…» (pre-existing wording for save errors).

## 2026-10-12 — CR-236 — Create form: adjacent-month days, stale field errors

Summary: production browser QA item 2 (reproduced locally). (a) `DatePicker`: a day of the next/previous month could not be picked — its focus on mousedown flipped the grid to that month, the day's button remounted in another row and the click was lost; only in-month days follow focus now. (b) `CreateRideForm`: a field's error now clears when that field changes, not at the next save. (c) The «Создать профиль организатора» link could not be reproduced as broken (dev and production build, desktop/mobile/touch/keyboard) — awaiting details.
Contract: none (`DatePicker` props unchanged; behaviour fix in `packages/ui`).
Files: `packages/ui/src/components/DatePicker{,.test}.tsx`, `apps/web/src/features/organizer/rides/{components/CreateRideForm.tsx,rides.test.tsx}`, new `apps/web/src/stories/{DatePicker,CreateRideForm}.stories.tsx`, `.claude/rules/do-not-break.md`.
Validation: ui 270/270, web 912/912, coverage ≥ baseline in both; new tests fail on `HEAD`; tsc/eslint/prettier clean; Storybook new 12/12 (axe), full 269/274 (5 pre-existing admin axe findings); e2e critical-journeys/ride-start-time/ride-lifecycle 9/9 ×3, one `loginViaUi` hydration flake; local UI 1280/390.
Decisions: errors clear per field on change; the next save validates the whole form again.
Follow-up: the profile-link report (item 2a) needs the QA's steps/device; `EditRideForm` keeps errors until the next save too (not in this item).

## 2026-10-12 — CR-237 — Confirm closing registration

Summary: production browser QA item 3. «Закрыть регистрацию» closed on one click. The documented lifecycle is one-way (`docs/product.md`: `registration_open → registration_closed → started`, no reopen transition in the API), so reopening is a product change and was not added; the button now opens a `ConfirmDialog` that says the step is irreversible, that nobody new can register or join the waitlist, and that registered riders stay. «Не закрывать»/Esc sends nothing.
Contract: `RIDE_EDIT_TERMS.closeRegistrationConfirm{Title,Description}`, `closeRegistrationKeep` (ui terms); API none.
Files: `apps/web/src/features/organizer/rides/{components/RideWorkspace.tsx,rides.test.tsx}`, `apps/web/e2e/ride-lifecycle.spec.ts`, `apps/web/src/stories/RideManagement.stories.tsx` (`CloseRegistrationConfirm`), `packages/ui/src/terminology.ts`.
Validation: see CR-239.
Decisions: confirm + irreversibility notice instead of a reopen transition (lifecycle unchanged).
Follow-up: a «reopen registration» transition, if the owner wants it, is a lifecycle/API change.

## 2026-10-12 — CR-238 — The organizer sees their hidden rider list

Summary: production browser QA item 4. With `participantsVisible: false`, `GET /v1/rides/:id/riders` answered `403 riders_hidden` to the ride's own organizer too (CR-125 «no organizer bypass»), so on `/rides/[id]` they saw «3 из 30» and group counts over «Организатор скрыл список». The cabinet table (`/participants`) was never affected. The organizer now gets the list there, with a note that only they see it; riders and guests are unchanged.
Contract: `GET /v1/rides/:id/riders` — `riders_hidden` no longer for the ride's own organizer (`docs/api.md`); `RidersSection` optional `hiddenFromOthers`; `RIDE_DETAIL_RIDERS_TERMS.hiddenForOthers`.
Files: `apps/api/src/modules/registrations/registrations.service.ts`, `apps/api/src/modules/rides/participants-visibility.routes.test.ts`, `apps/web/src/features/participant/ride-detail/components/{RidersSection,RideDetailView}.tsx`, new `apps/web/src/stories/RidersSection.stories.tsx`, `docs/api.md`, `.claude/rules/do-not-break.md`.
Validation: see CR-239.
Decisions: reverses CR-125's organizer rule for `/riders` at the owner's request — `participantsVisible` hides from the public only (same rule CR-149 gave the rider card).
Follow-up: none.

## 2026-10-12 — CR-239 — Ride page in sync after a registration change

Summary: production browser QA item 5. After cancel/register the page applied the viewer's new registration at once and re-read counts afterwards, fire-and-forget: with a 3 s re-read the ticket showed «4 из 30» and the phone bar «№ 5» after a cancel; a failed re-read left it stale. Now the action awaits the re-read and registration, waitlist entry, counts and start number land in one update (the ticket stays pending); a failed re-read falls back to the action's reply. The bar's open-state title is the count («3 из 30 участников»), not a bare «№ N» that equalled the old number of the last rider who cancelled.
Contract: `RegistrationTicket`'s `onChange`/`onWaitlistChange` return `Promise<void>`; `RIDE_TICKET_TERMS.barNumber` → `barCount(count, limit)`.
Files: `apps/web/src/features/participant/ride-detail/{components/{RideDetailView,RegistrationTicket}.tsx,ride-detail.test.tsx}`, `packages/ui/src/{terminology.ts,terminology-poster.test.ts}`, new `apps/web/src/stories/TicketBar.stories.tsx`, `apps/web/src/stories/RegistrationTicket.stories.tsx`, `.claude/rules/do-not-break.md`.
Validation (CR-237..239): web 916/916, ui 270/270, api 708/708 with live Redis/S3 on a separate `coffee_ride_test` DB; coverage gate passes (no drops); 6 new tests fail on `HEAD`; tsc/eslint/prettier clean; Storybook touched files 39/39 with axe; e2e ride-lifecycle/critical-journeys/access-control/registration-waitlist/pace-groups/profile-visibility 14/14 (one known `loginViaUi` flake, passed on rerun); local UI at 1280/390 (repro scripts, re-read delayed 3 s).
Decisions: the viewer's own registration comes from the action's reply; counts, start number and waitlist from the re-read.
Follow-up: none.
