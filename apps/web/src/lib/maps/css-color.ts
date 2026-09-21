// Resolves a design-token CSS custom property (`packages/ui/src/tokens.css`)
// to its current computed color value, for the one legitimate exception to
// "never hard-code a color" (`docs/design.md` §14): a map SDK (2GIS MapGL)
// draws markers/polylines on a canvas, not the DOM, so it cannot consume a
// Tailwind utility class — it needs a literal color string, resolved at call
// time so it still follows the active light/dark theme (`.dark` on
// `document.documentElement`, `apps/web/src/app/layout.tsx`).
export function getCssColorVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
