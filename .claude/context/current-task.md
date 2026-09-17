# Current task

## Task ID

CR-056 — "Document/lint rule preventing direct 2GIS SDK imports outside
`packages/maps-2gis`". Last ticket in the Extensibility foundations section.

## Goal

ADR-010 / `.claude/rules/maps.md`: "packages/maps-2gis — the only package
allowed to import the 2GIS SDK." CR-053 verified this held by convention
(repo-wide grep, no code change needed at the time). This ticket makes that
convention machine-enforced so a future session can't accidentally violate
it without ESLint catching it immediately.

## Investigation

- No actual 2GIS SDK npm dependency exists anywhere yet — `packages/
maps-2gis` calls 2GIS's REST APIs directly via `fetch` (`http.ts`), "no SDK
  dependency" per its own `docs/changelog.md` CR-007 entry. The rule is
  genuinely preventative (like `packages/resilience`, CR-049) — it protects
  against the day a real `@2gis/mapgl`-style package gets `pnpm add`ed for
  browser rendering (KI-031's blocked next step), not against an existing
  violation.
- Flat ESLint config has no directory cascading in this repo (confirmed by
  CR-010/KI-012, documented in the root `eslint.config.mjs`'s own comment) —
  every workspace member has its own `eslint.config.mjs`. Four packages
  (`maps-core`, `maps-2gis`, `resilience`, `types`) share `packages/config`'s
  `nodeLibraryConfig()` factory; `db`, `ui`, `apps/api`, `apps/web`,
  `packages/config` itself each hand-roll their own (same pattern the
  existing "no raw hex color" rule already follows — duplicated across
  `apps/web`/`packages/ui`, not centralized, since those two aren't on the
  shared Node-library factory).

## Decision

Add a `no-restricted-imports` rule blocking any import specifier matching
`*2gis*` (glob, catches `@2gis/mapgl`, `2gis-something`, etc. — the only
sensible npm-name shape a real vendor SDK would take) everywhere except
`packages/maps-2gis`:

- `nodeLibraryConfig()` (`packages/config/eslint/node-library.js`) gets the
  rule by default, with a `{ allowMapsSdkImports: true }` opt-out —
  `maps-core`/`resilience`/`types` get it for free with no code change on
  their side; `maps-2gis` is the one caller that opts out.
- `apps/web`, `apps/api`, `packages/db`, `packages/ui`,
  `packages/config` (own config, plain JS) each get the same rule added
  directly to their existing hand-rolled config, same duplication shape the
  hex-color rule already established.
- `.claude/rules/maps.md` gets a note that this is now lint-enforced, not
  convention-only.

## Requirements / acceptance criteria

- Every package/app except `maps-2gis` rejects an import matching `*2gis*`.
- `maps-2gis` itself is unaffected (it's expected to eventually import a
  real SDK).
- Proven to actually fire, not just "no errors today" (which could mean the
  rule silently isn't wired) — temporarily add a violating import, confirm
  `eslint` fails on it, then remove it.
- `pnpm turbo run lint` stays clean across the whole repo (no real violation
  exists).

## Planned files

- `packages/config/eslint/node-library.js` — add the rule + opt-out option.
- `packages/maps-2gis/eslint.config.mjs` — opt out.
- `apps/web/eslint.config.mjs`, `apps/api/eslint.config.mjs`,
  `packages/db/eslint.config.mjs`, `packages/ui/eslint.config.mjs`,
  `packages/config/eslint.config.mjs` — add the same rule directly.
- `.claude/rules/maps.md` — note lint enforcement.
- `docs/tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`.

## Implementation progress

- [x] Extended `nodeLibraryConfig()`.
- [x] Updated the 5 hand-rolled configs + `maps-2gis`'s opt-out.
- [x] Proved the rule fires (temporary violation under `apps/web`, reverted)
      and that the opt-out works (same violation under `maps-2gis`, passed).
- [x] `pnpm turbo run lint typecheck` clean.
- [x] Updated `.claude/rules/maps.md` + context docs.

## Validation results

`pnpm turbo run lint typecheck` — 17/17 tasks successful across all 9
workspace members. Manual proof: a scratch `import { something } from
'@2gis/mapgl'` under `apps/web/src/lib/` made `eslint` fail with this rule's
exact message; the identical scratch file under `packages/maps-2gis/src/`
passed (only the pre-existing `no-console` warning). Both scratch files
deleted, never committed.

## Discovered issues

None new.

## Final result

CR-056 is complete. `no-restricted-imports` (`group: ['*2gis*']`) now runs on
every workspace member except `packages/maps-2gis` — added once to
`packages/config`'s `nodeLibraryConfig()` (its four consumers get it for
free, `maps-2gis` opts out via `allowMapsSdkImports: true`) and hand-added
to the five configs that don't use that factory. No 2GIS SDK package exists
anywhere yet, so this ships as pure preventative infrastructure (same shape
as `packages/resilience`, CR-049) with zero current violations — proven to
actually fire via a temporary scratch import, not just assumed from "no
errors today." `.claude/rules/maps.md` records the enforcement. This
completes the Extensibility foundations section (CR-053/054/055/056 all
done). Next logical task: Security foundations (CR-058 auth rate limiting,
CR-060 password reset, CR-061 security headers).
