# Current task

## CR-152 — Typography & responsive consistency pass

Status: **done, committed** (2026-09-28); follow-up KI-077 (baselines from CI).
Previous task CR-151 is done and recorded in `docs/changelog.md`.

Mockup for approval: claude.ai/artifact/D9o9QsXikDVbMbDkDTsZxt (Design canvas,
8 artboards: system board + discovery/ride desktop+390, organizer create, my
rides, login).

### Goal

One consistent type system on every page, readable body text on phones,
touch-safe controls, cleaner font rendering — inside the existing ADR-024
«Ночной старт» identity (same palette, logo, Golos/Unbounded/Plex Mono).

### Audit evidence (2026-09-28, `apps/web/src` + `packages/ui/src`)

- `text-sm` (14px) used 242×, `text-base` 19× — body text is 14px site-wide,
  against `docs/design.md` §4 (16px reading floor).
- 10–11px text in 7 places: `BottomTabBar.tsx:132` (0.625rem),
  `AvatarStack.tsx:54`, `RouteTimeline.tsx:68`, `ElevationProfileChart.tsx:169,181`,
  `RideGridCard.tsx:107,131` (0.6875rem).
- 8 arbitrary sizes (13/15/17px, 1.625rem…) — `tokens.css` has no type-scale
  tokens at all.
- h1: 19× `text-2xl font-semibold`, `RideGrid.tsx:69` `text-4xl`,
  `RiderProfileCard.tsx:161` `font-display text-xl`; h2 has 10 variants.
- 5 font families; Sofia Sans Condensed (`font-display`, 21 uses) and IBM Plex
  Mono (20 uses) overlap in the label role.
- No `font-synthesis`, font-smoothing, `text-wrap: balance` settings in
  `globals.css`.
- 21 `h-8/h-9/size-8/size-9` usages to check against the 44/48px target rule.

### Proposed scope (after approval)

1. Role type-scale tokens in `packages/ui/src/tokens.css` (`--text-display/h1/h2/
h3/body/secondary/label/metric`, mobile→desktop), documented in
   `docs/design.md` §4.
2. Unbounded only for display + h1; h2/h3/card titles → Golos 600.
3. Labels → IBM Plex Mono; retire Sofia Sans Condensed (needs ADR-024 addendum).
4. Body text 14→16px, secondary 15px, nothing under 12px (tab bar 12px).
5. Render quality: `font-synthesis: none`, antialiased in dark theme,
   `text-wrap: balance` on headings, metric fallback fonts.
6. Touch targets / 320–1440 overflow sweep; discovery page head (toggle beside
   h1), filter chips as a scroll row on mobile.
7. Refresh visual baselines (Docker, linux/amd64) per `.claude/rules/testing.md`.

### Decisions (2026-09-28)

- Retire Sofia Sans Condensed; labels → IBM Plex Mono (ADR-026 amends ADR-024 §typography).
- Unbounded only for display + h1; h2/h3/card titles → Golos 600.
- Ride-detail sticky CTA: already shipped in CR-151 (`TicketBar`; `BottomTabBar`
  hides on `/rides/[id]`) — nothing to build.
- Role sizes are Tailwind v4 `--text-*` theme tokens (`text-display/h1/h2/h3/body/
body-sm/label/metric`), phone values on `:root`, desktop from `md` (48rem).
  `cn()` in both apps/web and packages/ui must learn these as font-size classes
  (tailwind-merge otherwise treats `text-h1` as a colour and drops `text-text`).
- Mechanical rule: `text-sm` → `text-body-sm` (15px) by default; reading text,
  form inputs, descriptions → `text-body` (16px). Nothing under 12px.

### Progress

- [x] tokens + cn (`TEXT_ROLES`, apps/web re-exports ui's `cn`)
- [x] globals.css render settings, heading faces
- [x] fonts: Sofia Sans Condensed removed (layout, woff2, licence, build script)
- [x] sweep packages/ui + apps/web (~90 files)
- [x] touch targets (text actions, SegmentedControl, ErrorState retry, avatars,
      wordmark links); discovery switch beside h1; card metric labels wrap on a subgrid
- [x] validation: ui 172, web 461 unit; typecheck/lint; next build; e2e 39/39
      functional; dev server 320/390/1440 — no h-scroll, no text < 12px
- [x] docs: design.md §4/§5, ADR-026, changelog, tasks, project-state,
      architecture-map, KI-077
- [ ] visual baselines — KI-077 (needs push + CI artifacts)
