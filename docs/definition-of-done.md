# Definition of Done

A feature is complete only when all applicable items are true.

## Product

- [ ] Acceptance criteria are satisfied.
- [ ] Existing product behavior is preserved.

## Code

- [ ] Implementation follows architecture/rules.
- [ ] No unnecessary dependency was added.
- [ ] No unrelated refactor was introduced.

## Tests

- [ ] Relevant tests were added/updated.
- [ ] Relevant tests pass.
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Build passes when relevant.
- [ ] Critical E2E is updated when the user journey changed.

## Security

- [ ] Input validated server-side.
- [ ] Authorization checked server-side (never UI-only) — `.claude/rules/security.md`.
- [ ] No secrets exposed.
- [ ] Sensitive data minimized/protected.
- [ ] Auth-related changes checked against `.claude/rules/security.md` in full, not just
      this checklist.

## Extensibility (organizer/participant cabinets)

- [ ] New cabinet feature follows the module structure in
      `.claude/rules/extensibility.md`, not ad-hoc placement.
- [ ] Shared surfaces (dashboard nav/widgets) were extended via registration, not a new
      branch in a shared component.
- [ ] Changes to `packages/ui`/`packages/types`/API contracts are additive, or the
      breaking change is explicitly called out in `docs/changelog.md`.
- [ ] If the change touches shared components, both cabinets were checked, not just the
      one being worked on.

## Maps (when touched)

- [ ] No code outside `packages/maps-2gis` imports the 2GIS SDK directly —
      `.claude/rules/maps.md`.

## Persistence/API

- [ ] DB migration exists for schema changes.
- [ ] API contract is consistent.
- [ ] Transactions/constraints protect important invariants.

## Context

- [ ] `project-state.md` updated.
- [ ] `docs/changelog.md` has a new entry (append-only).
- [ ] `architecture-map.md` updated if needed.
- [ ] `known-issues.md` updated if needed.
- [ ] `docs/decisions.md` updated for architectural decisions.
- [ ] `tasks.md` updated.

## Git

- [ ] Diff reviewed.
- [ ] No unrelated files changed.
