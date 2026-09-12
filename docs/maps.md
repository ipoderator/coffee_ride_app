# Maps Integration

Provider: 2GIS (MapGL JS API for the web map; 2GIS Geocoder API and Directions/Routing
API for geocoding and route building as needed).

Use cases:

- ride discovery;
- start/finish;
- route visualization;
- stops;
- route points;
- geocoding.

Internal route concepts must be provider-neutral.

GPX should be converted to the internal route representation, preferably GeoJSON or an equivalent neutral format.

Production checklist:

- credentials (2GIS API key, per-product if Geocoder/Directions are billed separately);
- domain restrictions;
- quotas/rate limits (2GIS enforces per-key request limits — verify current tier);
- licensing/terms (2GIS attribution requirements on rendered maps);
- geocoding/routing APIs (confirm coverage for target regions/cities);
- GPX/GeoJSON conversion;
- error/fallback behavior (see `.claude/rules/resilience.md`).
