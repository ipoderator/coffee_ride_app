# Current task

## Task ID

CR-044 (Responsive UI) + CR-045 (Accessibility) + CR-046 (Error/loading/empty states) +
CR-047 (Security review) + CR-048 (Performance review) — "Quality" backlog section.

## Goal

`docs/tasks.md`: "These three [CR-044/045/046] are verification passes over screens
already built to `docs/design.md`, not the point where responsive/a11y/state work
starts. A screen that ships without them is not done." Audit every screen against
`docs/design.md` §10 (states)/§11 (responsive)/§12 (a11y) and every mutating endpoint
against `.claude/rules/security.md` (CR-047), plus a performance pass (CR-048, no prior
rules file — general N+1/index/pagination/bundle judgment). Fix every real gap found;
document (don't implement) findings that belong to an already-tracked separate ticket
(CR-058 Redis rate limiting, CR-060 password reset, CR-061 security headers).

## Audit findings (3 parallel Explore-agent passes, methodology: grep + read across all

16 `apps/web/src/app/**/page.tsx` screens, their feature modules, `packages/ui`
components, and `apps/api`'s modules/schema)

### CR-046 — states (mostly compliant; one systemic gap)

- Skeletons, empty states, forms (validation/pending/dup-submit), and CR-052 degraded
  states (map/S3-upload placeholders) are already correct everywhere checked.
- **Gap**: 12 of 14 `ErrorState` call sites render `message` only, no `onRetry`, though
  design.md §10 point 3 requires a retry affordance and two call sites
  (`ReviewList.tsx`, `RideDetailView.tsx`'s `RouteSection`) already prove the pattern.
  Sites to fix: `DiscoveryList.tsx`, `MyRidesView.tsx`, `NotificationList.tsx`,
  `RideDetailView.tsx` (top-level ride load), `RidesList.tsx`, `EditRideForm.tsx`,
  `ParticipantTable.tsx`, `WaitlistTable.tsx`, `RouteUploadForm.tsx`,
  `OrganizerProfileForm.tsx`, `OrganizerProfileWidget.tsx`, `UpdateComposer.tsx`.
- **Minor**: `UpdateComposer.tsx` surfaces raw `problem.detail` on submit failure
  instead of a static `terminology.ts` term like every other form — not a leak
  (`detail` is contractually safe per `.claude/rules/backend.md`), just an
  inconsistency. Normalize while touching this file for the retry fix.

### CR-044 — responsive (design.md §11's 5 named breakpoint requirements)

1. `CabinetShell.tsx` (shared shell for all 12 `/me/*`+`/organizer/*` pages): single
   unconditional `<nav>` row, zero responsive classes. Needs base = bottom nav, md+ =
   side nav, per §11.
2. `RideDetailView.tsx`: single-column at every width; §11 wants two-column at md.
3. Discovery (`DiscoveryList.tsx`/`DiscoveryViewToggle.tsx`): list/map are mutually
   exclusive via a toggle; §11 wants a combined split view at lg — `DiscoveryViewToggle`
   already has a code comment deferring this exact work to CR-044.
4. `packages/ui/MetricRow.tsx`: jumps straight from base (2-col grid) to md
   (flex-row), skipping §11's distinct sm-breakpoint two-column step.
5. No shared max-width-1200px-centered container exists for xl — needed once (root
   layout or a shared wrapper), not per-page.

- Everything else checked (participant/waitlist lists, forms) is already
  mobile-first/card-based and compliant — not touched.

### CR-045 — accessibility (design.md §12)

1. No `<main>` landmark on any of the 12 cabinet pages — `CabinetShell.tsx` wraps
   content in a plain `<div>`. Fix once in the shell.
2. Everything else verified compliant: no raw hex (ESLint rule active + clean), focus
   rings present on all shared interactive primitives, every form input has a real
   `<label>` + `aria-describedby` error linking (`FormField.tsx`), no color-alone
   conveyance (`StatusBadge`/`DifficultyScale` always pair with text), reduced-motion
   respected where it matters (`Skeleton`'s `motion-safe:animate-pulse`, test-enforced),
   one real `<h1>` per page. No code change needed for these.
3. Map keyboard operability: not yet applicable — no live 2GIS integration exists
   (KI-016/KI-031), current map UI is a degraded placeholder with no interactive
   surface. Record as a requirement to re-verify once a live map ships, not a fixable
   gap today.

### CR-047 — security (`.claude/rules/security.md` walkthrough)

- Verified compliant: Argon2id hashing, no plaintext anywhere, account-enumeration-safe
  login errors, session cookie flags (httpOnly/Secure-in-prod/SameSite=Lax), CSRF
  plugin wired (not just written), consistent server-side ownership checks across
  rides/registrations/reviews/organizers (identity always from session, never
  client-supplied), Zod on every route, parameterized Drizzle queries only, participant
  responses minimized (no phone/email in participant-list schemas), `.env` gitignored/no
  hardcoded secrets, audit columns (`updatedBy`/timestamps) present on sensitive tables.
- **HIGH, not fixed here**: no `@fastify/helmet` (or equivalent) registered — zero
  security headers on any response. This is CR-061's exact scope (currently open in
  `docs/tasks.md`); documenting in `known-issues.md`, not implementing under CR-047 per
  explicit scope decision (avoid mixing into a separate tracked ticket).
- **MEDIUM/LOW, not fixed here**: auth + global rate limiting are still in-memory,
  per-IP-only, single-instance (`@fastify/rate-limit`'s default store) — this is
  CR-058's exact scope (blocked on KI-014, Redis never live-verified). Same treatment:
  document, don't implement.

### CR-048 — performance

- Verified compliant: organizer rating aggregate is a genuine batched `GROUP BY` query
  (not N+1), explicit indexes exist on the FK/filter columns that matter
  (`registrations`, `waitlist_entries`, `reviews`, `rides` lat/lng), every list
  endpoint uses the shared cursor-pagination helper (ADR-011).
- **LOW**: `RideCard.tsx` and `RideDetailView.tsx` render `ride.coverImageUrl` via a
  raw `<img>` (eslint-disabled) instead of `next/image`. Currently inert
  (`coverImageUrl` is always `null` — no S3 pipeline yet, KI-023/CR-086), but cheap to
  fix now so it doesn't ship unoptimized once CR-086 lands. Fixing under CR-048 (not a
  separate architectural decision — swapping the tag doesn't require CR-086 first,
  `next/image` handles a `null`/absent `src` the same way conditional rendering already
  does).

## Scope decision

Per user confirmation: fix every real gap found above; for HIGH/MEDIUM/LOW security
findings that are the exact scope of an already-tracked separate ticket (CR-058,
CR-060, CR-061), document only (known-issues.md), do not implement under this task.

## Planned files

- `apps/web/src/components/cabinet/CabinetShell.tsx` — `<main>` landmark + responsive
  nav (bottom nav base, side nav md+).
- `apps/web/src/features/participant/ride-detail/components/RideDetailView.tsx` —
  two-column layout at md; add `onRetry` to top-level error state.
- `apps/web/src/features/participant/discovery/components/{DiscoveryList,DiscoveryViewToggle}.tsx`
  — lg+ combined list+map split view.
- `packages/ui/src/components/MetricRow.tsx` — distinct `sm:` step.
- `apps/web/src/app/layout.tsx` (or a shared wrapper) — xl max-width-1200px container.
- 11 remaining `ErrorState` call sites (listed above under CR-046) — add `onRetry`.
- `apps/web/src/features/organizer/updates/components/UpdateComposer.tsx` — retry +
  normalize error message to a `terminology.ts` term.
- `apps/web/src/features/participant/discovery/components/RideCard.tsx`,
  `.../ride-detail/components/RideDetailView.tsx` — `<img>` → `next/image`.
- `.claude/context/known-issues.md` — record CR-047's HIGH/MEDIUM/LOW findings pointing
  at CR-061/CR-058.
- `docs/tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`.

## Implementation progress

- [x] 3 parallel audits (states / responsive+a11y / security+perf) completed.
- [x] CR-044 responsive fixes (`CabinetShell`, `RideDetailView`, `DiscoveryList`/
      `DiscoveryViewToggle`, `MetricRow`, root `layout.tsx` + widened per-page
      max-widths on `page.tsx`/`rides/[id]/page.tsx`).
- [x] CR-045 `<main>` landmark fix (part of the `CabinetShell` edit above).
- [x] CR-046 retry affordances (11 sites) + `UpdateComposer` normalization.
- [x] CR-047 known-issues documentation (KI-022 widened, not a new entry).
- [x] CR-048 `next/image` conversion (`RideCard`, `RideDetailView`).
- [x] Validation (lint/typecheck/test/build).
- [x] Context docs updated (`docs/tasks.md`, `docs/changelog.md`,
      `.claude/context/project-state.md`, `.claude/context/known-issues.md`).

## Validation results

`pnpm --filter ui --filter web run typecheck` — clean. `... run lint` — clean.
`... run test` — `packages/ui` 90/90 passed, `apps/web` 157/157 passed (+2 new:
`discovery.test.tsx`'s split-view class-assertion tests, replacing the old
DOM-presence assertion the CR-044 split-view fix made incorrect).
`NODE_ENV=production pnpm --filter ui --filter web --filter types run build` —
all green, 14 routes generated. `apps/api`/`packages/db` untouched by this
task, not re-run.

## Discovered issues

None beyond the audit findings already recorded above — every fix matched what
the audit predicted, no new gap surfaced during implementation.

## Final result

CR-044 (Responsive UI), CR-045 (Accessibility), CR-046 (Error/loading/empty
states), CR-047 (Security review), and CR-048 (Performance review) are complete
and shipped. `docs/tasks.md`'s Quality section is fully checked off. Next
logical task: Resilience (CR-049 timeout/retry/circuit-breaker utilities,
CR-050 async notification delivery via Redis queue, CR-051 health check
endpoint, CR-052 frontend degraded-state handling).
