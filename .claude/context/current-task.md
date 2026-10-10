# Current task — CR-228..CR-231 — Admin panel (P0)

Source: owner, 2026-10-09 (chat). Branch `feat/admin-panel` — local only: no merge into
`main`, no deploy.

## Owner decisions (2026-10-09)

- One admin (the owner), all rights — no roles inside the admin capability.
- The admin may do everything P0 lists: hide **and** cancel another organizer's ride.
- Moderation is manual only — no `Report` entity.
- No step-up auth / TOTP for now — just the admin cabinet.
- Scope: P0 (overview, users, rides, reviews, action log).

## Requirements / acceptance

- ADR-032: admin = a capability row (`platform_admins`), not a role enum (ADR-006);
  granted only by CLI (`pnpm --filter db admin:grant <email>` / `admin:revoke`).
- Every admin mutation writes an append-only `admin_actions` row (who, what, target,
  reason) in the same transaction; reason required on block/hide/cancel.
- `requireAdmin` checks the DB on every request; non-admins get 404 (`not_found`).
- Block: `users.blocked_at/by/reason`; all sessions revoked in the same transaction;
  `validateSession` rejects a blocked user; login refuses with the generic error.
- Ride hide: `rides.hidden_at/by/reason` — gone from discovery/detail/sitemap for
  everyone except the owning organizer; registration on a hidden ride refused.
  Cancel: reuses the organizer cancel path (status + participant notifications).
- Review hide: `reviews.hidden_at/by/reason` — gone from lists and the rating aggregate.
- User actions: mark email verified, resend verification, log out everywhere,
  block/unblock. No password/session token/emergency data ever returned.
- `/v1/auth/me` (or equivalent) exposes `isAdmin`; web `/admin` 404s for non-admins.
- Web: `/admin` shell + Обзор, Пользователи (+ карточка), Заезды, Отзывы, Журнал;
  strings in `terminology.ts`; stories for new components; storybook tests pass.
- api/web typecheck, lint, unit/integration tests, coverage gate for touched files.

## Planned files

- `docs/decisions.md` (ADR-032), `packages/db/src/schema/{admin,user,ride,review}.ts`,
  migration, `packages/db` CLI script.
- `apps/api/src/plugins/auth.ts` (`requireAdmin`), `modules/auth/session.ts`,
  `modules/auth/auth.service.ts`, `modules/admin/*`, `routes/v1.ts`, rides/reviews/
  registrations/organizers services (hidden filters), `packages/types`.
- `apps/web/src/app/admin/**`, `apps/web/src/features/admin/**`,
  `packages/ui/src/terminology.ts`.

## Progress

- [x] CR-228 ADR-032 + migration `0026_admin_panel` (applied to the docker test DB and
      the native dev DB) + CLI `pnpm --filter db admin:grant|admin:revoke|admin:list`
- [x] CR-229 API: `requireAdmin`, `GET /v1/admin/me` (used instead of an `isAdmin`
      field on `/auth/me`), overview/users/rides/reviews/actions reads
- [x] CR-230 API: mutations + enforcement — block (sessions deleted, `validateSession`
      refuses, login `403 account_blocked`), ride hide (`isRidePublic` in every
      non-owner gate + discovery), admin cancel via `commitRideCancellation`, review
      hide (lists + rating)
- [x] CR-231 Web — `components/admin/*` (reason dialog, list body, action list,
      search form, select), `features/admin/{overview,users,rides,reviews,actions}`,
      `lib/admin/{admin-nav,errors,visibility}.ts`, `app/admin/**` (layout gate,
      noindex, robots disallow), LoginForm `account_blocked`; organizer «hidden by
      admin» Notice via owner-only `GET /v1/rides/:id` → `moderation`
- [x] Close: docs/api.md (Admin), docs/database.md, docs/deployment.md (Admin access),
      do-not-break bullet, architecture-map, changelog, tasks, project-state

## Validation

- api: `src/modules/admin` 15/15; admin+auth+rides+registrations+reviews+organizers
  469 passed / 6 skipped; api/db/types typecheck + lint clean (8 pre-existing
  `preflight.ts` console warnings); prettier clean.
- ui: `terminology-admin.test.ts` 5/5. Web not validated yet.

- web (CR-231): unit 82 files / 857 tests; Storybook 34 files / 240 (render + play +
  axe), 5 new admin story files + LoginAccountBlocked + HiddenByAdmin(Dark);
  typecheck + lint clean (2 pre-existing `set-state-in-effect` warnings in
  organizer rides); prettier clean.
- api after CR-231: admin + rides routes 110 passed; `plugins/auth.test.ts` 2.
- coverage with live Redis/S3 (`pnpm test:coverage && pnpm coverage:check`): green
  after the `requireAdmin` unit test (plugins branches 88.46 → 89.74); baseline raised.
