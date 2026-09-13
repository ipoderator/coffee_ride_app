// packages/ui — reusable UI, shared between the organizer and participant
// cabinets (`.claude/rules/architecture.md`, ADR-009).
//
// The design tokens (CR-063, docs/design.md §3-§5/§12) live in `./tokens.css`
// (imported directly by consumers via the `ui/tokens.css` package export, not
// through this JS entry point — CSS has no TS module to re-export).
//
// Russian number/unit formatters and UI terminology mapping (CR-064, docs/design.md
// §7/§13), the shared `cn` class-name helper, the metric presentation components
// (`MetricTile`/`MetricRow`/`StatusBadge`/`DifficultyScale`, CR-065, §6), and the
// shared state primitives (`Skeleton`/`EmptyState`/`ErrorState`, CR-066, §10) are this
// entry point's exports so far — the last Design-foundations task before apps/web has
// a real screen to put any of this on (CR-011). Read `docs/design.md` before adding to
// any of these.
export * from './format';
export * from './terminology';
export * from './lib/cn';
export * from './components/MetricTile';
export * from './components/MetricRow';
export * from './components/StatusBadge';
export * from './components/DifficultyScale';
export * from './components/Skeleton';
export * from './components/EmptyState';
export * from './components/ErrorState';
