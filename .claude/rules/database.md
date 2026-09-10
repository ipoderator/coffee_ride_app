# Database Rules

PostgreSQL + Drizzle.

- Schema lives in `packages/db`.
- Every schema change requires a migration.
- Use foreign keys and constraints for invariants.
- Add indexes based on actual query patterns.
- Never manually alter production schema outside migrations.

Core invariants:
- ride has an organizer;
- registration belongs to one user and ride;
- active duplicate registration is forbidden;
- capacity is enforced server-side;
- private participant data has restricted access.

Before schema changes inspect existing schema, relations, migrations, and tests.
