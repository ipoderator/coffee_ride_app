# Extensibility Rules — Organizer & Participant Cabinets

See `docs/decisions.md` → ADR-009. Both cabinets will keep growing after MVP. These rules
exist so adding feature N+1 does not risk breaking features 1..N.

## Feature modules, not shared mega-components

Each cabinet feature is a self-contained module:

```
apps/web/src/features/organizer/<feature-name>/
apps/web/src/features/participant/<feature-name>/
  components/
  hooks/
  api.ts        # typed client calls for this feature only
  types.ts      # feature-local types (import shared ones from packages/types)
  <feature>.test.tsx
```

A feature module may depend on `packages/ui`, `packages/types`, and cross-cutting
utilities — it must not depend on another feature module's internals. If two features
need to share logic, extract that logic into `packages/ui` or a shared hook, not into a
direct feature-to-feature import.

## Registration over branching

Things that must show every feature (dashboard nav, a widget grid, a settings list) are
built as a registry: each feature exports a small descriptor (label, icon, route, order,
required capability) and the shared surface renders from the collected list.

Do NOT hard-code a new `if`/`case` branch in a shared layout/nav component per feature.
That pattern is exactly how an unrelated new feature ends up breaking an existing one's
render.

## Contracts change additively

`packages/types` (shared types/DTOs) and the REST API (`docs/api.md`):

- prefer adding new optional fields/params/endpoints over changing existing ones;
- if an existing field's meaning or an endpoint's behavior must change in a
  backward-incompatible way, that is a breaking change and needs:
  1. a note in `docs/changelog.md` explaining what breaks and why;
  2. either a new endpoint/version, or a coordinated update of every caller in the same
     change (do not leave half the app on the old contract);
- `packages/ui` shared components: new props must be optional with sensible defaults.
  Removing or repurposing an existing prop requires checking every current usage across
  both cabinets first (they likely share primitives — buttons, cards, form fields, etc.).

## Feature flags for risky rollouts

When a new cabinet feature is large, touches shared surfaces, or ships incrementally
across multiple sessions/PRs, gate it behind a simple feature flag (a config value, not a
new deployment) so it can be hidden without a hotfix if something breaks. Remove the flag
once the feature is stable — flags are not meant to accumulate indefinitely.

## Regression discipline

Any change to `packages/ui`, `packages/types`, or a shared API contract must be checked
against both cabinets before being considered done — not just the cabinet you were working
on. This is a normal part of `/review` and `/test` for such changes, not an extra step to
skip under time pressure.
