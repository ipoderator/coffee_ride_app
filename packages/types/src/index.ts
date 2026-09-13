// packages/types — shared domain/API types (`.claude/rules/architecture.md`).
//
// The two API *contract* shapes ADR-011 fixed before any endpoint existed
// (CR-007), plus the first domain type + auth contract, landing alongside
// `packages/db`'s first table (CR-011).
export * from './api/problem.js';
export * from './api/pagination.js';
export * from './api/auth.js';
export * from './domain/user.js';
