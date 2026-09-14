# Current Task

## Status

complete

## Task ID

CR-015 — Organizer dashboard

## Goal

Give `/organizer` (currently a static `EmptyState` stub left by CR-014) real content:
`docs/design.md` §8 lists it as "Dashboard (widgets from the ADR-009 registry)". Next
unchecked backlog item after CR-014 (`docs/tasks.md`).

User asked to do CR-015 together with CR-016 ("Organizer authorization") in one pass.
Checked repository docs first (`.claude/CLAUDE.md` non-negotiable rule: repo is the
source of truth, not chat history) and two sibling Claude sessions on this machine — no
prior plan for combining them exists anywhere. CR-016 is explicitly documented
(`.claude/context/project-state.md`, CR-014's changelog entry) as depending on `Ride`
(CR-017+): "organizer capability itself has no server-side authorization check to
protect anything with yet — CR-016 is explicitly that, once Ride/CR-017+ gives it
something organizer-owned." No organizer-owned resource exists in the schema yet, so
there is nothing for an ownership check to protect. Per the user's own instruction to
follow the plan as originally documented, CR-015 proceeds alone; CR-016 stays in
`docs/tasks.md` unchecked, unchanged, to be picked up once CR-017 exists.

Context read this session: `.claude/CLAUDE.md`, all `.claude/rules/*.md`, `docs/tasks.md`,
`.claude/context/{project-state,architecture-map,current-task,known-issues}.md`,
`docs/{design.md §8, decisions.md ADR-009}`, `.claude/skills/new-cabinet-feature/SKILL.md`,
`apps/web/src/{components/cabinet/CabinetShell.tsx, lib/cabinet/*, app/organizer/**,
app/me/page.tsx, features/organizer/profile/**}`, `packages/ui/src/{index.ts,
terminology.ts, components/{Card,EmptyState,ErrorState,Skeleton}.tsx}`.

## Scoping decisions (design.md doesn't enumerate widget contents)

- CR-054 ("Feature registry for dashboard nav/widgets ... + feature flags", still open,
  `docs/tasks.md`) is explicitly the ticket that generalizes nav into a full
  flag-aware widget system for _both_ cabinets. CR-015 does not anticipate that —
  same "build the minimal real thing now" discipline CR-013 used for the nav registry
  before CR-054 existed. This ticket adds a small, organizer-only widget registry
  (`ORGANIZER_WIDGETS`, mirrors `ORGANIZER_NAV_ITEMS`'s shape: `id`, `order`,
  `Component`) — no feature flags, no participant-side changes.
- Only one organizer-owned data source exists in the schema today: `OrganizerProfile`
  (CR-014). So the only widget this ticket can honestly build is an organizer-profile
  summary widget (name, description, edit link) sourced from the existing
  `GET /v1/organizers/me`. No ride-related widgets — `Ride` doesn't exist yet
  (CR-017+); inventing placeholder ride widgets would be exactly the kind of
  speculative building CR-014's own scoping notes avoided elsewhere.
- Widget lives in the feature module that owns the data (`features/organizer/profile/`,
  ADR-009 "a feature registers itself"), not a new cross-feature component — same
  pattern `organizerProfileNavItem` already uses in `nav.ts`.
- No new API endpoint needed — reuses `getOrganizerProfile()` from CR-014's
  `features/organizer/profile/api.ts` as-is.
- `/organizer` page: replaces the generic `EmptyState` stub with a widget grid
  rendered from `ORGANIZER_WIDGETS` (registration over branching, ADR-009); keeps an
  `EmptyState` fallback for the (currently unreachable, but future-proof) case of an
  empty registry rather than assuming at least one widget always exists.

## Requirements

- `apps/web/src/lib/cabinet/types.ts`: new `DashboardWidget` descriptor type (`id`,
  `order`, `Component`), alongside the existing `CabinetNavItem`.
- `apps/web/src/features/organizer/profile/components/OrganizerProfileWidget.tsx`
  (new): fetches `getOrganizerProfile()`; loading → `Skeleton`; 404
  `organizer_profile_not_found` → `EmptyState` with a "create profile" link to
  `/organizer/profile`; other error → `ErrorState`; success → `Card` showing name,
  description (or nothing if absent — not a metric, no "—" placeholder needed), edit
  link to `/organizer/profile`.
- `apps/web/src/features/organizer/profile/nav.ts`: add `organizerProfileWidget: DashboardWidget` export alongside the existing `organizerProfileNavItem`.
- `apps/web/src/lib/cabinet/organizer-widgets.ts` (new): `ORGANIZER_WIDGETS` registry,
  same shape/sort convention as `organizer-nav.ts`.
- `apps/web/src/app/organizer/page.tsx`: render `ORGANIZER_WIDGETS` as a grid instead
  of the static stub `EmptyState`.
- `packages/ui/src/terminology.ts`: new widget-specific `ORGANIZER_TERMS` entries
  (dashboard widget empty/error/edit-link copy); retire the now-unused
  `CABINET_TERMS.organizerHomeEmptyTitle/organizerHomeEmptyDescription` only if nothing
  else references them (checked: nothing else does).
- New test: `apps/web/src/features/organizer/profile/organizer-profile-widget.test.tsx`
  covering loading/empty(404)/error/success states, same mocking pattern as the
  existing `organizer-profile.test.tsx`.

## Acceptance criteria

- `/organizer` for an authenticated user with no `OrganizerProfile` yet shows a
  "create profile" empty state linking to `/organizer/profile`, not a blank/generic
  stub.
- `/organizer` for an authenticated user with an existing `OrganizerProfile` shows its
  name/description and a link to edit it.
- A load failure other than "not found" shows a plain-language error, no stack
  trace/status code.
- Unauthenticated visit still redirects to `/login` (unchanged `CabinetShell`
  behavior, not touched by this ticket).
- `turbo run lint/typecheck/build/test` (run separately) all green; `format:check`/
  `lint:root` clean.
- Live check: real Postgres + both dev servers via the `browser-automation` skill —
  no-profile state and existing-profile state both visually verified.
- CR-016 explicitly NOT implemented this session; `docs/tasks.md` line for it stays
  unchecked and unmodified, no code claims to satisfy it.

## Planned files

- `apps/web/src/lib/cabinet/types.ts` (+`DashboardWidget`)
- `apps/web/src/lib/cabinet/organizer-widgets.ts` (new)
- `apps/web/src/features/organizer/profile/nav.ts` (+`organizerProfileWidget`)
- `apps/web/src/features/organizer/profile/components/OrganizerProfileWidget.tsx` (new)
- `apps/web/src/features/organizer/profile/organizer-profile-widget.test.tsx` (new)
- `apps/web/src/app/organizer/page.tsx` (rewrite body)
- `packages/ui/src/terminology.ts` (+widget terms, -2 now-dead stub terms)
- `docs/changelog.md`, `.claude/context/project-state.md`,
  `.claude/context/architecture-map.md`, `docs/tasks.md`, `docs/api.md` (only if
  contract changes — expected: no contract change)

## Implementation progress

- [x] Plan written (this file)
- [x] `apps/web` widget registry + component + page
- [x] `packages/ui` terminology
- [x] Tests
- [x] Full validation
- [x] Live check
- [x] Context/docs updated (changelog, project-state, architecture-map,
      tasks.md)
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run typecheck lint test build` (all 9 packages, run together with a
  real `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
  — Docker Desktop is unavailable in this environment, same as noted
  elsewhere; a local Homebrew Postgres with the same `coffee_ride_dev`
  scratch DB CR-014 used was available instead): all 25 tasks green.
  `apps/web` 35 tests (was 31, +4, all in the new
  `organizer-profile-widget.test.tsx`); `apps/api` 50 tests (unchanged, no
  `apps/api` file touched); `packages/ui` 85 tests (unchanged, terminology
  data only). `next build` compiles `/organizer` cleanly.
