# Database Rules

PostgreSQL + Drizzle.

- Schema lives in `packages/db`.
- Every schema change requires a migration.
- Use foreign keys and constraints for invariants.
- Add indexes based on actual query patterns.
- Never manually alter production schema outside migrations.

Time (ADR-012):
- every timestamp column is `timestamptz`; bare `timestamp` is not used anywhere;
- wall-clock intent tied to a place (a ride's start) also stores an IANA timezone
  identifier, not a fixed UTC offset.

Core invariants:
- ride has an organizer;
- registration belongs to one user and ride;
- active duplicate registration is forbidden;
- capacity is enforced server-side;
- private participant data has restricted access.

Before schema changes inspect existing schema, relations, migrations, and tests.