- Browser (dev stack, disposable accounts): `/admin` anonymous → 404; admin → all five
  pages 200, `noindex, nofollow`, no console errors, no horizontal scroll at 390 px;
  block via the dialog → card shows the block + log row, login → `403 account_blocked`.

## Discovered issues

- CR-232: `/organizer/profile` at 320 px — the organizer header's account-menu
  button ends at 329 px (page `scrollWidth` 329 > 320). `OrganizerHeader`/account
  menu untouched by this branch; not fixed (outside item 4).
- Dev DB: emptied by CR-232's api test runs (shared docker DB), re-seeded with
  `seed:demo --no-routes`; the earlier disposable accounts are gone.

- No link to `/admin` in the header — opened by URL (deliberate, P0).
- Dev DB has two disposable accounts from the browser check
  (`admin-check-1791629468@example.com` — admin revoked, `blocked-check-1791629558@example.com`
  — blocked).

## Final result

CR-228..CR-231 done on local branch `feat/admin-panel`, validated; not committed
(owner did not ask), not merged, not deployed.

## CR-232 — post-audit admin fixes (follow-up, 2026-10-10)

Source: owner (chat). Same constraints: no reset/checkout/commit/push/merge/deploy.

1. [x] `admin:grant` only for a confirmed email — `grantAdmin` → `email_not_verified`
       (no rows written), CLI stderr + exit 1 via `admin-cli-messages.ts`; grant-time only,
       existing admins unaffected. Tests: api admin suite (granted / user_not_found /
       already_admin / email_not_verified / existing unverified admin still works), db
       `admin-cli-messages.test.ts`. Docs: deployment.md "Admin access", database.md.
       Validation: db 16 + typecheck/lint; api admin + plugins/auth 21, typecheck/lint;
       db coverage 97.61/97.82 (baseline raised).

2. [x] Reason dialogs name their record — `AdminReasonDialog` required `subject`
       (email; ride title; review author + rating + `ADMIN_TERMS.reviewExcerpt` /
       «Без текста»), rendered inside the `Dialog` description (`aria-describedby`),
       `wrap-anywhere`. `ui` `Dialog`: `description: ReactNode`, panel
       `max-h-full overflow-y-auto` (was clipped on short phones). Business rules and
       the required reason unchanged. Tests: rides/reviews/users unit (accessible
       description, the clicked row), `terminology-admin` excerpt, stories
       `CancelDialogLongTitle`, `HideDialogNoComment`, `HideDialogLongText`,
       `BlockDialogLongEmail` (+ assertions in the existing dialog stories).
       Validation: web unit 859; Storybook 34/244 with axe; ui 262; ui/web typecheck +
       lint clean (warnings pre-existing, none in touched files); coverage gate green
       (web coverage now excludes `src/stories/**`; web/ui baselines raised); Chromium
       at 320/390 px: panel and page scrollWidth == clientWidth for all four dialogs.
       Negative check: without `wrap-anywhere` the long-email stories fail.