- `pnpm format:check` / `pnpm lint:root`: clean (after one `prettier --write`
  pass this session on 4 files, caught by `format:check` itself).
- Live check via the `browser-automation` skill against a real `next dev`
  server + `apps/api`: registered + email-verified a fresh account (curl, no
  verify-email screen exists yet); logged in through the browser; `/organizer`
  with no `OrganizerProfile` showed the "Профиль организатора ещё не создан"
  empty state with a working "Создать профиль" link to `/organizer/profile`;
  created a profile through that existing form; revisited `/organizer` — the
  widget now showed the profile summary (name, description) and a working
  "Редактировать" link. Console errors: only the widget's own expected 404 on
  `GET /v1/organizers/me` (the not-found case itself, not a bug) plus ordinary
  Next dev-server hot-reload noise. Test account and its rows deleted from the
  scratch DB afterward.
- Every acceptance criterion from above is met, including "CR-016 explicitly
  NOT implemented" — confirmed: no `apps/api` files touched, `docs/tasks.md`'s
  CR-016 line is unchanged.

## Discovered issues

None found this session — no bugs surfaced by the widget's own test suite or
the live browser check.

## Final result

CR-015 complete. `/organizer` now renders a real ADR-009 `DashboardWidget`
registry (`lib/cabinet/organizer-widgets.ts`) instead of CR-014's static stub,
with one widget — a read-only `OrganizerProfile` summary reusing CR-014's
existing `GET /v1/organizers/me` client, no new API endpoint or contract
change. CR-016 ("Organizer authorization") was deliberately NOT done in this
pass, after confirming with the repository (not chat memory) and two sibling
Claude sessions that no prior plan to combine it with CR-015 existed, and that
CR-016 is documented as blocked on `Ride`/CR-017+ — there is nothing
organizer-owned yet for an ownership check to protect. All acceptance
criteria met, full validation suite green, live-verified end to end via a
real browser session. `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md`, `.claude/context/architecture-map.md` all
updated; `docs/api.md`/`docs/database.md` untouched (no contract/schema
change this ticket). Not yet committed — `git diff`/`git status` reviewed
next; pre-existing unrelated pending changes (`docs/product.md`,
`.mcp.json`, `skills-lock.json`) left untouched and out of scope, same as
CR-014 left them.
