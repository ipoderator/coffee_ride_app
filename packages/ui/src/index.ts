// packages/ui — reusable UI, shared between the organizer and participant
// cabinets (`.claude/rules/architecture.md`, ADR-009).
//
// The design tokens (CR-063, docs/design.md §3-§5/§12) live in `./tokens.css`
// (imported directly by consumers via the `ui/tokens.css` package export, not
// through this JS entry point — CSS has no TS module to re-export). This TS
// entry point stays empty, same "tooling first, content when there's a real
// consumer" discipline packages/db used for its zero domain tables (CR-004):
// the Russian formatter/terminology module (CR-064) and the first shared
// components (`MetricTile`, `StatusBadge`, ..., CR-065/CR-066) land next,
// before apps/web has a real screen to put them on (CR-011). Read
// `docs/design.md` before adding the first real export here.
export {};
