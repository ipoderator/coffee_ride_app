---
name: map-provider-change
description: Use when adding a new map/geocoding provider or changing which provider is active — e.g. "switch the map provider", "add support for another maps API", "replace 2GIS with X". Follows ADR-010's adapter-package pattern so the swap doesn't touch ride/route/discovery feature code.
---

# Map Provider Change

Read first: `docs/decisions.md` ADR-003 and ADR-010, `.claude/rules/maps.md` (contains the
full `MapProvider` interface contract).

## Steps

1. **Never modify `packages/maps-core`'s public interface casually.** It's the
   provider-neutral contract every feature depends on. Only change it if the new
   requirement genuinely can't be expressed by the existing `MapProvider` interface — and
   if so, that change must work for every implemented provider, not just the new one.

2. **New provider = new package**, `packages/maps-<provider>`, implementing the
   `MapProvider` interface from `packages/maps-core`. This is the _only_ package allowed
   to import that provider's SDK.

3. **Implement resilience at the adapter level**, not in callers: timeout, bounded retry
   for idempotent calls only, circuit breaker, and a defined fallback per
   `.claude/rules/resilience.md`.

4. **Convert provider-specific shapes** (raw SDK geometry, marker objects, response
   formats) into the neutral types (`LatLng`, `GeocodeResult`, `RouteResult`) inside the
   adapter package. Nothing provider-specific leaks past this boundary.

5. **Switch the composition point** (the single place that decides which adapter is
   wired in, e.g. a factory reading config) — do not scatter provider selection across
   multiple files.

6. **Record the decision**, don't just change code silently:
   - update `docs/decisions.md` — mark the old ADR-003 status as superseded (keep the
     old entry, don't delete it) and note the new provider, same pattern used for the
     Yandex → 2GIS switch;
   - add an entry to `docs/changelog.md`;
   - update `.env.example` if a new API key env var is needed, and `docs/maps.md`'s
     production checklist.

7. **Test** geocoding, reverse geocoding, and route-building against the new adapter
   with the same test cases used for the existing one, so behavior parity is verified,
   not assumed.
