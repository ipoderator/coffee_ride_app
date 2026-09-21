import type { RoutePointType } from 'types';

// Feature-local (`.claude/rules/extensibility.md` — same precedent as
// `StopList`/`RideCard`): maps each `RoutePoint.type` to a design-token CSS
// custom property name (`packages/ui/src/tokens.css`), resolved at render
// time via `getCssColorVar` — never a raw hex literal (`docs/design.md`
// §14). Chosen for a reasonably intuitive match (danger→danger, water→info)
// where one exists; the rest fall back to a neutral distinguishing tone.
// `Stop` (the named-stop entity, not the `'stop'` RoutePointType) reuses
// `--warning` too — both represent a planned pause along the route.
export const ROUTE_POINT_MARKER_COLOR_VAR: Record<RoutePointType, string> = {
  start: '--success',
  finish: '--primary',
  stop: '--warning',
  danger: '--danger',
  water: '--info',
  food: '--chart-secondary',
  technical: '--text-muted',
  other: '--text-muted',
};

export const STOP_MARKER_COLOR_VAR = '--warning';

// One-letter labels shown inside each colored marker (`docs/rules/frontend.md`:
// "do not rely on color alone for important information") — a colorblind
// viewer can still tell markers apart by glyph, not just hue.
export const ROUTE_POINT_MARKER_LABEL: Record<RoutePointType, string> = {
  start: 'С',
  finish: 'Ф',
  stop: 'О',
  danger: '!',
  water: 'В',
  food: 'Е',
  technical: 'Т',
  other: '?',
};

export const STOP_MARKER_LABEL = 'О';
