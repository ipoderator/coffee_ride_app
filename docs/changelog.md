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

Entries before CR-228 (CR-000 through CR-227, 2026-09-09..2026-10-09) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213, CR-205..CR-218 on 2026-10-08 by CR-226, CR-219..CR-227 on 2026-10-10 by CR-232),
per this section's own rule.

## 2026-10-10 — CR-228..CR-230 — Admin capability, `/v1/admin/*` and moderation enforcement

Summary: ADR-032. Admin = a `platform_admins` row granted only by `pnpm --filter db admin:grant|revoke|list`; `requireAdmin` (DB read per request, 404 to non-admins) guards every `/v1/admin/*` route. Endpoints: overview, users (verify email, resend, log out everywhere, block/unblock), rides (hide/unhide, cancel via the organizer path), reviews (hide/unhide), append-only action log. Block deletes sessions and makes login answer `403 account_blocked` after the password; a hidden ride is a draft to non-owners (`isRidePublic`); a hidden review leaves lists and rating.
Contract: new `/v1/admin/*` (docs/api.md → Admin); `POST /v1/auth/login` `403 account_blocked`; `packages/types` `api/admin.ts`. Migration `0026_admin_panel` (`platform_admins`, `admin_actions`, `users.blocked_*`, `rides/reviews.hidden_*`).
Files: `packages/db` (schema, migration, `admin-cli.ts`), `apps/api` `modules/admin/*`, `plugins/auth.ts`, `modules/{auth,rides,registrations,reviews}`.
Validation: api admin+auth+rides+registrations+reviews+organizers 469 passed; `plugins/auth.test.ts` 2; api/db/types typecheck + lint clean.
Decisions: no step-up auth yet (owner); manual moderation only.
Follow-up: local branch `feat/admin-panel` only — not merged, not deployed.

## 2026-10-10 — CR-231 — `/admin` web section; organizer sees why a ride is hidden

Summary: `/admin` in apps/web (ADR-009 modules `features/admin/{overview,users,rides,reviews,actions}`, registry `lib/admin/admin-nav.ts`, shared `components/admin/*`). The layout asks `GET /v1/admin/me` server-side: non-admin → real 404, API down → error, admin → `CabinetShell` sidebar; `noindex`, `/admin` in robots disallow. Reason dialog for block/hide/cancel; API codes mapped to Russian, `detail` never shown. Login shows «Аккаунт заблокирован администратором.». `GET /v1/rides/:id` gives the owner `moderation { hiddenAt, reason }`, shown as a Notice in the ride workspace.
Contract: additive owner-only `GetRideResponse.moderation`; `RIDE_WORKSPACE_TERMS.hiddenByAdmin*`.
Files: `apps/web/src/{app/admin,features/admin,components/admin,lib/admin}/**`, `LoginForm.tsx`, `RideWorkspace.tsx`, 5 admin stories + 3 stories elsewhere; `apps/api` rides detail.
Validation: web unit 82 files/857 tests; Storybook 34 files/240 (axe); api admin+rides routes 110; coverage gate green with live Redis/S3 (web 82.33 % lines, baseline raised); `/admin` checked in a browser on the dev stack (block → login 403).
Decisions: card-first lists (no tables, no horizontal scroll at 320 px); filters are local state, not URL params.
Follow-up: no link to `/admin` in the header — the admin opens it by URL.

## 2026-10-10 — CR-232 (item 1) — `admin:grant` requires a confirmed email

Summary: `grantAdmin` (`packages/db/src/admin-grants.ts`) returns `email_not_verified` for an account whose `users.emailVerified` is false, writing no `platform_admins`/`admin_actions` row; the CLI prints why on stderr and exits 1 (as for `user_not_found`). Grant-time only — existing admins keep access, no runtime check, migration untouched. CLI messages/exit codes moved to `admin-cli-messages.ts` (unit-tested).
Files: `packages/db/src/{admin-grants,admin-cli,admin-cli-messages}.ts`, db vitest coverage include, `apps/api` admin suite, `docs/deployment.md`, `docs/database.md`.
Validation: db 16 tests + typecheck/lint; api admin + `plugins/auth` 21; api typecheck/lint; db coverage 97.61 % lines (baseline raised).

## 2026-10-10 — CR-232 (item 2) — Admin reason dialogs name their record

