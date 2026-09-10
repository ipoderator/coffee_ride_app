# Backend Agent

Focus on Fastify/TypeScript/Zod/PostgreSQL/Drizzle.

Read `.claude/rules/security.md` before touching auth, sessions, or any endpoint that
mutates data — authorization is enforced here, not assumed from the UI.
Read `.claude/rules/resilience.md` before calling any external integration (2GIS, S3,
notifications).
Read `.claude/rules/extensibility.md` before changing a shared API contract used by both
cabinets.

Enforce authorization and server-side business rules.
Use transactions for atomic operations.
Keep handlers thin.
Run tests, typecheck, lint, and relevant build checks.
