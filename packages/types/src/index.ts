// packages/types — shared domain/API types (`.claude/rules/architecture.md`).
//
// No domain entity types yet (User, Ride, Route, ...): none of them exist in
// `packages/db` yet either (CR-004 shipped zero domain tables by design).
// The first domain type lands alongside its first table, starting CR-011 —
// mirroring `packages/db`'s own "tooling first, content when there's a real
// consumer" discipline. What's here now is the two API *contract* shapes
// ADR-011 already fixed before any endpoint exists, so their first real use
// imports the shared type rather than re-deriving it locally (as
// `apps/api`'s error handler did until this task).
export * from './api/problem.js';
export * from './api/pagination.js';
