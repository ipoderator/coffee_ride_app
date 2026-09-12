---
name: new-cabinet-feature
description: Use when adding a new feature to the organizer dashboard or participant dashboard/cabinet — e.g. "add a feature to the organizer dashboard", "new participant cabinet feature", "add a widget to the dashboard", "build the waitlist management screen". Scaffolds the feature-module structure per ADR-009 so the new feature can't accidentally break existing dashboard features.
---

# New Cabinet Feature

Read first: `docs/decisions.md` ADR-009, `.claude/rules/extensibility.md` (full rules —
this skill is the checklist, not a replacement for reading it).

## Steps

1. **Identify the cabinet.** Organizer (`apps/web/src/features/organizer/`) or
   participant (`apps/web/src/features/participant/`). If the feature is genuinely shared
   between both, it likely belongs in `packages/ui` as a component, not duplicated.

2. **Scaffold the module**, not loose files:

   ```
   apps/web/src/features/<cabinet>/<feature-name>/
     components/
     hooks/
     api.ts       # typed calls for this feature only, using packages/types
     types.ts     # feature-local types only — shared ones import from packages/types
     <feature>.test.tsx
   ```

   Do not import another feature module's internals directly. If logic must be shared,
   put it in `packages/ui` or a cross-cutting hook, not a feature-to-feature import.

3. **Register, don't branch.** If the feature needs a nav entry, dashboard widget, or
   settings entry, add a descriptor (label, icon, route, order, required capability) to
   the existing registry list for that surface. Never add a new `if`/`case` branch inside
   a shared layout/nav component for a single feature.

4. **Contracts stay additive.** If the feature needs a new API endpoint, follow the
   `new-api-endpoint` skill. If it needs a new shared type or a new `packages/ui` prop,
   add it as new/optional — do not change or remove an existing field/prop without
   checking every current usage in _both_ cabinets first.

5. **Authorization.** If the feature exposes organizer-only or participant-only data,
   confirm the underlying API endpoint enforces that server-side
   (`.claude/rules/security.md`) — the feature module's UI must not be the only gate.

6. **Feature flag** if the feature is large, ships incrementally, or touches shared
   surfaces — see `.claude/rules/extensibility.md` for when this is warranted.

7. **Tests.** Cover the feature module itself. If it touched `packages/ui` or a shared
   contract, also run/check the other cabinet's tests — a shared-surface change is not
   done until both cabinets are verified.

8. **Update context** per `docs/definition-of-done.md`: `project-state.md`,
   `docs/changelog.md` (append), `docs/tasks.md` checkbox if this closes a CR.
