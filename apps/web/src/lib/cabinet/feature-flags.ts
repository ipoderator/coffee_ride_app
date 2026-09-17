// CR-055 (ADR-009, `.claude/rules/extensibility.md`): a cabinet feature that's
// mid-rollout or risky ships behind a flag so it can be hidden by an env
// change + restart, never a code revert ("a rushed hotfix").
//
// Server-only by design. `CabinetNavItem`/`DashboardWidget` registries are
// only ever imported by Server Components (`app/organizer/layout.tsx`,
// `app/me/layout.tsx`, `app/organizer/page.tsx`) — `filterEnabled` runs there,
// before the already-filtered list crosses to a Client Component
// (`CabinetShell`, a widget's own `Component`). That's deliberate, not
// incidental: a flag read this way never needs the `NEXT_PUBLIC_` prefix
// (browser exposure is a real cost — see `.env.example`'s
// `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` note), and plain server-side
// `process.env[key]` access has none of Next.js's "only a literal
// `process.env.X` member expression gets statically inlined" restriction
// that a browser-bundled dynamic lookup would hit. Do not import this from a
// `'use client'` module — a flag would silently always read as disabled
// there (the browser bundle never sees a non-`NEXT_PUBLIC_` env var).
//
// Naming convention: `FEATURE_<NAME>`, e.g. `FEATURE_SAVED_ROUTES=true`.

const ENABLED_VALUES = new Set(['1', 'true']);

export function isFeatureEnabled(flag: string): boolean {
  const value = process.env[`FEATURE_${flag}`];
  return value !== undefined && ENABLED_VALUES.has(value.toLowerCase());
}

/**
 * Keeps every item with no `flag` (the default — always enabled) and every
 * flagged item whose flag is currently on. Registries stay a plain list of
 * what's registered; this is the one place staged-rollout filtering happens,
 * shared by the nav and widget registries alike.
 */
export function filterEnabled<T extends { flag?: string }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !item.flag || isFeatureEnabled(item.flag));
}
