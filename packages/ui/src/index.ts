// packages/ui — reusable UI, shared between the organizer and participant
// cabinets (`.claude/rules/architecture.md`, ADR-009).
//
// The design tokens (CR-063, docs/design.md §3-§5/§12) live in `./tokens.css`
// (imported directly by consumers via the `ui/tokens.css` package export, not
// through this JS entry point — CSS has no TS module to re-export).
//
// Russian number/unit formatters and UI terminology mapping (CR-064, docs/design.md
// §7/§13) are this entry point's first real exports. The first shared components
// (`MetricTile`, `StatusBadge`, ..., CR-065/CR-066) land next, before apps/web has a
// real screen to put them on (CR-011). Read `docs/design.md` before adding to either.
export * from './format';
export * from './terminology';