3. [x] Per-action reason hint — required `reasonHint` prop; ride hide →
       `reasonHintOrganizerVisible`, block / cancel / review hide →
       `reasonHintLogOnly` (verified: only the ride hide reason leaves the admin API,
       via the owner-only `moderation`). Old `ADMIN_TERMS.reasonHint` removed.
       Validation: admin unit 29 (field's accessible description per action), admin
       stories 25 with axe, ui 263; typecheck/lint/prettier clean; coverage gate
       green (web −0.01, within tolerance).

4. [x] Mobile section tabs reveal the active tab — `CabinetSectionTabs` effect on
       `[pathname]` → `revealActiveTab` (row `scrollTo`, least distance, padding-aware;
       `auto` on mount, `smooth` after unless reduced motion; no `scrollIntoView`).
       Tests: `CabinetSectionTabs.test.tsx` (last tab on direct load, no scroll when it
       fits, navigation forward/back smooth, reduced motion, `window.scrollTo` never
       called); new `CabinetSectionTabs.stories.tsx` (admin first/last, organizer
       last, dark) — without the fix the three last-tab stories fail.
       Validation: web unit 863; Storybook 35/248 with axe; e2e
       `mobile-cabinets.spec.ts` 6/6 (reused dev servers); dev stack 320/390 px,
       direct + DOM-click navigation: active tab visible, page scroll 0, no console
       errors; coverage gate green (web baseline raised).

5. [x] Filters in the URL — `lib/admin/url-filters.ts` (pure: `readAdminSearch`,
       `readAdminEnum`, `adminFiltersQuery`) + `use-admin-url-filters.ts` (client hook:
       `useSearchParams` → filters, `history.pushState` on a real change);
       `features/admin/{users,rides,reviews}/filters.ts` (defaults + parse; users also
       `userCardHref`/`usersBackHref` via `?from=`); `AdminSearchForm` follows `q`.
       Supersedes CR-231's local-state decision. First live run found a 500 on the card
       (`url-filters.ts` was `'use client'`, called by the server page) — split, and a
       page test now guards it. Storybook's router mock does not mirror `pushState`, so
       filter interactions moved to URL-driven stories; clicks/back/forward are unit +
       live tested. Validation: web unit 876; Storybook 35/251 with axe; typecheck/lint/
       prettier clean; `next build --webpack` in a scratch copy (`apps/.web-buildcheck`,
       removed; dev server untouched, still 200); dev stack: junk → defaults, typing
       sends no request, Enter does, back/forward restore controls + list, card
       BackLink and browser back both return to the filtered list, reload keeps it,
       0 console errors; coverage gate green (web baseline raised).

6. [x] Overview + log — overview: 4 exact-filter counters link via
       `lib/admin/list-links.ts` (accessible name «Раздел, метрика: N. Открыть
       список»), «Обновить» + «Обновлено <date, HH:MM:SS>» (last success; failed
       refresh keeps data/time, `role=alert` line). Log: `features/admin/actions/
 filters.ts` (`ACTION_TARGET_TYPE`, `actionsFor`, `withMatchingAction`, parse),
       two `AdminSelect`s in the URL, filtered-empty state; `targetMissingWithId`
       (bare `targetMissing` removed). API: additive `action` query on
       `/v1/admin/actions`. Validation: api admin 21; web unit 883; Storybook 35/254;
       ui 264; api/types/ui/web typecheck + lint clean; coverage green (web baseline
       raised); dev stack 390 px — links/filters/back/junk/refresh OK, 0 console
       errors, no horizontal scroll. `next build` not re-run (client-only changes;
       item 5's build passed). Full api coverage gate not run (would empty dev DB).
       Dev DB was emptied by the api test runs (items 1 and 6) — re-seeded
       (`seed:demo --no-routes`: 11 users, 9 rides, 7 reviews); disposable
       `admin-check-*@example.com` (admin revoked).

7. [x] Validation sweep + review fixes (owner checklist: narrow tests, typecheck/lint/
       prettier, api admin/auth/rides/reviews, web unit + Storybook axe, coverage,
       `21st review`, real browser 320/390/1280 × light/dark, disposable mutations). - API tests on a separate `coffee_ride_test` DB (created, migrated, dropped) —
       dev data untouched: 455 passed / 6 live skipped; full coverage with live
       Redis/S3: api 661/0 skipped, gate green. - `21st review` does not exist in the installed `21st` CLI (no `review`
       command) → replaced by `/code-review` (medium) on the four admin dirs. - Fixed (confirmed findings): malformed `/admin/users/<id>` → `notFound()`
       before any request (`lib/uuid.ts` `isUuid`, shared with `server-ride.ts`);
       ids `encodeURIComponent`-ed in admin api.ts; `adminRequest` non-JSON error →
       `ApiError` (`unexpected_response`, real status); reason dialog not dismissible
       while sending (state lifted, late `onClose` can't close another dialog);
       `bg-raised` → `bg-bg-raised`, overview hover `bg-surface`. Tests: users
       «cannot be dismissed while the block is in flight», admin-lib non-JSON
       errors, page malformed id ×3; negative checks — fix reverted → test fails. - Not fixed (project-state "Next" 0): self «Завершить все сессии», list vs card
       name, row kept under a stale filter (deliberate), `CANCELLABLE` mirror,
       `server-admin.ts` header duplication; KI-098 (bad id → not-found page, 200). - Validation after fixes: web unit 886, Storybook 35/254 (axe), ui 264, db 16,
       typecheck/lint (forced, uncached)/prettier clean; web coverage +0.04..0.08,
       baseline raised. - Browser (Playwright, dev stack): 7 pages (`/admin`, users, user card, rides,
       ride card = `/rides/:id` from the admin list, reviews, actions) × 320/390/1280
       × light (stored `coffee-ride-theme=light` — dark is the default, ADR-024)/
       dark: all 200, `noindex` on `/admin/*`, scrollWidth == clientWidth, 0 console
       errors; active mobile tab «Отзывы»/«Журнал» inside the row, page scroll 0;
       users `?q=qa-&filter=unverified` and rides
       `?status=registration_open&visibility=visible` survive card → back with the
       controls; block → login 403 → unblock → login 200, log rows written; dialog
       panel 356 px inside 390. - Cleanup: 5 disposable accounts deleted (incl. CR-232's leftover
       `admin-check-1791641878`); dev DB = seed (11 users, 9 rides, 7 reviews,
       0 admins). Their 15 `admin_actions` rows stay (append-only log; actor set
       null by FK).

Items arrive from the owner one by one; continue with the next when it comes.
