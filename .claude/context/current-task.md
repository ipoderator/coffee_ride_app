# Current task

## CR-147 — First live 2GIS contract run (KI-056 via GitHub Actions)

Status: in progress.

### Goal

Run `provider.contract.test.ts` on GitHub's runners (the dev machine's VPN egress
can't reach 2GIS REST, KI-056) and fix what the live answers show.

### Done so far

- Environment `maps-2gis-contract` (branch policy: `main` only) created via `gh`;
  owner added the `MAPS_2GIS_API_KEY` secret and dispatched the workflow.
- Run `36386689239`: 2GIS reachable from GitHub. geocode + reverseGeocode pass;
  3 failures:
  1. getRoute elevation `15820` for Moscow — 2GIS altitudes are centimetres, the
     adapter passed them through as metres (built routes' gain ×100).
  2. Invalid key → geocode resolved `[]` — Catalog API answers HTTP 200 with the
     error in `meta.code`; the adapter never read `meta`, so a bad/expired key
     looked like "nothing found".
  3. Moscow → Reykjavik → HTTP 403 → `unavailable`, not `no_route`. Body unknown
     (adapter never surfaces it); likely "outside coverage".

### Plan

- route.ts: centimetres → metres. geocode.ts: read `meta.code` (200 ok, 404 empty,
  else `MapProviderError` with that status). Unit tests for both.
- Contract test: log the raw status/body of the out-of-coverage answer so the
  next run shows what 2GIS says; decide the 403 mapping after that.
- Validation: maps-2gis test/typecheck/lint; re-run the workflow after push
  (needs owner approval to push to `main`).