Summary: block / hide ride / cancel ride / hide review dialogs show the target under the description — account email; ride title; review author, rating and a 140-character excerpt (`ADMIN_TERMS.reviewExcerpt`, «Без текста» when empty). It sits inside the dialog's `aria-describedby`, values `wrap-anywhere`. `ui` `Dialog`: `description` accepts a ReactNode (additive) and the panel scrolls vertically on short screens (it was clipped). Reason rules unchanged.
Files: `packages/ui` `Dialog.tsx`, `terminology.ts`; `apps/web` `AdminReasonDialog.tsx` (required `subject`), admin rides/reviews/user card, tests, 3 admin story files; web coverage excludes `src/stories/**`.
Validation: web unit 859, Storybook 34 files/244 (axe); ui 262; typecheck/lint clean; coverage gate green, web/ui baselines raised; 320/390 px measured in Chromium — no horizontal scroll.

## 2026-10-10 — CR-232 (item 3) — Reason hint says who will read the reason

Summary: `AdminReasonDialog` takes a required `reasonHint`. Ride hide → `ADMIN_TERMS.reasonHintOrganizerVisible` (the organizer sees the reason via `GET /v1/rides/:id` → `moderation`, and it is logged); block, ride cancel, review hide → `reasonHintLogOnly` (admin log only — checked: none of these reasons leaves the admin API). The old `reasonHint` («Её увидите только вы…») is removed.
Files: `packages/ui` `terminology.ts` (+test); `apps/web` `AdminReasonDialog.tsx`, admin rides/reviews/user card, their tests and stories.
Validation: admin unit 29, admin stories 25 (axe), ui 263; typecheck/lint/prettier clean; coverage gate green.

## 2026-10-10 — CR-232 (item 4) — Mobile section tabs reveal the active tab

Summary: `CabinetSectionTabs` (shared by the organizer and admin cabinets) scrolls its own row on mount and on every pathname change so the `aria-current` tab is fully visible — the least distance, via the row's `scrollTo`, never `scrollIntoView` (the page stays put). Instant on first render; smooth afterwards unless `prefers-reduced-motion: reduce`.
Files: `apps/web` `components/cabinet/CabinetSectionTabs.tsx` (+ new test), `stories/CabinetSectionTabs.stories.tsx` (new — the component had no story).
Validation: web unit 863, Storybook 35 files/248 (axe); e2e `mobile-cabinets.spec.ts` 6/6; dev stack at 320/390 px: `/admin/reviews`, `/admin/actions`, `/organizer/profile` direct and by link — active tab visible, `window.scrollX/Y` 0; coverage gate green, web baseline raised.

## 2026-10-10 — CR-232 (item 5) — Admin list filters in the URL

Summary: supersedes CR-231's "filters are local state". `/admin/users?q=&filter=`, `/admin/rides?q=&status=&visibility=`, `/admin/reviews?visibility=` — the URL is the only copy: `useAdminUrlFilters` derives filters from `useSearchParams` and a change is a native `history.pushState` (no server round trip; back/forward re-sync). Unknown values fall back to defaults; defaults are omitted from the URL. Search still runs on Enter/«Найти» only; the field follows `q` on back/forward. A user card keeps the list's filters in `?from=`, re-parsed server-side into the back link.
Files: `apps/web` `lib/admin/{url-filters,use-admin-url-filters}.ts`, `features/admin/{users,rides,reviews}/filters.ts`, the three lists, `AdminSearchForm`, `app/admin/users/[id]/page.tsx` (+ test), `AdminUserCard` `backHref`; `test-support/next-navigation.ts`; stories `ListFilteredFromUrl`, `FilteredFromUrl`, `HiddenFromUrl`.
Validation: web unit 876, Storybook 35/251 (axe), `next build --webpack` (scratch copy), dev-stack check of reload/junk/Enter/back/forward/card round trip; coverage gate green, web baseline raised.

## 2026-10-10 — CR-232 (item 6) — Overview links and refresh; log filters

