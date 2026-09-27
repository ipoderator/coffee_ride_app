# Current task

## CR-144 — Discovery grid card redesign («B2»)

Status: complete, committed.

### Goal

The product owner reported the `/` grid card as cluttered and hard to read: status,
date, title, three unlabelled metrics and seats all stacked over the route art at low
contrast. Of three mockups (claude.ai artifact «Ride card redesign — 3 options») they
chose option B and asked for it refined («B2»), then implemented.

### Requirements (B2, approved mockup)

- Cover (`RouteCover`) carries only the route track + the status chip. No text over
  the art; a ride without a route shows a quiet «Маршрут пока не загружен» caption.
- Everything else lives on a theme-aware `bg-raised` panel below the cover:
  date line → title (always two lines tall, so grid rows align) → three labelled
  metric columns → seats with a fill bar → chips (bike type, difficulty, price).
- Metrics: always three columns (distance, elevation, pace) with labels
  (`METRIC_TERMS`); a missing value is «—»; groups count under the pace; when all
  three are missing, one line «Дистанция и темп не указаны». Elevation in the
  `elevation` ink (`docs/design.md` §1), not the brand purple.
- Seats: «17 из 20 участников» + «Осталось 3 места» (warning when low) + bar;
  no limit → participant count + «Без ограничения мест», no bar; cancelled → no
  seats block.
- Status chip: an open ride that is full reads «Список ожидания» (info) — the
  waitlist is joinable exactly then (`registrations.service.ts` `joinWaitlist`)
  — instead of a green «Регистрация открыта».
- Cancelled: desaturated cover, solid red chip, struck-through muted title.
- Status chip stays legible on the always-dark cover in the light theme too.
- Hover: border brightens, slight lift (motion-safe); visible focus ring.

### Acceptance criteria

- [x] `RideGridCard`/`RouteCover` implement the above; `RideLegendRow` (map tab)
      unchanged in behavior.
- [x] Shared helpers in `lib/ride-metrics.ts` (metric tiles, seats, status) are
      unit-tested, including the waitlist status and «—» metrics.
- [x] New `RideGridCard.test.tsx` covers labelled metrics, seats variants,
      no-metrics line, cancelled state, chips, link target.
- [x] `packages/ui` changes additive only (new terms; optional prop defaults
      unchanged); ui tests + both cabinets' web tests pass.
- [x] Typecheck/lint/format/tests pass; live check in the running dev server.
- [x] Visual baselines (`discovery-grid`, `ride-card`, themes) regenerated the
      CI way (Docker, `.claude/rules/testing.md`) or the gap recorded.
- [x] Docs: `docs/design.md`, changelog, tasks, project-state.

### Planned files

- `apps/web/src/features/participant/discovery/components/{RideGridCard,RouteCover,
RideGrid}.tsx` (+ tests)
- `apps/web/src/features/participant/discovery/lib/ride-metrics.ts` (+ test)
- `packages/ui/src/terminology.ts`, `packages/ui/src/components/DifficultyScale.tsx`
  (optional `size`)
- `docs/design.md`, `docs/changelog.md`, `docs/tasks.md`,
  `.claude/context/project-state.md`

### Progress / validation

- Unit: new `RideGridCard.test.tsx` (9), ride-metrics (+9), terms (+2),
  `DifficultyScale` (+1). Waitlist branch mutation-checked (2 tests fail).
- Full suites, CI env (Postgres/Redis with password/S3, live flags): api
  465/465, web 439/439, ui 155/155, maps-2gis, resilience green.
- typecheck/eslint/prettier clean (web, ui). `next build` not run (would
  clobber the running dev server's `.next`).
- Live: dev server, dark/light, desktop/Pixel 5. Found and fixed: the seats
  row wrapped mid-phrase («Пока никто не записался» + note) → shorter zero
  wording «Пока нет участников», halves `whitespace-nowrap` in a wrapping row.
- Visual: baselines regenerated in Playwright 1.63.0-jammy Docker (AppleDouble
  `._*` files in the macOS tar broke the first two runs — excluded), grid/card
  forced with `--update-snapshots=all`, verify run 16/16.
- Coverage baseline raised, no row decreased.

### Discovered issues

- KI-073: dark-on-dark layout changes pass the screenshot tolerance.
- Fixed in passing: cancelled chip lost its red fill on the cover (twMerge).

### Final result

Implemented as approved; docs updated (design.md §1/§6/§9, changelog,
tasks, project-state, known-issues).
