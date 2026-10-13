# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

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

Entries before CR-240 (CR-000 through CR-239, 2026-09-09..2026-10-12) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213, CR-205..CR-218 on 2026-10-08 by CR-226, CR-219..CR-227 on 2026-10-10 by CR-232, CR-228..CR-233 on 2026-10-12 by CR-239, CR-234..CR-239 on 2026-10-12 by CR-245),
per this section's own rule.

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

## 2026-10-12 — CR-244 — Password-reset email "not sent" (production QA, investigation)

Summary: QA: `/forgot-password` said «ссылка отправлена», no email arrived. Production checked read-only: both requests got `204` but created no reset token and no job — the typed address matched no account (the QA account is a Gmail `+` alias; the base address reaches the same inbox, so the verification email showed in the search). The same IP's earlier reset for another account went through BullMQ and Unisender (`success`). No defect; `204` without email is the required no-enumeration behavior.
Contract: none.
Files: none (context only).
Validation: prod `api` logs (no send/job failures), `password_reset_tokens`, BullMQ `notifications` events/state.
Decisions: none.
Follow-up: QA retries with the exact address; owner call on mailing an unknown address «нет аккаунта».

## 2026-10-12 — CR-245 — The emailed verification link keeps `next` (KI-089)

Summary: production QA (high): `/me/rides` → register → verify from the email → «Перейти ко входу» led to plain `/login`, the return target was lost — the API built the link from a register request with no `next`. `POST /v1/auth/register` now takes an optional `next`; the API keeps it only if `safeNextPath` accepts it and appends it to the emailed link. `safeNextPath` and the href builders moved to `packages/types`, so web and API share one validator; `RegisterForm` sends the safe `next`.
Contract: `registerRequestSchema.next?: string` (additive, `docs/api.md`); `types` exports `safeNextPath`, `loginHref`, `registerHref`, `verifyEmailHref`.
Files: `packages/types/src/{next-path.ts,api/auth.ts,index.ts}`, `apps/api/src/modules/auth/{auth.routes.ts,auth.routes.test.ts}`, `apps/web/src/lib/auth/next-path.ts` (re-export), `apps/web/src/features/auth/register/{components/RegisterForm.tsx,register.test.tsx}`, `docs/api.md`.
Validation: api auth+notifications 90/90 (5 skipped, no Redis) on `coffee_ride_test`; web unit auth 94/94, web coverage 84.54 % lines ≥ 84.00 baseline; Storybook `EmailVerification` 8/8; tsc/eslint/prettier clean; local browser run with captured email: `/me/rides` → `/register?next=…` → link `/verify-email?token=…&next=%2Fme%2Frides` → «Перейти ко входу» → sign-in → `/me/rides`.
Decisions: an unsafe `next` is dropped, never a `400`; resend/admin-resend links stay without `next` (no return context).
Follow-up: none.

## 2026-10-12 — CR-245 deployed

Deploy: `b19a89a` (PR #46, squash) on coffeeride.site via `deploy/deploy.sh` after green CI on `main` (ci incl. e2e, docker-smoke); no migrations. `/health` db/redis/s3 ok; `/`, `/register?next=…`, `/login`, `/me/rides`, `/verify-email` 200. The emailed-link `next` itself is checked by the next real registration (no test account was created on production).

## 2026-10-13 — CR-246 — Strava sync: cancel, expired state, retry copy (production QA)

Summary: QA: «Отменить» on Strava's screen showed «Strava не дала доступ…» (the callback mapped `error=access_denied` to `denied`); after a check the button stayed «Connect with Strava» with no sign of what happened (the grant is one-shot by ADR-033, so Strava always asks again); a broken/expired `state` landed on `/me/rides?strava=error` with no message. Now: outcome `cancelled`; a genuine own `state` past its TTL → `expired` on the ride page (code not exchanged); forged/foreign state still → `/me/rides`, which now toasts; a return without a verified ride shows «Проверить поездку снова» + «Strava не остаётся подключённой…», the first-visit hint says access is for one check.
Contract: `StravaSyncOutcome` + `cancelled`, `expired` (additive, `docs/api.md`); a callback with neither `code` nor `error` → `error` (was `denied`).
Files: `apps/api/src/modules/strava/{oauth-state,strava.service}.ts` + tests, `packages/types/src/api/strava.ts`, `packages/ui/src/terminology.ts` + test, `apps/web/src/lib/strava/outcome-toast.ts` (hook moved from `StravaSync.tsx`), `StravaSync.tsx`, `RegistrationTicket.tsx`, `MyRidesView.tsx`, tests, `RegistrationTicket.stories.tsx` (`FinishStravaRetry`), `docs/api.md`.
Validation: api strava 49/49 on `coffee_ride_test`; web unit ride-detail+my-rides 152/152; Storybook `RegistrationTicket` 15/15; typecheck/lint/prettier clean; full `test:coverage` with live Redis/S3 + `coverage:check` holds (strava 94.79/90.52); local browser run (390 px): cancel → ride page + toast + retry copy, expired → ride page, forged → `/me/rides` + toast, no console errors.
Decisions: the retry keeps Strava's own «Connect with Strava» artwork (brand guidelines) and adds the title/hint around it; `readOAuthState` reports `expired` instead of `null` so the ride can be trusted for the redirect only.
Follow-up: positive «Проверено Strava» on production needs a real bike activity near a test ride's start.
