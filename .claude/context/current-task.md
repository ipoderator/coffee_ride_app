# Current task — CR-171: the map as the main emotional layer

> CR-169 (KI-081) and CR-170 (micro-animations) are complete but **not yet
> committed**; their records are in `docs/changelog.md`, `docs/tasks.md`,
> `project-state.md`. CR-171 builds on that working tree — three commits.

## Goal

Owner's request (2026-10-01): on `/` (discovery «Карта»), make the map the main
emotional layer:

1. a soft draw-in of the route on the map when a ride card is chosen;
2. a pulse of the start point;
3. unobtrusive elevation/difficulty markers right on the line.

## Requirements

- Provider-neutral: additive `maps-core` contract fields, implemented in
  `packages/maps-2gis` only (`.claude/rules/maps.md`); no vendor type leaks.
- MapGL `Polyline` has no `setCoordinates` → draw by rebuilding the line prefix
  per animation frame inside the adapter; an update during a draw (the full
  geometry replacing the ≤40-point preview) continues the running draw.
- Pulse is **finite** (3 pulses ≈ 4 s, WCAG 2.2.2) and only on the ride that just
  became active; the CR-170 "no loops" rule stays.
- Reduced motion: no draw, no pulse, no reveal — the final state at once.
- `setMarkers` reconciles by id so an unrelated update (a tag appearing, the
  full geometry arriving) does not recreate pins and restart their pulse.
- Markers: difficulty (word + segment meter, `docs/design.md` §6) mid-route;
  the summit «▲ 214 м» when the full geometry has a meaningful climb. Tags are
  non-interactive and fade in as the line reaches them.
- Colours from `--map-*` tokens via `getCssColorVar`; strings via terminology.

## Acceptance criteria

- Choosing a row (hover/focus/pin) draws its route in; the preview→full upgrade
  does not restart it; theme change does not redraw.
- Active start ring pulses three times then stops.
- Difficulty tag on the line; summit tag once elevation is known.
- Unit tests (adapter, DiscoveryMap, pure lib); typecheck/lint/coverage; docs.

## Planned files

- `packages/maps-core/src/render.ts`, `packages/maps-2gis/src/render.ts` (+ test)
- `apps/web/src/features/participant/discovery/components/DiscoveryMap.tsx`
- `apps/web/src/features/participant/discovery/lib/route-highlights.ts` (+ test)
- `apps/web/src/features/participant/discovery/discovery.test.tsx`
- `packages/ui/src/terminology.ts`
- `docs/design.md`, `.claude/rules/maps.md`, changelog/tasks/state

## Implementation progress

- [x] Contract (`drawInMs`, `pulse`, `revealDelayMs`, `meter`, `shape: 'tag'`)
- [x] Adapter: reconcile by id, pulse, tag, reveal, draw (`linePrefix`)
- [x] Highlights lib (`route-highlights.ts`)
- [x] DiscoveryMap wiring (line effect before markers effect)
- [x] Tests
- [x] Validation (incl. live map check)
- [x] Docs/context

## Validation results

- `apps/web` unit 538; `packages/maps-2gis` 62 (+5 skipped); `packages/ui` 212;
  Storybook 90; `apps/api` 546 on the live stack; 17/17 typecheck+lint.
- Coverage holds; baseline regenerated (two auth floors kept).
- Live: draw, pulse, «Средний» + «▲ 192 м» on the Krylatskoe route.

## Discovered issues

- Hover does not move the camera (CR-170), and a pan keeps the zoom, so on a
  long route the notes can sit off-screen. Fitting the route on selection
  would show them, but that is a product decision (bigger camera move).
- No Storybook story for adapter-drawn map effects (no key; stories may not
  import `maps-2gis`).

## Follow-up — CR-172 (owner approved)

The off-screen-notes issue above is resolved: selection now frames the whole
route (eased `fitBounds`, `MapFitOptions.durationMs`); no-route rides still pan.
Validation: web unit 539, maps-2gis 65, typecheck+lint, coverage holds; live
check frames the Krylatskoe loop with both notes in view.

## Final result

Done. CR-169, CR-170, CR-171, CR-172 are committed together.
