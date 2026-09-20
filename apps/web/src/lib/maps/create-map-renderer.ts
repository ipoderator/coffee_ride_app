import { create2GisMapRenderer } from 'maps-2gis';
import type { MapRenderer } from 'maps-core';

// The one composition point (`.claude/rules/architecture.md`: "one
// composition point ... to wire the concrete adapter behind the
// maps-core interface") where a concrete 2GIS renderer is instantiated
// (ADR-010, ADR-020). `eslint.config.mjs` carries a matching override
// scoped to exactly this file — no other apps/web module may import
// `maps-2gis` directly (CR-056).
//
// Returns `null` when no public MapGL key is configured so callers can fall
// back to the existing degraded-state UI (`docs/design.md` §10) instead of
// throwing.
export function createMapRenderer(): MapRenderer | null {
  const apiKey = process.env.NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY;
  if (!apiKey) {
    return null;
  }
  return create2GisMapRenderer({ apiKey });
}
