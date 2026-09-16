// packages/types — shared domain/API types (`.claude/rules/architecture.md`).
//
// The two API *contract* shapes ADR-011 fixed before any endpoint existed
// (CR-007), plus the first domain type + auth contract, landing alongside
// `packages/db`'s first table (CR-011).
export * from './api/problem.js';
export * from './api/pagination.js';
export * from './api/auth.js';
export * from './api/users.js';
export * from './api/organizers.js';
export * from './api/rides.js';
export * from './api/registrations.js';
export * from './api/notifications.js';
export * from './domain/user.js';
export * from './domain/organizer-profile.js';
export * from './domain/ride.js';
export * from './domain/route.js';
export * from './domain/stop.js';
export * from './domain/route-point.js';
export * from './domain/registration.js';
export * from './domain/waitlist-entry.js';
export * from './domain/ride-update.js';
export * from './domain/notification.js';