Summary: «Обзор» — unverified/blocked users, hidden rides, hidden reviews link to their URL filters (`lib/admin/list-links.ts`; names carry the section); «Обновить» re-reads the overview in place, «Обновлено …» shows the last successful answer (with seconds), a failed refresh keeps data + time. «Журнал» — target-type and action selects in the URL (`?targetType=&action=`), actions narrow to the type, a mismatched pair drops the action; a deleted target shows `Запись удалена · ID <targetId>`. Log stays append-only.
Contract: additive `GET /v1/admin/actions?action=` (docs/api.md).
Files: `packages/types` admin schema; `apps/api` `admin-actions.service.ts` (+ tests); `packages/ui` terminology; `apps/web` overview, actions (`filters.ts`, api, log), `AdminActionList`, `lib/admin/{list-links,format}.ts`, stories.
Validation: api admin 21 (filter, 400, no DELETE/PATCH/PUT); web unit 883, Storybook 35/254 (axe); ui 264; typecheck/lint/prettier clean; coverage green, web baseline raised; dev stack 390 px.
Note: api tests share the docker DB with the dev API here (no native Postgres on ::1) — two api runs in CR-232 emptied dev data; re-seeded with `seed:demo --no-routes`.

## 2026-10-10 — CR-232 (item 7) — Admin validation sweep and review fixes

Summary: full check of the admin section, then fixes for the confirmed review findings. `/admin/users/<not a uuid>` → not-found page before any request (was a retryable 400 «loadError»; shared `lib/uuid.ts` `isUuid`, also used by `server-ride.ts`). Admin api.ts encode ids in paths. `adminRequest` turns a non-problem error body (proxy HTML, empty 500) into an `ApiError` with its status (`unexpected_response`). A reason dialog can't be dismissed while its action is in flight. `bg-raised` (no such utility) → `bg-bg-raised` / overview hover `bg-surface`.
Contract: none.
Files: `apps/web` `lib/{uuid,admin/client}.ts`, `lib/rides/server-ride.ts`, `app/admin/users/[id]/page.tsx`, `features/admin/{users,rides,reviews}/api.ts`, `components/admin/AdminReasonDialog.tsx`, `AdminOverview.tsx`; tests in `admin-lib`, users, page.
Validation: api admin/auth/rides/reviews/registrations 455 (+6 live skipped) on a separate `coffee_ride_test` DB (dev data kept); full coverage with live Redis/S3 — api 661/0 skipped, gate green, web baseline raised; web unit 886, Storybook 35/254 (axe), ui 264, db 16; typecheck/lint/prettier clean; negative checks (fix reverted → new test fails); Playwright on the dev stack 320/390/1280 × light/dark, 7 pages: 200, no horizontal scroll, 0 console errors, active mobile tab, filters after back, disposable block/unblock (login 403 → 200).
Decisions: none.
Follow-up: `21st review` does not exist in the installed `21st` CLI — replaced by `/code-review`; open findings in project-state "Next".

## 2026-10-10 — Dependabot triage — eight updates merged

Summary: Merged after a rebase onto main and green CI each: #26 SeaweedFS 4.48, #29 upload-artifact 7, #30 setup-node 7, #31 pnpm/action-setup 6, #32 checkout 7 (majors: node24 runtime + runner ≥ 2.327.1 only, inputs unchanged), #9 zod 4.6.5, #8 tailwind-merge 3.7, #34 @aws-sdk/client-s3 3.1146, #35 lucide-react 1.52, #38 dev group (15: vitest 5.0.3, vite 8.3.3, storybook 10.6.1, turbo 2.11.7, eslint-config-next 16.4.0…). #35's first red run was a one-off `route-builder.test.tsx` failure (passed 3/3 locally) and a Docker Hub 429; reruns green. Still open by decision: Node 26 #19–#21, Postgres 18 #15 (KI-091); alert #18 `braces` has no patched release (KI-095). Not yet deployed to production.

## 2026-10-10 — CR-233 — `s3-init` idempotent again on SeaweedFS 4.48

Summary: The first prod deploy after #26 (SeaweedFS 4.47 → 4.48) stopped at `deploy/deploy.sh`'s bucket step: 4.48's `weed shell` exits non-zero on `error: bucket … already exists`, so `s3-init` was no longer a no-op and migrations/app roll never ran (the old `web`/`api` kept serving; `/health` ok). `s3-init` in `docker-compose.infra.yml` and `docker-compose.yml` now treats that one error as success; any other failure still exits 1. CI's docker-smoke always starts with an empty bucket, so it could not catch this.
Files: `docker-compose.infra.yml`, `docker-compose.yml`.
Validation: the rendered script against a throwaway SeaweedFS 4.48 (isolated network on the prod host): new bucket → 0, existing → 0, invalid name → 1.
Follow-up: none.
